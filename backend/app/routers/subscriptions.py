import logging
from typing import List, Optional
from datetime import date as date_type, timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Transaction, CustomSubscription, MandateRecord
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/subscriptions", tags=["Subscriptions"])

class CustomSubscriptionCreate(BaseModel):
    name: str
    category: Optional[str] = "Digital & Streaming"
    amount: float
    frequency: Optional[str] = "MONTHLY"
    billing_day: Optional[int] = 1
    next_renewal_date: Optional[date_type] = None
    payment_method: Optional[str] = "Card"
    cancellation_url: Optional[str] = None
    notes: Optional[str] = None

class CustomSubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    frequency: Optional[str] = None
    billing_day: Optional[int] = None
    next_renewal_date: Optional[date_type] = None
    payment_method: Optional[str] = None
    cancellation_url: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

@router.get("")
def get_subscriptions(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    transactions = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.amount < 0,
        Transaction.is_excluded_from_spending == False
    ).order_by(Transaction.date).all()
    
    groups = defaultdict(list)
    for tx in transactions:
        desc = tx.description or tx.raw_text
        if desc:
            groups[desc.strip()].append(tx)
            
    subscriptions = []
    
    for desc, txs in groups.items():
        if len(txs) < 2:
            continue
            
        amounts = [abs(float(tx.amount)) for tx in txs]
        avg_amount = sum(amounts) / len(amounts)
        
        if any(abs(amt - avg_amount) > avg_amount * 0.2 for amt in amounts):
            continue
            
        txs_sorted = sorted(txs, key=lambda x: x.date)
        intervals = []
        for i in range(1, len(txs_sorted)):
            delta = (txs_sorted[i].date - txs_sorted[i-1].date).days
            intervals.append(delta)
            
        if not intervals:
            continue
            
        avg_interval = sum(intervals) / len(intervals)
        
        freq = None
        if 25 <= avg_interval <= 35:
            freq = "Monthly"
        elif 350 <= avg_interval <= 380:
            freq = "Yearly"
        elif 6 <= avg_interval <= 8:
            freq = "Weekly"
            
        if freq:
            last_date = txs_sorted[-1].date
            if freq == "Monthly":
                next_date = last_date + timedelta(days=30)
            elif freq == "Yearly":
                next_date = last_date + timedelta(days=365)
            else:
                next_date = last_date + timedelta(days=7)
                
            subscriptions.append({
                "name": desc,
                "amount": avg_amount,
                "frequency": freq,
                "next_expected_date": next_date.isoformat()
            })
            
    return subscriptions

@router.get("/intelligence")
def get_subscription_intelligence_api(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.subscription_intelligence import get_comprehensive_subscription_payload
    
    auto_subs = get_subscriptions(db, current_user)
    
    custom_subs = db.query(CustomSubscription).filter(CustomSubscription.user_id == current_user.id).all()
    custom_dicts = [
        {
            "id": str(c.id),
            "name": c.name,
            "category": c.category,
            "amount": float(c.amount),
            "frequency": c.frequency,
            "billing_day": c.billing_day,
            "next_renewal_date": c.next_renewal_date,
            "payment_method": c.payment_method,
            "cancellation_url": c.cancellation_url,
            "is_active": c.is_active,
            "notes": c.notes
        }
        for c in custom_subs
    ]
    
    mandates = db.query(MandateRecord).filter(MandateRecord.user_id == current_user.id, MandateRecord.is_active == True).all()
    mandate_dicts = [
        {
            "biller_name": m.biller_name,
            "amount": float(m.amount or 0),
            "mandate_type": m.mandate_type,
            "frequency": m.frequency or "MONTHLY",
            "next_debit_date": str(m.next_debit_date) if m.next_debit_date else None
        }
        for m in mandates
    ]
    
    all_txns = db.query(Transaction).filter(Transaction.user_id == current_user.id).all()
    txn_dicts = [
        {
            "id": str(t.id),
            "amount": float(t.amount),
            "date": str(t.date),
            "raw_text": t.raw_text,
            "description": t.description,
            "merchant": t.description,
            "normalized_narration": t.normalized_narration,
            "is_excluded_from_spending": t.is_excluded_from_spending
        }
        for t in all_txns
    ]
    
    return get_comprehensive_subscription_payload(
        auto_subscriptions=auto_subs,
        custom_subscriptions=custom_dicts,
        mandates=mandate_dicts,
        transactions=txn_dicts
    )

@router.get("/custom")
def list_custom_subscriptions_api(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return db.query(CustomSubscription).filter(CustomSubscription.user_id == current_user.id).order_by(CustomSubscription.created_at.desc()).all()

@router.post("/custom")
def create_custom_subscription_api(payload: CustomSubscriptionCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    sub = CustomSubscription(
        user_id=current_user.id,
        name=payload.name,
        category=payload.category,
        amount=payload.amount,
        frequency=payload.frequency or "MONTHLY",
        billing_day=payload.billing_day or 1,
        next_renewal_date=payload.next_renewal_date,
        payment_method=payload.payment_method or "Card",
        cancellation_url=payload.cancellation_url,
        notes=payload.notes
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub

@router.put("/custom/{sub_id}")
def update_custom_subscription_api(sub_id: str, payload: CustomSubscriptionUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    sub = db.query(CustomSubscription).filter(CustomSubscription.id == sub_id, CustomSubscription.user_id == current_user.id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(sub, field, value)
    db.commit()
    db.refresh(sub)
    return sub

@router.delete("/custom/{sub_id}")
def delete_custom_subscription_api(sub_id: str, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    sub = db.query(CustomSubscription).filter(CustomSubscription.id == sub_id, CustomSubscription.user_id == current_user.id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    db.delete(sub)
    db.commit()
    return {"message": "Subscription deleted successfully"}

@router.post("/custom/{sub_id}/toggle")
def toggle_custom_subscription_api(sub_id: str, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    sub = db.query(CustomSubscription).filter(CustomSubscription.id == sub_id, CustomSubscription.user_id == current_user.id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.is_active = not sub.is_active
    db.commit()
    db.refresh(sub)
    return sub
