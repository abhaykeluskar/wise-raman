import uuid
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from app.database import get_db
from app.models import Transaction, FinancialEvent, UserClassificationRule
from app.dependencies import is_dev_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dev", tags=["Financial Truth Lab & Dev Tools"])

class DevEvidenceInspectorRequest(BaseModel):
    query: str

class DevParserBenchRequest(BaseModel):
    bank_name: str = "HDFC Bank"
    parser_version: str = "v2.1"
    raw_statement_text: Optional[str] = None

class DevScenarioRequest(BaseModel):
    scenario_id: str

class DevAiSafetyTestRequest(BaseModel):
    test_narration: Optional[str] = None

class DevResetAccountRequest(BaseModel):
    confirmation: str

@router.get("/health-summary")
def get_dev_health_summary_api(db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    from app.services.truth_lab import get_dev_health_summary
    return get_dev_health_summary(db, str(current_user.id))

@router.get("/truth-inspector")
def get_dev_truth_inspector_list(
    search: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user = Depends(is_dev_user)
):
    q = db.query(Transaction).options(
        joinedload(Transaction.account),
        joinedload(Transaction.financial_event)
    ).filter(Transaction.user_id == current_user.id)

    if category and category != "ALL":
        q = q.filter(Transaction.category == category)
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(or_(
            Transaction.raw_narration.ilike(term),
            Transaction.description.ilike(term),
            Transaction.normalized_narration.ilike(term)
        ))

    txns = q.order_by(Transaction.date.desc()).limit(limit).all()

    results = []
    for t in txns:
        results.append({
            "id": str(t.id),
            "date": str(t.date),
            "raw_narration": t.raw_text,
            "normalized_narration": t.normalized_narration or t.description or t.raw_text,
            "merchant": t.description or "Counterparty",
            "category": t.category or "UNKNOWN",
            "subcategory": t.subcategory or "General",
            "amount": float(t.amount),
            "payment_rail": t.payment_rail.value if hasattr(t.payment_rail, 'value') else str(t.payment_rail),
            "account_name": t.account.name if t.account else "Default Account",
            "confidence": float(t.extraction_confidence or t.confidence or 0.95),
            "verified": t.verified,
            "review_state": t.review_state.value if hasattr(t.review_state, 'value') else str(t.review_state),
            "is_excluded_from_spending": t.is_excluded_from_spending,
            "financial_event_id": str(t.financial_event_id) if t.financial_event_id else None
        })

    return results

@router.get("/truth-inspector/{transaction_id}")
def get_dev_transaction_truth_trace(transaction_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    from app.services.truth_lab import inspect_transaction_truth
    result = inspect_transaction_truth(db, str(current_user.id), str(transaction_id))
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@router.get("/explain-classification/{transaction_id}")
def explain_classification_api(transaction_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    from app.services.truth_lab import explain_transaction_classification_deep
    tx = db.query(Transaction).filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    user_rule = db.query(UserClassificationRule).filter(
        UserClassificationRule.user_id == current_user.id,
        UserClassificationRule.is_active == True
    ).order_by(UserClassificationRule.priority.desc()).first()

    return explain_transaction_classification_deep(tx, user_rule)

@router.post("/evidence-inspector")
def inspect_evidence_chain_api(data: DevEvidenceInspectorRequest, db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    from app.services.truth_lab import inspect_evidence_chain
    return inspect_evidence_chain(db, str(current_user.id), data.query)

@router.get("/invariants")
@router.post("/invariants/validate")
def validate_invariants_api(db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    from app.services.truth_lab import validate_all_invariants
    return validate_all_invariants(db, str(current_user.id))

@router.get("/needs-review")
def get_dev_needs_review_api(db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    from app.services.truth_lab import get_dev_needs_review_queue
    return get_dev_needs_review_queue(db, str(current_user.id))

@router.post("/parser-test-bench")
def test_parser_bench_api(data: DevParserBenchRequest, current_user = Depends(is_dev_user)):
    from app.services.truth_lab import run_parser_test_bench
    return run_parser_test_bench(data.bank_name, data.parser_version, data.raw_statement_text)

@router.post("/scenarios/generate")
def generate_scenario_api(data: DevScenarioRequest, db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    from app.services.truth_lab import generate_test_scenario
    return generate_test_scenario(db, str(current_user.id), data.scenario_id)

@router.post("/ai-safety-test")
def test_ai_safety_api(data: DevAiSafetyTestRequest, db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    from app.services.truth_lab import scan_ai_safety_and_injection
    return scan_ai_safety_and_injection(db, str(current_user.id), data.test_narration)

@router.post("/actions/rebuild-events")
def rebuild_events_action(db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    from app.services.truth_lab import rebuild_financial_events
    return rebuild_financial_events(db, str(current_user.id))

@router.post("/actions/rerun-classification")
def rerun_classification_action(db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    from app.services.truth_lab import rerun_classification_engine
    return rerun_classification_engine(db, str(current_user.id))

@router.post("/actions/recalculate-analytics")
def recalculate_analytics_action(db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    from app.services.truth_lab import get_dev_health_summary
    return {
        "status": "RECALCULATED",
        "summary": get_dev_health_summary(db, str(current_user.id))
    }

@router.post("/actions/reset-account")
def reset_account_action(data: DevResetAccountRequest, db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    from app.services.truth_lab import reset_dev_account
    try:
        return reset_dev_account(db, str(current_user.id), data.confirmation)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.get("/events")
def list_dev_events(db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    events = db.query(FinancialEvent).options(joinedload(FinancialEvent.transactions)).filter(FinancialEvent.user_id == current_user.id).order_by(FinancialEvent.occurred_at.desc()).limit(100).all()
    results = []
    for e in events:
        results.append({
            "id": str(e.id),
            "event_type": e.event_type.value if hasattr(e.event_type, 'value') else str(e.event_type),
            "review_state": e.review_state.value if hasattr(e.review_state, 'value') else str(e.review_state),
            "occurred_at": str(e.occurred_at),
            "economic_amount": float(e.economic_amount or 0.0),
            "confidence": float(e.confidence or 0.95),
            "verified": e.verified,
            "transactions_count": len(e.transactions),
            "transactions": [{
                "id": str(t.id),
                "date": str(t.date),
                "raw_text": t.raw_text,
                "amount": float(t.amount),
                "category": t.category
            } for t in e.transactions]
        })
    return results

@router.delete("/purge")
def purge_database(db: Session = Depends(get_db), current_user = Depends(is_dev_user)):
    try:
        from app.models import Transaction, Account, CreditCardStatement, CreditCard, TransferLink, Payslip
        db.query(TransferLink).delete()
        db.query(Transaction).delete()
        db.query(Payslip).delete()
        db.query(CreditCardStatement).delete()
        db.query(CreditCard).delete()
        db.query(Account).delete()
        db.commit()
        return {"status": "success", "message": "All database records purged"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
