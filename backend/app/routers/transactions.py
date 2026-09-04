import uuid
import logging
from decimal import Decimal
from typing import List, Optional, Dict, Any
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from app.database import get_db, SessionLocal
from app.models import (
    Transaction, Account, CreditCardStatement, CreditCard, Bank,
    Payslip, TransferLink, Category, DocumentSource, UserClassificationRule
)
from app.dependencies import get_current_user
from app.ai import get_embedding

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Transactions & Categories"])

class TransactionResponse(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    date: date_type
    amount: Decimal
    description: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    transaction_type: Optional[str] = None
    is_excluded_from_spending: bool = False
    verified: bool
    raw_narration: Optional[str] = None
    reference_id: Optional[str] = None
    payment_rail: Optional[str] = None
    account_name: Optional[str] = None
    transfer_link_id: Optional[uuid.UUID] = None
    counterpart_id: Optional[uuid.UUID] = None
    counterpart_account_name: Optional[str] = None

    class Config:
        from_attributes = True

class TransactionUpdate(BaseModel):
    category: str
    subcategory: Optional[str] = None
    verified: bool = True
    date: Optional[date_type] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None

class CategoryCreate(BaseModel):
    name: str

class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str

    class Config:
        from_attributes = True

class SelectivePurgeRequest(BaseModel):
    transactions: bool = False
    payslips: bool = False
    bank: bool = False
    card: bool = False
    account: bool = False

class ReviewResolveRequest(BaseModel):
    transaction_id: uuid.UUID
    action: str
    new_category: Optional[str] = None
    create_rule: bool = False

class UserRuleCreate(BaseModel):
    match_pattern: str
    match_field: str = "raw_text"
    target_category: str
    target_subcategory: Optional[str] = None
    is_excluded_from_spending: bool = False
    priority: int = 100

class UserRuleTestRequest(BaseModel):
    match_pattern: str
    match_field: str = "raw_text"
    target_category: str

@router.get("/transactions", response_model=List[TransactionResponse])
def get_transactions(
    account_id: Optional[uuid.UUID] = None,
    category: Optional[str] = None,
    verified: Optional[bool] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    query = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if account_id is not None:
        query = query.filter(Transaction.account_id == account_id)
    if category is not None:
        query = query.filter(Transaction.category == category)
    if verified is not None:
        query = query.filter(Transaction.verified == verified)
        
    return query.order_by(Transaction.date.desc()).offset(offset).limit(limit).all()

@router.put("/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: uuid.UUID,
    update: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    if update.date is not None:
        tx.date = update.date
    if update.description is not None:
        tx.description = update.description
    if update.amount is not None:
        diff = update.amount - tx.amount
        account = tx.account
        from app.models import AccountSubtype
        if account and account.subtype in [AccountSubtype.SAVINGS, AccountSubtype.CURRENT]:
            account.balance += diff
        elif account:
            account.balance -= diff
        tx.amount = update.amount

    tx.category = update.category
    if update.subcategory is not None:
        tx.subcategory = update.subcategory
    tx.verified = update.verified
    
    embed_text = f"Date: {tx.date}. Bank: {tx.account.bank.name if tx.account and tx.account.bank else 'Unknown'}. Description: {tx.description}. Amount: {tx.amount}. Category: {tx.category}. Subcategory: {tx.subcategory}."
    embedding = get_embedding(embed_text)
    if embedding:
        tx.embedding = embedding
        
    db.commit()
    db.refresh(tx)
    return tx

@router.delete("/transactions/purge")
def purge_all_transactions(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Delete all transactions from database and reset all account balances to 0."""
    try:
        db.query(Transaction).filter(Transaction.user_id == current_user.id).delete()
        db.query(Account).filter(Account.user_id == current_user.id).update({Account.balance: Decimal("0.00")})
        db.commit()
        return {"message": "All transactions have been purged and account balances reset."}
    except Exception as e:
        db.rollback()
        logger.error(f"Error purging transactions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to purge data: {str(e)}")

@router.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    try:
        link = db.query(TransferLink).filter(
            (TransferLink.from_transaction_id == tx.id) | (TransferLink.to_transaction_id == tx.id)
        ).first()
        if link:
            from app.services.transfers import delete_atomic_transfer
            return delete_atomic_transfer(db, current_user.id, link.id)

        account = tx.account
        from app.models import AccountSubtype
        if account:
            if account.subtype in [AccountSubtype.SAVINGS, AccountSubtype.CURRENT]:
                account.balance -= tx.amount
            else:
                account.balance += tx.amount
            
        db.delete(tx)
        db.commit()
        return {"message": "Transaction deleted successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting transaction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete transaction: {str(e)}")

@router.post("/data/selective-purge")
def selective_purge_data(req: SelectivePurgeRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    purged_items = []
    try:
        if req.transactions:
            db.query(TransferLink).filter(
                (TransferLink.from_transaction_id.in_(db.query(Transaction.id).filter(Transaction.user_id == current_user.id))) |
                (TransferLink.to_transaction_id.in_(db.query(Transaction.id).filter(Transaction.user_id == current_user.id)))
            ).delete(synchronize_session=False)
            deleted_txs = db.query(Transaction).filter(Transaction.user_id == current_user.id).delete(synchronize_session=False)
            db.query(Account).filter(Account.user_id == current_user.id).update({Account.balance: Decimal("0.00")}, synchronize_session=False)
            purged_items.append(f"{deleted_txs} transactions")

        if req.payslips:
            deleted_payslips = db.query(Payslip).filter(Payslip.user_id == current_user.id).delete(synchronize_session=False)
            purged_items.append(f"{deleted_payslips} payslips")

        if req.card:
            deleted_cards = db.query(CreditCard).filter(CreditCard.user_id == current_user.id).delete(synchronize_session=False)
            db.query(Account).filter(Account.user_id == current_user.id, Account.subtype == "CREDIT_CARD").delete(synchronize_session=False)
            purged_items.append(f"{deleted_cards} cards")

        if req.account:
            acc_ids = [a.id for a in db.query(Account.id).filter(Account.user_id == current_user.id).all()]
            if acc_ids:
                db.query(Transaction).filter(Transaction.account_id.in_(acc_ids)).delete(synchronize_session=False)
            deleted_accounts = db.query(Account).filter(Account.user_id == current_user.id).delete(synchronize_session=False)
            purged_items.append(f"{deleted_accounts} accounts")

        if req.bank:
            deleted_banks = db.query(Bank).filter(Bank.user_id == current_user.id).delete(synchronize_session=False)
            purged_items.append(f"{deleted_banks} banks")

        db.commit()
        return {
            "status": "success",
            "message": f"Successfully purged: {', '.join(purged_items) if purged_items else 'Nothing selected'}"
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error in selective purge: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to selectively purge: {str(e)}")

@router.get("/categories", response_model=List[CategoryResponse])
def get_categories(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return db.query(Category).filter(or_(Category.user_id == None, Category.user_id == current_user.id)).order_by(Category.name).all()

@router.post("/categories", response_model=CategoryResponse)
def create_category(category: CategoryCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    name_clean = category.name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")
        
    existing = db.query(Category).filter(
        Category.name.ilike(name_clean),
        or_(Category.user_id == None, Category.user_id == current_user.id)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    
    db_category = Category(name=name_clean, user_id=current_user.id)
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

def reembed_transactions_for_category(category_name: str, user_id: Optional[uuid.UUID] = None):
    db = SessionLocal()
    try:
        query = db.query(Transaction).options(joinedload(Transaction.account).joinedload(Account.bank)).filter(Transaction.category == category_name)
        if user_id:
            query = query.filter(Transaction.user_id == user_id)
        txs = query.all()
        for tx in txs:
            bank_name = tx.account.bank.name if tx.account and tx.account.bank else "Unknown"
            embed_text = f"Date: {tx.date}. Bank: {bank_name}. Description: {tx.description}. Amount: {tx.amount}. Category: {tx.category}. Subcategory: {tx.subcategory}."
            embedding = get_embedding(embed_text)
            if embedding:
                tx.embedding = embedding
        db.commit()
    except Exception as e:
        logger.error(f"Error re-embedding transactions for category {category_name}: {e}")
    finally:
        db.close()

@router.put("/categories/{category_id}", response_model=CategoryResponse)
def update_category(category_id: uuid.UUID, category_data: CategoryCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    cat = db.query(Category).filter(Category.id == category_id, Category.user_id == current_user.id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found or access denied")
    
    new_name = category_data.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")
    
    old_name = cat.name
    if old_name == "Others" and new_name != "Others":
        raise HTTPException(status_code=400, detail="Cannot rename the default 'Others' category")
    
    existing = db.query(Category).filter(
        Category.name.ilike(new_name), 
        Category.id != category_id,
        or_(Category.user_id == None, Category.user_id == current_user.id)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Category '{new_name}' already exists")
    
    try:
        cat.name = new_name
        db.query(Transaction).filter(Transaction.category == old_name, Transaction.user_id == current_user.id).update({Transaction.category: new_name})
        db.commit()
        db.refresh(cat)
        background_tasks.add_task(reembed_transactions_for_category, new_name, current_user.id)
        return cat
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update category: {str(e)}")

@router.delete("/categories/{identifier}")
def delete_category(identifier: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    cat = None
    try:
        cat_uuid = uuid.UUID(identifier)
        cat = db.query(Category).filter(Category.id == cat_uuid, Category.user_id == current_user.id).first()
    except ValueError:
        cat = db.query(Category).filter(Category.name.ilike(identifier), Category.user_id == current_user.id).first()
        
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found or access denied")
    
    if cat.name.lower() == "others":
        raise HTTPException(status_code=400, detail="Cannot delete the default 'Others' category")
        
    try:
        db.query(Transaction).filter(Transaction.category == cat.name, Transaction.user_id == current_user.id).update({Transaction.category: "Others"})
        db.delete(cat)
        db.commit()
        background_tasks.add_task(reembed_transactions_for_category, "Others", current_user.id)
        return {"message": f"Category '{cat.name}' deleted, transactions reassigned to 'Others'"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete category: {str(e)}")

@router.get("/review-queue")
def get_review_queue(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.reconciliation_engine import generate_review_queue_summary
    from app.services.anomaly_detector import detect_spending_anomalies

    unverified_txns = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.verified == False
    ).order_by(Transaction.date.desc()).limit(150).all()

    items = []

    for t in unverified_txns:
        conf = float(t.extraction_confidence or 1.0)
        amt = float(t.amount or 0)
        desc = t.description or t.raw_text or "Unknown Transaction"
        if conf < 0.85:
            items.append({
                "id": str(t.id),
                "type": "LOW_CONFIDENCE_EXTRACTION",
                "title": f"Low Confidence: {desc}",
                "amount": amt,
                "date": str(t.date),
                "category": t.category,
                "confidence": conf,
                "reason": f"Extraction confidence is {conf*100:.0f}%"
            })
        elif not t.category or t.category in ["Other", "Uncategorized"]:
            items.append({
                "id": str(t.id),
                "type": "CATEGORY_UNCERTAINTY",
                "title": f"Uncategorized: {desc}",
                "amount": amt,
                "date": str(t.date),
                "category": "Uncategorized",
                "confidence": 0.70,
                "reason": "Merchant category requires confirmation"
            })

    recent_txns = db.query(Transaction).filter(
        Transaction.user_id == current_user.id
    ).order_by(Transaction.date.desc()).limit(500).all()

    recent_dicts = [
        {
            "id": str(t.id),
            "amount": float(t.amount),
            "date": str(t.date),
            "raw_text": t.raw_text,
            "description": t.description,
            "category": t.category,
            "confidence": float(t.extraction_confidence or 1.0),
            "verified": t.verified
        }
        for t in recent_txns
    ]

    anomalies = detect_spending_anomalies(recent_dicts)
    for a in anomalies[:5]:
        items.append({
            "id": a["transaction_id"],
            "type": "SPENDING_ANOMALY",
            "title": f"Unusual spend at {a['merchant']}",
            "amount": -a["amount"],
            "date": a["transaction_date"],
            "category": a["category"],
            "confidence": 0.90,
            "anomaly_multiplier": a["multiplier"],
            "reason": a["explanation"]
        })

    return generate_review_queue_summary(items)

@router.post("/review-queue/resolve")
def resolve_review_item(data: ReviewResolveRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == data.transaction_id, Transaction.user_id == current_user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if data.action == "RECATEGORIZE" and data.new_category:
        tx.category = data.new_category
        tx.verified = True
        if data.create_rule:
            pattern = tx.description or tx.raw_text[:30]
            rule = UserClassificationRule(
                user_id=current_user.id,
                match_pattern=pattern,
                match_field="raw_text",
                target_category=data.new_category,
                priority=200
            )
            db.add(rule)
    elif data.action == "CONFIRM":
        tx.verified = True
    elif data.action == "MARK_TRANSFER":
        tx.is_excluded_from_spending = True
        tx.category = "Transfer"
        tx.verified = True

    db.commit()
    return {"status": "RESOLVED", "transaction_id": str(tx.id)}

@router.get("/provenance/{transaction_id}")
def get_transaction_provenance(transaction_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    doc = None
    if tx.source_document_id:
        doc = db.query(DocumentSource).filter(DocumentSource.id == tx.source_document_id).first()

    return {
        "transaction_id": str(tx.id),
        "raw_text": tx.raw_text,
        "amount": float(tx.amount),
        "date": str(tx.date),
        "source_page": tx.source_page_number or 1,
        "source_coordinates": tx.source_coordinates or "N/A",
        "extraction_method": tx.extraction_method or "HEURISTIC_TABLE",
        "extraction_confidence": float(tx.extraction_confidence or 1.0),
        "verified": tx.verified,
        "file_name": doc.file_name if doc else "Bank Statement",
        "file_hash": doc.file_hash_sha256 if doc else "N/A",
        "parser_version": doc.parser_version if doc else "v2.1"
    }

@router.get("/rules")
def list_user_rules(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return db.query(UserClassificationRule).filter(UserClassificationRule.user_id == current_user.id).order_by(UserClassificationRule.priority.desc()).all()

@router.post("/rules")
def create_user_rule(data: UserRuleCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    rule = UserClassificationRule(
        user_id=current_user.id,
        match_pattern=data.match_pattern,
        match_field=data.match_field,
        target_category=data.target_category,
        target_subcategory=data.target_subcategory,
        is_excluded_from_spending=data.is_excluded_from_spending,
        priority=data.priority
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule

@router.post("/rules/test")
def test_user_rule(data: UserRuleTestRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.explainability import test_rule_simulation
    txns = db.query(Transaction).filter(Transaction.user_id == current_user.id).all()
    txn_dicts = [
        {
            "id": str(t.id),
            "date": str(t.date),
            "raw_text": t.raw_text,
            "description": t.description,
            "amount": float(t.amount),
            "category": t.category
        }
        for t in txns
    ]
    return test_rule_simulation(
        transactions=txn_dicts,
        match_pattern=data.match_pattern,
        match_field=data.match_field,
        target_category=data.target_category
    )

@router.delete("/rules/{rule_id}")
def delete_user_rule(rule_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    rule = db.query(UserClassificationRule).filter(UserClassificationRule.id == rule_id, UserClassificationRule.user_id == current_user.id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"status": "DELETED", "rule_id": str(rule_id)}
