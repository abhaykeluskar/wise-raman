import uuid
import logging
from decimal import Decimal
from typing import List, Optional
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.database import get_db
from app.models import Account, CreditCard, CreditCardStatement, AccountClassification, AccountSubtype
from app.dependencies import get_current_user
from app.routers.banks_accounts import BankResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Credit Cards"])

class CreditCardBase(BaseModel):
    card_name: str
    bank_id: uuid.UUID
    network: str
    reward_currency: str = "Reward Points"
    monthly_cap: Optional[Decimal] = None
    statement_date: int = 1
    is_active: bool = True
    account_id: Optional[uuid.UUID] = None
    credit_limit: Optional[Decimal] = None

class CreditCardCreate(CreditCardBase):
    pass

class CreditCardResponse(CreditCardBase):
    id: uuid.UUID
    bank: BankResponse
    credit_limit: Optional[Decimal] = None
    balance: Optional[Decimal] = None
    current_balance: Optional[Decimal] = None
    account_number_mask: Optional[str] = None
    name: Optional[str] = None

    class Config:
        from_attributes = True

@router.get("/cards", response_model=List[CreditCardResponse])
def get_credit_cards(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return db.query(CreditCard).options(
        joinedload(CreditCard.bank),
        joinedload(CreditCard.account)
    ).filter(CreditCard.user_id == current_user.id).all()

@router.post("/cards", response_model=CreditCardResponse)
def create_credit_card(card_data: CreditCardCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        account_id = card_data.account_id
        if not account_id:
            new_acc = Account(
                user_id=current_user.id,
                name=card_data.card_name,
                bank_id=card_data.bank_id,
                classification=AccountClassification.LIABILITY,
                subtype=AccountSubtype.CREDIT_CARD,
                balance=Decimal("0.00"),
                credit_limit=card_data.credit_limit,
                available_limit=card_data.credit_limit
            )
            db.add(new_acc)
            db.flush()
            account_id = new_acc.id
        elif card_data.credit_limit is not None:
            acc = db.query(Account).filter(Account.id == account_id, Account.user_id == current_user.id).first()
            if acc:
                acc.credit_limit = card_data.credit_limit
                if acc.available_limit is None:
                    acc.available_limit = card_data.credit_limit

        new_card = CreditCard(
            user_id=current_user.id,
            card_name=card_data.card_name,
            bank_id=card_data.bank_id,
            network=card_data.network,
            reward_currency=card_data.reward_currency or "Reward Points",
            monthly_cap=card_data.monthly_cap,
            statement_date=card_data.statement_date,
            is_active=card_data.is_active,
            account_id=account_id
        )
        db.add(new_card)
        db.commit()
        return db.query(CreditCard).options(
            joinedload(CreditCard.bank),
            joinedload(CreditCard.account)
        ).filter(CreditCard.id == new_card.id).first()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to create card: {str(e)}")

@router.put("/cards/{card_id}", response_model=CreditCardResponse)
def update_credit_card(card_id: uuid.UUID, card_data: CreditCardCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    card = db.query(CreditCard).filter(CreditCard.id == card_id, CreditCard.user_id == current_user.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Credit card not found")
    
    card.card_name = card_data.card_name
    card.bank_id = card_data.bank_id
    card.network = card_data.network
    card.reward_currency = card_data.reward_currency or "Reward Points"
    card.monthly_cap = card_data.monthly_cap
    card.statement_date = card_data.statement_date
    card.is_active = card_data.is_active
    card.account_id = card_data.account_id

    if card_data.credit_limit is not None and card.account_id:
        acc = db.query(Account).filter(Account.id == card.account_id, Account.user_id == current_user.id).first()
        if acc:
            acc.credit_limit = card_data.credit_limit

    db.commit()
    return db.query(CreditCard).options(
        joinedload(CreditCard.bank),
        joinedload(CreditCard.account)
    ).filter(CreditCard.id == card_id).first()

@router.delete("/cards/{card_id}")
def delete_credit_card(card_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    card = db.query(CreditCard).filter(CreditCard.id == card_id, CreditCard.user_id == current_user.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Credit card not found")
    db.delete(card)
    db.commit()
    return {"status": "success", "message": f"Successfully deleted card {card_id}"}

@router.get("/analytics/credit-cards/summary")
def get_credit_cards_summary(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    outstanding = db.query(func.sum(Account.balance)).filter(
        Account.user_id == current_user.id,
        Account.subtype == AccountSubtype.CREDIT_CARD
    ).scalar() or Decimal("0.00")
    
    upcoming_bills_total = db.query(func.sum(CreditCardStatement.total_amount_due)).filter(
        CreditCardStatement.user_id == current_user.id,
        CreditCardStatement.due_date >= date_type.today()
    ).scalar() or Decimal("0.00")
    
    return {
        "current_outstanding": float(outstanding),
        "upcoming_bills": float(upcoming_bills_total)
    }
