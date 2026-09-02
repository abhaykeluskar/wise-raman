import json
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from datetime import date
from sqlalchemy.orm import Session
from app.models import FinancialEvent, Transaction, FinancialEventType, ReviewState
from sqlalchemy import func

class EvidenceRecord(BaseModel):
    transaction_id: str
    amount: float
    source_document: Optional[str] = None
    source_page: Optional[int] = None

class CalculationNode(BaseModel):
    operation: str
    field: str
    filter_desc: str
    result: float

class EvidencePackage(BaseModel):
    question: str
    period: str
    calculation: CalculationNode
    evidence: List[EvidenceRecord]

class FinancialQueryPlanner:
    """
    Translates NLP intents into safe, deterministic query filters.
    Produces an Immutable Evidence Package.
    """
    
    def parse_intent(self, user_query: str) -> Dict[str, Any]:
        """
        Mock intent parser for v1.0. In production, this uses a schema-constrained LLM.
        """
        user_query = user_query.lower()
        filters = {}
        intent = "SUM"
        
        if "food" in user_query or "dining" in user_query:
            filters["category"] = "Dining"
            filters["event_type"] = FinancialEventType.EXPENSE
            
        if "last month" in user_query:
            filters["date_range"] = "LAST_MONTH"
            
        return {
            "intent": intent,
            "filters": filters
        }
        
    def execute_plan(self, db_session: Session, user_id: str, query: str, plan: Dict[str, Any]) -> EvidencePackage:
        """
        Executes the plan deterministically and returns an Immutable Evidence Package.
        """
        filters = plan.get("filters", {})
        
        # Base query using FinancialEvent (Economic Reality)
        q = db_session.query(FinancialEvent, Transaction).join(
            Transaction, Transaction.financial_event_id == FinancialEvent.id
        ).filter(
            FinancialEvent.user_id == user_id,
            FinancialEvent.review_state != ReviewState.NEEDS_REVIEW
        )
        
        # Apply deterministic filters
        if "event_type" in filters:
            q = q.filter(FinancialEvent.event_type == filters["event_type"])
        if "category" in filters:
            q = q.filter(Transaction.category == filters["category"])
            
        # Execute query
        results = q.all()
        
        # Build deterministic result and evidence
        total_amount = 0.0
        evidence_records = []
        
        for event, txn in results:
            amt = float(event.economic_amount or 0.0)
            total_amount += amt
            evidence_records.append(EvidenceRecord(
                transaction_id=str(txn.id),
                amount=amt,
                source_document=txn.source_id,
                source_page=txn.source_page_number
            ))
            
        calc_node = CalculationNode(
            operation=plan["intent"],
            field="economic_amount",
            filter_desc=str(filters),
            result=total_amount
        )
        
        return EvidencePackage(
            question=query,
            period=filters.get("date_range", "ALL_TIME"),
            calculation=calc_node,
            evidence=evidence_records
        )
