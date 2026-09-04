from datetime import datetime, timezone
from decimal import Decimal
from collections import defaultdict
import logging
import uuid
from sqlalchemy.orm import Session, joinedload
from app.models import (
    Transaction, TransferLink, TransactionType, FinancialEvent,
    FinancialEventType, ReviewState, AccountSubtype
)

logger = logging.getLogger(__name__)

def reconcile_transfers(db: Session, user_id: str):
    """
    Find internal transfers between a user's accounts, and detect refunds.
    Rules:
    - Credit Card Payment: Cross-account with one credit card. Date <= 7 days. Exact amounts.
    - Bank Transfer: Cross-account between bank accounts. Date <= 3 days. Exact amounts.
    - Refund: Negative followed by positive in the SAME account. Date <= 15 days. Exact amounts.
    """
    logger.info(f"Starting reconciliation for user {user_id}")

    if isinstance(user_id, str):
        try:
            user_uuid = uuid.UUID(user_id)
        except Exception:
            user_uuid = user_id
    else:
        user_uuid = user_id

    # 1. Get already linked transactions scoped strictly to this user
    linked_tx_ids = set()
    user_links = db.query(TransferLink.from_transaction_id, TransferLink.to_transaction_id).filter(
        TransferLink.user_id == user_uuid
    ).all()
    for f_id, t_id in user_links:
        if f_id:
            linked_tx_ids.add(f_id)
        if t_id:
            linked_tx_ids.add(t_id)

    # 2. Fetch unlinked withdrawals and deposits with eager-loaded accounts (prevents N+1)
    w_query = db.query(Transaction).options(joinedload(Transaction.account)).filter(
        Transaction.user_id == user_uuid,
        Transaction.amount < 0
    )
    if linked_tx_ids:
        w_query = w_query.filter(~Transaction.id.in_(linked_tx_ids))
    withdrawals = w_query.order_by(Transaction.date.asc()).all()

    d_query = db.query(Transaction).options(joinedload(Transaction.account)).filter(
        Transaction.user_id == user_uuid,
        Transaction.amount > 0
    )
    if linked_tx_ids:
        d_query = d_query.filter(~Transaction.id.in_(linked_tx_ids))
    deposits = d_query.order_by(Transaction.date.asc()).all()
    
    # 3. Hash bucket deposits by exact amount for O(1) candidate lookup
    deposits_by_amount = defaultdict(list)
    for d in deposits:
        deposits_by_amount[abs(d.amount)].append(d)

    links_created = 0

    # 4. Internal Transfers & Card Payments (Cross-Account)
    for w in withdrawals:
        if w.id in linked_tx_ids:
            continue
        w_amt = abs(w.amount)
        candidates = deposits_by_amount.get(w_amt, [])
        for d in candidates:
            if d.id in linked_tx_ids:
                continue
            
            # Must be different accounts for an internal transfer / card payment
            if w.account_id != d.account_id:
                is_cc = (
                    (w.account and w.account.subtype == AccountSubtype.CREDIT_CARD) or
                    (d.account and d.account.subtype == AccountSubtype.CREDIT_CARD)
                )
                max_days = 7 if is_cc else 3
                date_diff = abs((w.date - d.date).days)
                if date_diff <= max_days:
                    if w.reference_id and d.reference_id and w.reference_id != d.reference_id:
                        continue # strict UTR mismatch
                    
                    # Create FinancialEvent
                    evt_type = FinancialEventType.CARD_PAYMENT if is_cc else FinancialEventType.TRANSFER
                    subcat = "Credit Card Payment" if is_cc else "Internal Transfer"
                    transfer_dt = min(w.date, d.date)

                    event = FinancialEvent(
                        user_id=w.user_id,
                        event_type=evt_type,
                        review_state=ReviewState.VERIFIED,
                        occurred_at=datetime.combine(transfer_dt, datetime.min.time(), tzinfo=timezone.utc),
                        economic_amount=Decimal("0.00"),
                        source_type="AUTO_RECONCILIATION",
                        verified=True
                    )
                    db.add(event)
                    db.flush()

                    # Create Link
                    link = TransferLink(
                        user_id=w.user_id,
                        from_transaction_id=w.id,
                        to_transaction_id=d.id,
                        amount=w_amt,
                        transfer_date=transfer_dt
                    )
                    db.add(link)
                    
                    # Exclude from spending and set types
                    w.transaction_type = TransactionType.CC_BILL_PAYMENT if is_cc else TransactionType.TRANSFER_INTERNAL
                    w.category = "Transfer"
                    w.subcategory = subcat
                    w.is_excluded_from_spending = True
                    w.financial_event_id = event.id
                    w.review_state = ReviewState.VERIFIED
                    w.verified = True

                    d.transaction_type = TransactionType.CC_PAYMENT_RECEIVED if is_cc else TransactionType.TRANSFER_INTERNAL
                    d.category = "Transfer"
                    d.subcategory = subcat
                    d.is_excluded_from_spending = True
                    d.financial_event_id = event.id
                    d.review_state = ReviewState.VERIFIED
                    d.verified = True
                    
                    linked_tx_ids.add(w.id)
                    linked_tx_ids.add(d.id)
                    links_created += 1
                    break
    
    # 5. Refund Detection (Same-Account Reversals)
    for w in withdrawals:
        if w.id in linked_tx_ids:
            continue
        w_amt = abs(w.amount)
        candidates = deposits_by_amount.get(w_amt, [])
        for d in candidates:
            if d.id in linked_tx_ids:
                continue
            
            # Must be same account for a refund
            if w.account_id == d.account_id:
                date_diff = (d.date - w.date).days
                if 0 <= date_diff <= 15:
                    w.transaction_type = TransactionType.REFUND_REVERSAL
                    w.is_excluded_from_spending = True
                    d.transaction_type = TransactionType.REFUND_REVERSAL
                    d.is_excluded_from_spending = True
                    
                    linked_tx_ids.add(w.id)
                    linked_tx_ids.add(d.id)
                    links_created += 1
                    break
                    
    db.commit()
    logger.info(f"Reconciliation complete. Created/Updated {links_created} transfer/refund links.")
    return links_created
