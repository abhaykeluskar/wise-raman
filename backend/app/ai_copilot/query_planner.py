import json
from typing import Dict, Any, List

class FinancialQueryPlanner:
    """
    Translates NLP intents into safe, deterministic query filters.
    Instead of generating raw SQL, it generates a structured object.
    """
    
    def __init__(self):
        # We can define valid dimensions here
        self.valid_dimensions = ["category", "merchant", "account", "date_range", "transaction_type"]
        
    def parse_intent(self, user_query: str) -> Dict[str, Any]:
        """
        Mock method: In reality, we use a small LLM to extract these parameters
        constrained by JSON schema.
        For a query like "How much did I spend on food last month?"
        It should output:
        {
            "intent": "SUM",
            "filters": {
                "category": "FOOD",
                "date_range": "LAST_MONTH",
                "transaction_type": "EXPENSE"
            }
        }
        """
        user_query = user_query.lower()
        
        filters = {}
        intent = "SUM"
        
        if "food" in user_query or "dining" in user_query or "restaurant" in user_query:
            filters["category"] = "Dining"
            filters["transaction_type"] = "EXPENSE"
            
        if "last month" in user_query:
            filters["date_range"] = "LAST_MONTH"
            
        if "compare" in user_query:
            intent = "COMPARE"
            
        return {
            "intent": intent,
            "filters": filters
        }
        
    def execute_plan(self, db_session, user_id: str, plan: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes the plan deterministically using SQLAlchemy without raw SQL.
        """
        # This is where we would map the filters to SQLAlchemy queries.
        # Returning mock data for implementation plan.
        return {
            "evidence": {
                "total_amount": 18420.00,
                "transaction_count": 42,
                "filters_applied": plan["filters"]
            }
        }
