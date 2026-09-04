import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models import (
    Transaction, Account, TransferLink, FinancialEvent,
    FinancialEventType, TransactionType, PaymentRail, ReviewState,
    AccountSubtype
)

def create_atomic_transfer(
    db: Session,
    user_id: uuid.UUID,
    from_account_id: uuid.UUID,
    to_account_id: uuid.UUID,
    amount: Decimal,
    transfer_date: date,
    description: Optional[str] = None,
    reference_id: Optional[str] = None
) -> TransferLink:
    """
    Creates an atomic double-entry transfer pair between two accounts.
    Both legs are tagged TRANSFER_INTERNAL with is_excluded_from_spending = True
    and bound together via a TransferLink and a zero-economic-impact FinancialEvent.
    """
    if from_account_id == to_account_id:
        raise HTTPException(status_code=400, detail="Source and destination accounts must be distinct.")
        
    amount = abs(Decimal(str(amount)))
    if amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Transfer amount must be strictly positive.")

    from_account = db.query(Account).filter(Account.id == from_account_id, Account.user_id == user_id).first()
    to_account = db.query(Account).filter(Account.id == to_account_id, Account.user_id == user_id).first()

    if not from_account or not to_account:
        raise HTTPException(status_code=404, detail="Source or destination account not found.")

    desc_out = description or f"Transfer to {to_account.name}"
    desc_in = description or f"Transfer from {from_account.name}"
    ref = reference_id or f"TXF-{uuid.uuid4().hex[:8].upper()}"

    # 1. Create FinancialEvent (zero economic impact on net worth)
    event = FinancialEvent(
        user_id=user_id,
        event_type=FinancialEventType.TRANSFER,
        review_state=ReviewState.VERIFIED,
        occurred_at=datetime.combine(transfer_date, datetime.min.time(), tzinfo=timezone.utc),
        economic_amount=Decimal("0.00"),
        source_type="USER_TRANSFER",
        verified=True
    )
    db.add(event)
    db.flush()

    # 2. Outflow leg (debit from source)
    outflow_tx = Transaction(
        user_id=user_id,
        account_id=from_account_id,
        date=transfer_date,
        raw_narration=f"INTERNAL TRANSFER OUT TO {to_account.name} (REF: {ref})",
        description=desc_out,
        category="Transfer",
        subcategory="Internal Transfer",
        transaction_type=TransactionType.TRANSFER_INTERNAL,
        payment_rail=PaymentRail.IMPS,
        review_state=ReviewState.VERIFIED,
        amount=-amount,
        reference_id=ref,
        is_excluded_from_spending=True,
        verified=True,
        financial_event_id=event.id
    )
    db.add(outflow_tx)
    db.flush()

    # 3. Inflow leg (credit to destination)
    inflow_tx = Transaction(
        user_id=user_id,
        account_id=to_account_id,
        date=transfer_date,
        raw_narration=f"INTERNAL TRANSFER IN FROM {from_account.name} (REF: {ref})",
        description=desc_in,
        category="Transfer",
        subcategory="Internal Transfer",
        transaction_type=TransactionType.TRANSFER_INTERNAL,
        payment_rail=PaymentRail.IMPS,
        review_state=ReviewState.VERIFIED,
        amount=amount,
        reference_id=ref,
        is_excluded_from_spending=True,
        verified=True,
        financial_event_id=event.id
    )
    db.add(inflow_tx)
    db.flush()

    # 4. Create TransferLink binding both legs
    link = TransferLink(
        user_id=user_id,
        from_transaction_id=outflow_tx.id,
        to_transaction_id=inflow_tx.id,
        amount=amount,
        transfer_date=transfer_date
    )
    db.add(link)

    # 5. Update account balances atomically
    # Source account: asset balance decreases; credit card balance increases (more debt)
    if from_account.subtype in [AccountSubtype.SAVINGS, AccountSubtype.CURRENT]:
        from_account.balance -= amount
    else:
        from_account.balance += amount

    # Destination account: asset balance increases; credit card balance decreases (less debt)
    if to_account.subtype in [AccountSubtype.SAVINGS, AccountSubtype.CURRENT]:
        to_account.balance += amount
    else:
        to_account.balance -= amount

    db.commit()
    db.refresh(link)
    return link

