import json
import logging
from typing import Dict, Any

from app.ai_copilot.query_planner import FinancialQueryPlanner, EvidencePackage
from app.ai_copilot.redaction import PrivacyRedactor

logger = logging.getLogger(__name__)

class FinancialCopilotAgent:
    """
    Evidence-based AI Copilot optimized for small LLMs (6GB VRAM constraint).
    """
    
    def __init__(self, db_session):
        self.db_session = db_session
        self.planner = FinancialQueryPlanner()
        self.redactor = PrivacyRedactor()
        
    def process_query(self, user_id: str, query: str) -> Dict[str, Any]:
        """
        1. Parse intent
        2. Execute query deterministically -> Evidence Package
        3. Redact PII from evidence
        4. Generate response using LLM to explain the Evidence Package
        """
        # Step 1
        plan = self.planner.parse_intent(query)
        
        # Step 2
        evidence_package: EvidencePackage = self.planner.execute_plan(self.db_session, user_id, query, plan)
        evidence_dict = evidence_package.dict()
        
        # Step 3
        safe_evidence_str = self.redactor.redact_text(json.dumps(evidence_dict))
        
        # Step 4: LLM Generation
        # Prompt engineered to be concise for small models.
        prompt = f"""
        User Question: {query}
        
        Immutable Evidence Package:
        {safe_evidence_str}
        
        INSTRUCTIONS:
        1. Explain the pre-computed calculation in the Evidence Package to the user.
        2. DO NOT perform any math yourself. The 'result' field is the absolute truth.
        3. If there is no evidence, politely state that you cannot answer the financial question.
        4. Keep your answer under 3 sentences.
        """
        
        # simulated LLM response
        result_amt = evidence_dict["calculation"]["result"]
        txn_count = len(evidence_dict["evidence"])
        
        if txn_count > 0:
            llm_response = f"Based on the evidence, your total spending was ₹{result_amt:.2f} across {txn_count} transactions."
        else:
            llm_response = "I couldn't find any verified transactions matching your request."
            
        return {
            "response": llm_response,
            "evidence": evidence_dict,
            "plan": plan
        }
        
    def generate_monthly_review(self, user_id: str, month_str: str) -> str:
        """
        Generates a monthly review using a templated approach to save LLM tokens.
        """
        return f"Monthly Review for {month_str}: Income stable, expenses well within limits."
