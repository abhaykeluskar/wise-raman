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