def delete_atomic_transfer(db: Session, user_id: uuid.UUID, transfer_link_id: uuid.UUID) -> Dict[str, Any]:
    """
    Deletes an internal transfer pair atomically and restores both account balances.
    """
    link = db.query(TransferLink).filter(
        TransferLink.id == transfer_link_id,
        TransferLink.user_id == user_id
    ).first()

    if not link:
        # Fallback: check if user owns the transactions
        link = db.query(TransferLink).join(
            Transaction, Transaction.id == TransferLink.from_transaction_id
        ).filter(
            TransferLink.id == transfer_link_id,
            Transaction.user_id == user_id
        ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Transfer pair not found.")

    outflow_tx = db.query(Transaction).filter(Transaction.id == link.from_transaction_id).first()
    inflow_tx = db.query(Transaction).filter(Transaction.id == link.to_transaction_id).first()

    # Revert source balance
    if outflow_tx and outflow_tx.account:
        acct = outflow_tx.account
        if acct.subtype in [AccountSubtype.SAVINGS, AccountSubtype.CURRENT]:
            acct.balance -= outflow_tx.amount # amount is negative, so subtracting adds it back
        else:
            acct.balance += outflow_tx.amount

    # Revert destination balance
    if inflow_tx and inflow_tx.account:
        acct = inflow_tx.account
        if acct.subtype in [AccountSubtype.SAVINGS, AccountSubtype.CURRENT]:
            acct.balance -= inflow_tx.amount # amount is positive, so subtracting removes it
        else:
            acct.balance += inflow_tx.amount

    # Delete transactions and event
    event_id = outflow_tx.financial_event_id if outflow_tx else None

    db.delete(link)
    if outflow_tx:
        db.delete(outflow_tx)
    if inflow_tx:
        db.delete(inflow_tx)
    if event_id:
        event = db.query(FinancialEvent).filter(FinancialEvent.id == event_id).first()
        if event:
            db.delete(event)

    db.commit()
    return {"message": "Transfer pair successfully deleted and account balances restored."}

def get_user_transfers(db: Session, user_id: uuid.UUID) -> List[Dict[str, Any]]:
    """
    Lists all atomic transfers with source and destination details.
    """
    links = db.query(TransferLink).join(
        Transaction, Transaction.id == TransferLink.from_transaction_id
    ).filter(Transaction.user_id == user_id).order_by(TransferLink.transfer_date.desc()).all()

    result = []
    for link in links:
        from_tx = link.from_transaction
        to_tx = link.to_transaction
        result.append({
            "id": str(link.id),
            "amount": float(link.amount),
            "date": link.transfer_date.isoformat(),
            "from_account_id": str(from_tx.account_id) if from_tx else None,
            "from_account_name": from_tx.account.name if from_tx and from_tx.account else "Unknown",
            "to_account_id": str(to_tx.account_id) if to_tx else None,
            "to_account_name": to_tx.account.name if to_tx and to_tx.account else "Unknown",
            "from_transaction_id": str(link.from_transaction_id),
            "to_transaction_id": str(link.to_transaction_id),
            "description": from_tx.description if from_tx else None
        })
    return result

def link_existing_transactions(
    db: Session,
    user_id: uuid.UUID,
    from_transaction_id: uuid.UUID,
    to_transaction_id: uuid.UUID,
    custom_amount: Optional[Decimal] = None
) -> TransferLink:
    """
    Manually links two EXISTING transactions (e.g. Bank Account CC Payment Outflow and
    Credit Card Inward Payment Credit) without duplicating transactions or altering
    account balances.
    """
    if from_transaction_id == to_transaction_id:
        raise HTTPException(status_code=400, detail="Cannot link a transaction to itself.")

    from_tx = db.query(Transaction).filter(Transaction.id == from_transaction_id, Transaction.user_id == user_id).first()
    to_tx = db.query(Transaction).filter(Transaction.id == to_transaction_id, Transaction.user_id == user_id).first()

    if not from_tx or not to_tx:
        raise HTTPException(status_code=404, detail="One or both transactions not found.")

    if from_tx.account_id == to_tx.account_id:
        raise HTTPException(status_code=400, detail="Transactions must belong to distinct accounts for transfer/card payment linking.")

    # Orient so that outflow_tx has negative amount and inflow_tx has positive amount
    if from_tx.amount > 0 and to_tx.amount < 0:
        outflow_tx, inflow_tx = to_tx, from_tx
    elif from_tx.amount < 0 and to_tx.amount > 0:
        outflow_tx, inflow_tx = from_tx, to_tx
    else:
        raise HTTPException(
            status_code=400, 
            detail="One transaction must be an outflow/debit (negative amount) and the other an inflow/credit (positive amount)."
        )

    # Check if either transaction is already linked
    existing_link = db.query(TransferLink).filter(
        (TransferLink.from_transaction_id.in_([outflow_tx.id, inflow_tx.id])) |
        (TransferLink.to_transaction_id.in_([outflow_tx.id, inflow_tx.id]))
    ).first()
    if existing_link:
        raise HTTPException(
            status_code=400,
            detail="One or both transactions are already linked to an existing transfer. Unlink them first."
        )

    transfer_amt = abs(Decimal(str(custom_amount))) if custom_amount is not None else abs(outflow_tx.amount)
    transfer_dt = min(outflow_tx.date, inflow_tx.date)

    # Determine if this involves a credit card
    is_cc_payment = (
        (outflow_tx.account and outflow_tx.account.subtype == AccountSubtype.CREDIT_CARD) or
        (inflow_tx.account and inflow_tx.account.subtype == AccountSubtype.CREDIT_CARD)
    )

    evt_type = FinancialEventType.CARD_PAYMENT if is_cc_payment else FinancialEventType.TRANSFER
    subcat = "Credit Card Payment" if is_cc_payment else "Internal Transfer"

    # Create zero-economic-impact FinancialEvent
    event = FinancialEvent(
        user_id=user_id,
        event_type=evt_type,
        review_state=ReviewState.VERIFIED,
        occurred_at=datetime.combine(transfer_dt, datetime.min.time(), tzinfo=timezone.utc),
        economic_amount=Decimal("0.00"),
        source_type="MANUAL_TRANSFER_LINK",
        verified=True
    )
    db.add(event)
    db.flush()

    # Tag outflow transaction
    outflow_tx.transaction_type = TransactionType.CC_BILL_PAYMENT if is_cc_payment else TransactionType.TRANSFER_INTERNAL
    outflow_tx.category = "Transfer"
    outflow_tx.subcategory = subcat
    outflow_tx.is_excluded_from_spending = True
    outflow_tx.review_state = ReviewState.VERIFIED
    outflow_tx.verified = True
    outflow_tx.financial_event_id = event.id

    # Tag inflow transaction
    inflow_tx.transaction_type = TransactionType.CC_PAYMENT_RECEIVED if is_cc_payment else TransactionType.TRANSFER_INTERNAL
    inflow_tx.category = "Transfer"
    inflow_tx.subcategory = subcat
    inflow_tx.is_excluded_from_spending = True
    inflow_tx.review_state = ReviewState.VERIFIED
    inflow_tx.verified = True
    inflow_tx.financial_event_id = event.id

    # Create TransferLink record
    link = TransferLink(
        user_id=user_id,
        from_transaction_id=outflow_tx.id,
        to_transaction_id=inflow_tx.id,
        amount=transfer_amt,
        transfer_date=transfer_dt
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def unlink_transactions(
    db: Session,
    user_id: uuid.UUID,
    transfer_link_id: uuid.UUID
) -> Dict[str, Any]:
    """
    Safely breaks a TransferLink between two transactions without deleting either transaction
    or altering account balances. Reverts both transactions to standard individual classifications.
    """
    link = db.query(TransferLink).filter(
        TransferLink.id == transfer_link_id,
        (TransferLink.user_id == user_id) | (TransferLink.user_id.is_(None))
    ).first()

    if not link:
        # Fallback check ownership of from_transaction
        link = db.query(TransferLink).join(
            Transaction, Transaction.id == TransferLink.from_transaction_id
        ).filter(
            TransferLink.id == transfer_link_id,
            Transaction.user_id == user_id
        ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Transfer link not found.")

    outflow_tx = link.from_transaction
    inflow_tx = link.to_transaction

    fe_id = outflow_tx.financial_event_id if outflow_tx else (inflow_tx.financial_event_id if inflow_tx else None)

    if outflow_tx:
        outflow_tx.is_excluded_from_spending = False
        outflow_tx.transaction_type = TransactionType.EXPENSE
        outflow_tx.category = "Utilities"
        outflow_tx.subcategory = "Credit Card Payment"
        outflow_tx.financial_event_id = None

    if inflow_tx:
        inflow_tx.is_excluded_from_spending = False
        inflow_tx.transaction_type = TransactionType.INCOME
        inflow_tx.category = "Income"
        inflow_tx.subcategory = "Transfer Reversal"
        inflow_tx.financial_event_id = None

    db.delete(link)

    if fe_id:
        fe = db.query(FinancialEvent).filter(FinancialEvent.id == fe_id).first()
        if fe and fe.source_type in ["MANUAL_TRANSFER_LINK", "USER_TRANSFER"]:
            db.delete(fe)

    db.commit()
    return {"message": "Transactions successfully unlinked. Spending classification restored."}


def edit_transfer_link(
    db: Session,
    user_id: uuid.UUID,
    transfer_link_id: uuid.UUID,
    current_transaction_id: Optional[uuid.UUID] = None,
    new_counterpart_transaction_id: Optional[uuid.UUID] = None,
    new_amount: Optional[Decimal] = None,
    new_transfer_date: Optional[date] = None
) -> Dict[str, Any]:
    """
    Allows editing an existing TransferLink:
    - Modifying amount or transfer date
    - Swapping counterpart transaction to another valid transaction
    """
    link = db.query(TransferLink).filter(
        TransferLink.id == transfer_link_id,
        (TransferLink.user_id == user_id) | (TransferLink.user_id.is_(None))
    ).first()

    if not link:
        link = db.query(TransferLink).join(
            Transaction, Transaction.id == TransferLink.from_transaction_id
        ).filter(
            TransferLink.id == transfer_link_id,
            Transaction.user_id == user_id
        ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Transfer link not found.")

    if new_amount is not None:
        link.amount = abs(Decimal(str(new_amount)))

    if new_transfer_date is not None:
        link.transfer_date = new_transfer_date

    # If swapping counterpart transaction
    if new_counterpart_transaction_id and current_transaction_id:
        if new_counterpart_transaction_id == current_transaction_id:
            raise HTTPException(status_code=400, detail="Counterpart cannot be the same as current transaction.")

        new_cp = db.query(Transaction).filter(
            Transaction.id == new_counterpart_transaction_id,
            Transaction.user_id == user_id
        ).first()
        if not new_cp:
            raise HTTPException(status_code=404, detail="New counterpart transaction not found.")

        # Identify which leg was the old counterpart
        if link.from_transaction_id == current_transaction_id:
            # keeping from_transaction (outflow), replacing to_transaction (inflow)
            old_cp = link.to_transaction
            kept_tx = link.from_transaction

            if new_cp.amount <= 0:
                raise HTTPException(status_code=400, detail="New counterpart must be an inflow/credit (positive amount).")
            if new_cp.account_id == kept_tx.account_id:
                raise HTTPException(status_code=400, detail="New counterpart must be from a different account.")

            # Restore old counterpart
            if old_cp:
                old_cp.is_excluded_from_spending = False
                old_cp.transaction_type = TransactionType.INCOME
                old_cp.category = "Income"
                old_cp.financial_event_id = None

            # Setup new counterpart
            is_cc = (kept_tx.account and kept_tx.account.subtype == AccountSubtype.CREDIT_CARD) or (new_cp.account and new_cp.account.subtype == AccountSubtype.CREDIT_CARD)
            new_cp.is_excluded_from_spending = True
            new_cp.transaction_type = TransactionType.CC_PAYMENT_RECEIVED if is_cc else TransactionType.TRANSFER_INTERNAL
            new_cp.category = "Transfer"
            new_cp.subcategory = "Credit Card Payment" if is_cc else "Internal Transfer"
            new_cp.review_state = ReviewState.VERIFIED
            new_cp.verified = True
            new_cp.financial_event_id = kept_tx.financial_event_id

            link.to_transaction_id = new_cp.id
        elif link.to_transaction_id == current_transaction_id:
            # keeping to_transaction (inflow), replacing from_transaction (outflow)
            old_cp = link.from_transaction
            kept_tx = link.to_transaction

            if new_cp.amount >= 0:
                raise HTTPException(status_code=400, detail="New counterpart must be an outflow/debit (negative amount).")
            if new_cp.account_id == kept_tx.account_id:
                raise HTTPException(status_code=400, detail="New counterpart must be from a different account.")

            # Restore old counterpart
            if old_cp:
                old_cp.is_excluded_from_spending = False
                old_cp.transaction_type = TransactionType.EXPENSE
                old_cp.category = "Utilities"
                old_cp.financial_event_id = None

            # Setup new counterpart
            is_cc = (kept_tx.account and kept_tx.account.subtype == AccountSubtype.CREDIT_CARD) or (new_cp.account and new_cp.account.subtype == AccountSubtype.CREDIT_CARD)
            new_cp.is_excluded_from_spending = True
            new_cp.transaction_type = TransactionType.CC_BILL_PAYMENT if is_cc else TransactionType.TRANSFER_INTERNAL
            new_cp.category = "Transfer"
            new_cp.subcategory = "Credit Card Payment" if is_cc else "Internal Transfer"
            new_cp.review_state = ReviewState.VERIFIED
            new_cp.verified = True
            new_cp.financial_event_id = kept_tx.financial_event_id

            link.from_transaction_id = new_cp.id

    db.commit()
    db.refresh(link)
    return {
        "message": "Transfer link successfully updated.",
        "link_id": str(link.id),
        "amount": float(link.amount),
        "date": str(link.transfer_date)
    }


def find_payment_match_candidates(
    db: Session,
    user_id: uuid.UUID,
    transaction_id: uuid.UUID,
    max_candidates: int = 10
) -> List[Dict[str, Any]]:
    """
    Finds and ranks candidate transactions to link with the given transaction.
    If source is negative (outflow), searches positive (inflow) in other accounts.
    If source is positive (inflow), searches negative (outflow) in other accounts.
    """
    from datetime import timedelta

    source_tx = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.user_id == user_id
    ).first()

    if not source_tx:
        raise HTTPException(status_code=404, detail="Transaction not found.")

    is_outflow = source_tx.amount < 0
    source_amt = abs(source_tx.amount)
    source_date = source_tx.date
    source_desc = (source_tx.raw_narration or source_tx.description or "").upper()
    source_ref = (source_tx.reference_id or source_tx.utr_number or "").strip().upper()

    # Query unlinked transactions in different accounts
    # Subquery of already linked transaction IDs
    linked_ids_subq = db.query(TransferLink.from_transaction_id).union(
        db.query(TransferLink.to_transaction_id)
    )

    query = db.query(Transaction).join(Transaction.account).filter(
        Transaction.user_id == user_id,
        Transaction.account_id != source_tx.account_id,
        ~Transaction.id.in_(linked_ids_subq)
    )

    if is_outflow:
        query = query.filter(Transaction.amount > 0)
    else:
        query = query.filter(Transaction.amount < 0)

    # Allow up to ±20 days date window
    start_date = source_date - timedelta(days=20)
    end_date = source_date + timedelta(days=20)
    candidates = query.filter(Transaction.date.between(start_date, end_date)).all()

    results = []
    for c in candidates:
        c_amt = abs(c.amount)
        c_desc = (c.raw_narration or c.description or "").upper()
        c_ref = (c.reference_id or c.utr_number or "").strip().upper()
        days_diff = abs((c.date - source_date).days)

        score = 0
        reasons = []

        # 1. Amount match
        if c_amt == source_amt:
            score += 50
            reasons.append("Exact amount match (100%)")
        else:
            diff_pct = abs(c_amt - source_amt) / max(source_amt, Decimal("1.0"))
            if diff_pct <= Decimal("0.02"):
                score += 25
                reasons.append("Near amount match (<=2% variance)")
            elif diff_pct <= Decimal("0.05"):
                score += 15
                reasons.append("Near amount match (<=5% variance)")

        # 2. Date proximity
        if days_diff == 0:
            score += 30
            reasons.append("Same day transaction")
        elif days_diff <= 2:
            score += 25
            reasons.append(f"Within {days_diff} days")
        elif days_diff <= 5:
            score += 18
            reasons.append(f"Within {days_diff} days")
        elif days_diff <= 10:
            score += 10
            reasons.append(f"Within {days_diff} days")
        else:
            score += 5

        # 3. UTR / Ref match
        if source_ref and c_ref and (source_ref == c_ref or source_ref in c_ref or c_ref in source_ref):
            score += 40
            reasons.append(f"Matching Reference/UTR: {source_ref}")

        # 4. Account subtype relevance (Credit Card <-> Savings/Current)
        src_sub = source_tx.account.subtype if source_tx.account else None
        c_sub = c.account.subtype if c.account else None
        if (src_sub == AccountSubtype.CREDIT_CARD and c_sub in [AccountSubtype.SAVINGS, AccountSubtype.CURRENT]) or \
           (c_sub == AccountSubtype.CREDIT_CARD and src_sub in [AccountSubtype.SAVINGS, AccountSubtype.CURRENT]):
            score += 20
            reasons.append("Credit Card <-> Bank Account pair")

        # 5. Narration heuristics
        cc_keywords = ["CRED", "CREDIT CARD", "BILL", "AUTOPAY", "PAYMENT RECEIVED", "CARD PAYMENT", "NEFT", "IMPS", "BBPS"]
        matched_kws = [kw for kw in cc_keywords if kw in source_desc or kw in c_desc]
        if matched_kws:
            score += 15
            reasons.append(f"Keyword match: {', '.join(matched_kws[:2])}")

        results.append({
            "transaction_id": str(c.id),
            "account_id": str(c.account_id),
            "account_name": c.account.name if c.account else "Unknown",
            "account_subtype": c.account.subtype.value if (c.account and hasattr(c.account.subtype, 'value')) else str(c.account.subtype),
            "date": c.date.isoformat(),
            "amount": float(c.amount),
            "abs_amount": float(c_amt),
            "days_difference": days_diff,
            "description": c.description or c.raw_narration,
            "raw_narration": c.raw_narration,
            "reference_id": c.reference_id or c.utr_number,
            "score": min(score, 100),
            "confidence_tier": "HIGH" if score >= 80 else ("MEDIUM" if score >= 50 else "LOW"),
            "match_reasons": reasons
        })

    # Sort descending by score, then ascending by days_difference
    results.sort(key=lambda x: (-x["score"], x["days_difference"]))
    return results[:max_candidates]


def search_candidate_transactions(
    db: Session,
    user_id: uuid.UUID,
    exclude_transaction_id: uuid.UUID,
    account_id: Optional[uuid.UUID] = None,
    query: Optional[str] = None,
    limit: int = 25
) -> List[Dict[str, Any]]:
    """
    Allows manual searching of unlinked transactions across accounts
    for picking a counterpart manually.
    """
    from sqlalchemy import or_

    source_tx = db.query(Transaction).filter(
        Transaction.id == exclude_transaction_id,
        Transaction.user_id == user_id
    ).first()

    target_is_inflow = source_tx.amount < 0 if source_tx else None

    # Subquery of already linked tx IDs
    linked_ids_subq = db.query(TransferLink.from_transaction_id).union(
        db.query(TransferLink.to_transaction_id)
    )

    q = db.query(Transaction).join(Transaction.account).filter(
        Transaction.user_id == user_id,
        Transaction.id != exclude_transaction_id,
        ~Transaction.id.in_(linked_ids_subq)
    )

    if source_tx:
        q = q.filter(Transaction.account_id != source_tx.account_id)
        if target_is_inflow is True:
            q = q.filter(Transaction.amount > 0)
        elif target_is_inflow is False:
            q = q.filter(Transaction.amount < 0)

    if account_id:
        q = q.filter(Transaction.account_id == account_id)

    if query and query.strip():
        search_term = f"%{query.strip()}%"
        q = q.filter(
            or_(
                Transaction.description.ilike(search_term),
                Transaction.raw_narration.ilike(search_term),
                Transaction.reference_id.ilike(search_term),
                Transaction.utr_number.ilike(search_term)
            )
        )

    txs = q.order_by(Transaction.date.desc()).limit(limit).all()

    return [
        {
            "transaction_id": str(t.id),
            "account_id": str(t.account_id),
            "account_name": t.account.name if t.account else "Unknown",
            "account_subtype": t.account.subtype.value if (t.account and hasattr(t.account.subtype, 'value')) else str(t.account.subtype),
            "date": t.date.isoformat(),
            "amount": float(t.amount),
            "description": t.description or t.raw_narration,
            "raw_narration": t.raw_narration,
            "reference_id": t.reference_id or t.utr_number
        }
        for t in txs
    ]
