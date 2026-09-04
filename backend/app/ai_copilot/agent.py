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
        if operation == "LOAN_AFFORDABILITY":
            system_prompt = (
                "You are WiseRaman Financial Copilot, an expert personal financial advisory assistant. "
                "You explain loan and EMI affordability strictly using the pre-calculated numbers from the Evidence Package and Indian banking FOIR rules.\n"
                "STRICT RULES:\n"
                "1. State the calculated monthly EMI, total interest, and verified monthly income.\n"
                "2. State the FOIR (Fixed Obligation to Income Ratio) percentage clearly.\n"
                "3. Deliver a clear, objective verdict based on standard 40%-50% bank lending rules.\n"
                "4. State the maximum loan amount and EMI the user can safely afford.\n"
                "5. Respond in 3-4 concise, professional sentences in Markdown."
            )
        else:
            system_prompt = (
                "You are WiseRaman Financial Copilot, an expert personal financial intelligence assistant. "
                "You explain and synthesize verified financial evidence provided to you. You never invent figures or perform raw ledger reconciliation.\n"
                "STRICT RULES:\n"
                "1. NEVER calculate or recalculate numbers yourself. All metrics, aggregates, and calculations in the Evidence Package are verified facts.\n"
                "2. State amounts clearly in Indian Rupees (₹) with standard comma formatting.\n"
                "3. Mention prominent merchants, top categories, or detected spending anomalies when relevant.\n"
                "4. Be concise, objective, and professional. Respond in 2-3 short sentences."
            )

        user_prompt = f"""User Question: {query}

Verified Evidence Package:
{safe_evidence_str}

Please synthesize and answer the user's question directly from the verified Evidence Package."""

        try:
            res = ollama_generate(
                prompt=user_prompt,
                system=system_prompt,
                num_predict=380,
                timeout=45,
                enable_thinking=False,  # Keep explanation fast and non-repetitive
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
        if operation == "LOAN_AFFORDABILITY" and evidence_dict.get("loan_analysis"):
            la = evidence_dict["loan_analysis"]
            summary = (
                f"For a home loan of ₹{la['principal']:,.2f} at {la['annual_rate']}% for {la['tenure_years']:.0f} years, "
                f"your monthly EMI would be ₹{la['monthly_emi']:,.2f} (Total Interest: ₹{la['total_interest']:,.2f}). "
                f"Based on your verified net monthly income of ₹{la['monthly_net_income']:,.2f}, this EMI represents {la['foir_percentage']:.1f}% "
                f"of your in-hand earnings (banks cap EMIs at 40% to 50% FOIR). "
                f"**Verdict:** {la['verdict']} "
                f"At a safe 40% FOIR ceiling, your maximum recommended loan amount is approximately ₹{la['max_affordable_loan']:,.2f} "
                f"(supporting an EMI of ₹{la['max_recommended_emi']:,.2f}/month)."
            )
        elif operation == "COUNT":
            summary = f"Based on your verified statements, you made {int(result_amt)} transactions for {period_str}."
        elif operation == "MAX":
            flow_label = "income" if plan.get("filters", {}).get("flow") == "INCOME" else "expense"
            summary = f"Your highest {flow_label} for {period_str} was ₹{result_amt:,.2f}."
        elif operation == "MIN":
            flow_label = "income" if plan.get("filters", {}).get("flow") == "INCOME" else "expense"
            summary = f"Your smallest {flow_label} for {period_str} was ₹{result_amt:,.2f}."
        elif operation == "AVG":
            flow_label = "income" if plan.get("filters", {}).get("flow") == "INCOME" else "spend"
            summary = f"Your average {flow_label} for {period_str} was ₹{result_amt:,.2f} across {txn_count} transactions."
        else:
            flow_label = "total income received" if plan.get("filters", {}).get("flow") == "INCOME" else "total spend"
            summary = f"Based on your verified statements, your {flow_label} for {period_str} was ₹{result_amt:,.2f} across {txn_count} transactions."

        top_m = evidence_dict.get("top_merchants", [])
        if top_m and operation != "LOAN_AFFORDABILITY":
            source_label = "Top sources" if plan.get("filters", {}).get("flow") == "INCOME" else "Top spending"
            m_strs = [f"{m['merchant']} (₹{m['total']:,.2f})" for m in top_m[:2]]
            summary += f" {source_label}: {', '.join(m_strs)}."

        anomalies = evidence_dict.get("anomalies", [])
        if anomalies and operation != "LOAN_AFFORDABILITY":
            summary += f" (Note: {len(anomalies)} unusual transaction{'s' if len(anomalies) > 1 else ''} flagged)."

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
