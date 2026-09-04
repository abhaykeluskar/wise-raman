import uuid
import logging
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Bank, Account, AccountClassification, AccountSubtype
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Banks & Accounts"])

class BankBase(BaseModel):
    name: str

class BankResponse(BankBase):
    id: uuid.UUID
    class Config:
        from_attributes = True

class AccountCreate(BaseModel):
    name: str
    bank_id: uuid.UUID
    account_type: str
    balance: float = 0.0

class AccountResponse(BaseModel):
    id: uuid.UUID
    name: str
    bank_id: uuid.UUID
    bank: BankResponse
    classification: str
    subtype: str
    balance: Decimal
    goal_locked_amount: Optional[Decimal] = Decimal("0.00")
    spendable_balance: Optional[Decimal] = None

    class Config:
        from_attributes = True

@router.get("/banks", response_model=List[BankResponse])
def list_banks(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return db.query(Bank).all()

@router.post("/banks", response_model=BankResponse)
def create_bank(bank: BankBase, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    db_bank = Bank(name=bank.name)
    db.add(db_bank)
    db.commit()
    db.refresh(db_bank)
    return db_bank

@router.post("/accounts", response_model=AccountResponse)
def create_account(account: AccountCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    classification = (
        AccountClassification.LIABILITY
        if "credit" in account.account_type.lower() or "loan" in account.account_type.lower()
        else AccountClassification.ASSET
    )
    
    if "savings" in account.account_type.lower():
        subtype = AccountSubtype.SAVINGS
    elif "current" in account.account_type.lower():
        subtype = AccountSubtype.CURRENT
    elif "credit" in account.account_type.lower():
        subtype = AccountSubtype.CREDIT_CARD
    elif "loan" in account.account_type.lower():
        subtype = AccountSubtype.LOAN
    else:
        subtype = AccountSubtype.SAVINGS

    db_account = Account(
        name=account.name,
        user_id=current_user.id,
        bank_id=account.bank_id,
        classification=classification,
        subtype=subtype,
        balance=Decimal(str(account.balance))
    )
    db.add(db_account)
    db.commit()
    return db.query(Account).options(joinedload(Account.bank)).filter(Account.id == db_account.id).first()

@router.get("/accounts", response_model=List[AccountResponse])
def list_accounts(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return db.query(Account).options(joinedload(Account.bank)).filter(Account.user_id == current_user.id).all()

@router.delete("/accounts/{account_id}")
def delete_account(account_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Delete an account and all its associated transactions."""
    account = db.query(Account).filter(Account.id == account_id, Account.user_id == current_user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        db.delete(account)
        db.commit()
        return {"message": f"Account '{account.name}' and all associated transactions have been deleted."}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting account: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {str(e)}")
