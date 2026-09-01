import logging
from sqlalchemy.orm import Session
from app.models import Transaction, TransferLink, TransactionType

logger = logging.getLogger(__name__)

def reconcile_transfers(db: Session, user_id: str):
    """
    Find internal transfers between a user's accounts, and detect refunds.
    Rules:
    - Transfer: One is negative (withdrawal), one is positive (deposit) across different accounts. Date <= 3 days. Exact amounts.
    - Refund: Negative followed by positive in the SAME account. Date <= 15 days. Exact amounts.
    """
    logger.info(f"Starting reconciliation for user {user_id}")

    # Get unlinked transactions
    linked_tx_ids = set()
    for link in db.query(TransferLink).all():
        linked_tx_ids.add(link.from_transaction_id)
        linked_tx_ids.add(link.to_transaction_id)

    # 1. Internal Transfers (Cross-Account)
    withdrawals = db.query(Transaction).join(Transaction.account).filter(
        Transaction.account.has(user_id=user_id),
        Transaction.amount < 0,
        Transaction.is_excluded_from_spending == False
    ).order_by(Transaction.date.asc()).all()

    deposits = db.query(Transaction).join(Transaction.account).filter(
        Transaction.account.has(user_id=user_id),
        Transaction.amount > 0,
        Transaction.is_excluded_from_spending == False
    ).order_by(Transaction.date.asc()).all()
    
    links_created = 0

    for w in withdrawals:
        if w.id in linked_tx_ids: continue
        w_amt = abs(w.amount)
        for d in deposits:
            if d.id in linked_tx_ids: continue
            
            # Must be different accounts for an internal transfer
            if w.account_id != d.account_id and abs(d.amount) == w_amt:
                date_diff = abs((w.date - d.date).days)
                if date_diff <= 3:
                    if w.reference_id and d.reference_id and w.reference_id != d.reference_id:
                        continue # strict UTR mismatch
                    
                    # Create Link
                    link = TransferLink(
                        from_transaction_id=w.id,
                        to_transaction_id=d.id,
                        amount=w_amt,
                        transfer_date=w.date
                    )
                    db.add(link)
                    
                    # Exclude from spending
                    w.transaction_type = TransactionType.TRANSFER_INTERNAL
                    w.is_excluded_from_spending = True
                    d.transaction_type = TransactionType.TRANSFER_INTERNAL
                    d.is_excluded_from_spending = True
                    
                    linked_tx_ids.add(w.id)
                    linked_tx_ids.add(d.id)
                    links_created += 1
                    break
    
    # 2. Refund Detection (Same-Account Reversals)
    for w in withdrawals:
        if w.id in linked_tx_ids: continue
        w_amt = abs(w.amount)
        for d in deposits:
            if d.id in linked_tx_ids: continue
            
            # Must be same account for a refund
            if w.account_id == d.account_id and abs(d.amount) == w_amt:
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
