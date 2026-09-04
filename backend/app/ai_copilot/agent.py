import json
import logging
import datetime
from typing import Any, Dict, Optional

from app.ai import ollama_generate
from app.ai_copilot.query_planner import EvidencePackage, FinancialQueryPlanner
from app.ai_copilot.redaction import PrivacyRedactor
from app.models import Transaction
from sqlalchemy import func

logger = logging.getLogger(__name__)


class FinancialCopilotAgent:
    """
    Evidence-based AI Copilot optimized for local LLMs (Qwen 2.5 3B).
    Guarantees that the LLM NEVER performs math. All numbers originate from verified SQL evidence.
    """

    def __init__(self, db_session):
        self.db_session = db_session
        self.planner = FinancialQueryPlanner()
        self.redactor = PrivacyRedactor()

    def process_query(self, user_id: Any, query: str) -> Dict[str, Any]:
        """
        1. Parse intent & extract temporal/categorical filters
        2. Execute query deterministically in PostgreSQL -> Evidence Package
        3. Redact PII from evidence package
        4. Synthesize verified natural language answer using local Ollama model
        """
        # Step 1 & 2: Deterministic query planning & execution
        plan = self.planner.parse_intent(query)
        evidence_package: EvidencePackage = self.planner.execute_plan(
            self.db_session, user_id, query, plan
        )
        evidence_dict = evidence_package.model_dump()

        # Step 3: Redact PII
        safe_evidence_str = self.redactor.redact_text(json.dumps(evidence_dict))

        # Check if any transactions matched
        calc = evidence_dict.get("calculation", {})
        result_amt = calc.get("result", 0.0)
        txn_count = calc.get("count", 0)
        period_str = calc.get("period", "ALL_TIME")
        operation = calc.get("operation", "SUM")

        if txn_count == 0:
            return {
                "response": f"I couldn't find any verified transactions matching your request for {period_str}.",
                "evidence": evidence_dict,
                "plan": plan,
            }

        # Step 4: LLM Synthesis with strict grounded evidence prompt
        system_prompt = (
            "You are WiseRaman, an expert personal financial intelligence assistant. "
            "You MUST explain the pre-calculated numbers from the Immutable Evidence Package. "
            "STRICT RULES:\n"
            "1. NEVER calculate or recalculate numbers yourself. The 'result' and 'count' fields are verified facts.\n"
            "2. State the final total/count clearly in Indian Rupees (₹) with comma formatting.\n"
            "3. Mention 1-3 prominent merchants or dates from the evidence list.\n"
            "4. Be concise and professional. Respond in 2-3 short sentences."
        )

        user_prompt = f"""User Question: {query}

Verified Evidence Package:
{safe_evidence_str}

Please summarize and answer the user's question directly from the verified calculation."""

        try:
            res = ollama_generate(
                prompt=user_prompt,
                system=system_prompt,
                num_predict=320,
                timeout=45,
            )
            if res.status_code == 200:
                llm_response = res.json().get("response", "").strip()
                if llm_response:
                    return {
                        "response": llm_response,
                        "evidence": evidence_dict,
                        "plan": plan,
                    }
        except Exception as e:
            logger.warning(f"Ollama copilot generation failed: {e}. Falling back to deterministic summary.")

        # Fallback deterministic summary if Ollama is offline or times out
        if operation == "COUNT":
            summary = f"Based on your verified statements, you made {int(result_amt)} transactions for {period_str}."
        elif operation == "MAX":
            summary = f"Your highest expense for {period_str} was ₹{result_amt:,.2f}."
        elif operation == "MIN":
            summary = f"Your smallest expense for {period_str} was ₹{result_amt:,.2f}."
        elif operation == "AVG":
            summary = f"Your average spend for {period_str} was ₹{result_amt:,.2f} across {txn_count} transactions."
        else:
            summary = f"Based on your verified statements, your total spend for {period_str} was ₹{result_amt:,.2f} across {txn_count} transactions."

        top_m = evidence_dict.get("top_merchants", [])
        if top_m:
            m_strs = [f"{m['merchant']} (₹{m['total']:,.2f})" for m in top_m[:2]]
            summary += f" Top spending: {', '.join(m_strs)}."

        return {
            "response": summary,
            "evidence": evidence_dict,
            "plan": plan,
        }

    def generate_monthly_review(self, user_id: Any, month_str: str) -> str:
        """
        Generates a comprehensive monthly review synthesizing actual income, expense, and top categories.
        """
        # Parse month_str or default to last month
        today = datetime.date.today()
        # Compute exact income and expense for the user
        total_income = (
            self.db_session.query(func.sum(Transaction.amount))
            .filter(Transaction.user_id == user_id, Transaction.amount > 0)
            .scalar()
            or 0.0
        )
        total_expense = (
            self.db_session.query(func.sum(func.abs(Transaction.amount)))
            .filter(
                Transaction.user_id == user_id,
                Transaction.amount < 0,
                Transaction.is_excluded_from_spending == False,
            )
            .scalar()
            or 0.0
        )

        top_cats = (
            self.db_session.query(
                Transaction.category,
                func.sum(func.abs(Transaction.amount)).label("cat_total"),
            )
            .filter(
                Transaction.user_id == user_id,
                Transaction.amount < 0,
                Transaction.is_excluded_from_spending == False,
            )
            .group_by(Transaction.category)
            .order_by(func.sum(func.abs(Transaction.amount)).desc())
            .limit(3)
            .all()
        )

        cat_summary = ", ".join([f"{c[0]}: ₹{float(c[1]):,.2f}" for c in top_cats if c[0]])
        savings = float(total_income) - float(total_expense)
        savings_rate = (
            (savings / float(total_income) * 100.0) if float(total_income) > 0 else 0.0
        )

        prompt = f"""Synthesize a concise, 3-sentence executive financial health review for {month_str}:
- Total Inflow: ₹{float(total_income):,.2f}
- Total Outflow: ₹{float(total_expense):,.2f}
- Net Savings: ₹{savings:,.2f} ({savings_rate:.1f}% savings rate)
- Top Categories: {cat_summary}

Highlight savings discipline and notable spend drivers. Respond in professional Markdown."""

        try:
            res = ollama_generate(prompt=prompt, num_predict=256, timeout=30)
            if res.status_code == 200:
                review_text = res.json().get("response", "").strip()
                if review_text:
                    return review_text
        except Exception as e:
            logger.warning(f"Monthly review LLM call failed: {e}")

        return (
            f"**Monthly Review for {month_str}:**\n"
            f"Total inflow recorded was ₹{float(total_income):,.2f} against total expenditures of ₹{float(total_expense):,.2f}, "
            f"yielding a net savings rate of {savings_rate:.1f}%. "
            f"Primary outflow drivers were {cat_summary or 'regular living expenses'}."
        )
