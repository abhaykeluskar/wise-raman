import calendar
import datetime
import json
import logging
import re
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.models import ReviewState, Transaction

logger = logging.getLogger(__name__)


class EvidenceRecord(BaseModel):
    transaction_id: str
    date: Optional[str] = None
    description: Optional[str] = None
    amount: float
    category: Optional[str] = None
    source_document: Optional[str] = None
    source_page: Optional[int] = None


class CalculationNode(BaseModel):
    operation: str
    field: str
    filter_desc: str
    result: float
    count: int = 0
    period: str = "ALL_TIME"


class EvidencePackage(BaseModel):
    question: str
    period: str
    calculation: CalculationNode
    evidence: List[EvidenceRecord] = Field(default_factory=list)
    top_merchants: List[Dict[str, Any]] = Field(default_factory=list)


CATEGORY_KEYWORDS = {
    "Dining": ["food", "dining", "restaurant", "swiggy", "zomato", "eatclub", "cafe", "starbucks", "dinner", "lunch", "breakfast", "coffee", "mcdonalds", "dominos", "burger"],
    "Groceries": ["groceries", "grocery", "blinkit", "zepto", "bigbasket", "instamart", "dmart", "supermarket", "vegetables", "milk", "kirana"],
    "Utilities": ["utilities", "utility", "electricity", "water", "wifi", "broadband", "gas", "recharge", "mobile", "airtel", "jio", "bescom", "tneb", "bill"],
    "Travel": ["travel", "flight", "train", "irctc", "uber", "ola", "rapido", "cab", "makemytrip", "hotel", "indigo", "air india", "vistara", "bus", "redbus", "toll", "fastag"],
    "Shopping": ["shopping", "amazon", "flipkart", "myntra", "meesho", "ajio", "nykaa", "apparel", "clothing", "shoes", "electronics"],
    "Entertainment": ["entertainment", "netflix", "spotify", "hotstar", "disney", "prime video", "youtube", "movie", "pvr", "inox", "cinema", "theatre", "bookmyshow"],
    "Investment": ["investment", "invest", "mutual fund", "zerodha", "groww", "sip", "stocks", "shares", "etf", "fd", "fixed deposit", "ppf", "nps"],
    "Salary/Income": ["salary", "wage", "income", "payroll", "dividend", "interest", "bonus"],
    "Healthcare": ["healthcare", "health", "hospital", "doctor", "clinic", "pharmacy", "medicine", "1mg", "apollo", "pharmeasy", "netmeds", "dental", "pathology"],
    "Fuel": ["fuel", "petrol", "diesel", "hpcl", "bpcl", "iocl", "shell", "gas station"],
    "Education": ["education", "tuition", "school", "college", "fees", "course", "udemy", "coursera"],
    "Transfer": ["transfer", "internal transfer", "self transfer", "cc payment", "card payment"],
}

MONTH_NAMES = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}


class FinancialQueryPlanner:
    """
    Translates NLP queries into deterministic SQL filters.
    Computes mathematical truth directly in PostgreSQL and produces an Immutable Evidence Package.
    """

    def parse_intent(self, user_query: str) -> Dict[str, Any]:
        q = user_query.lower()
        filters: Dict[str, Any] = {}

        # 1. Detect Operation
        if any(w in q for w in ["how many", "count", "number of", "how often"]):
            intent = "COUNT"
        elif any(w in q for w in ["highest", "largest", "maximum", "max", "biggest", "most expensive"]):
            intent = "MAX"
        elif any(w in q for w in ["lowest", "smallest", "minimum", "min", "cheapest"]):
            intent = "MIN"
        elif any(w in q for w in ["average", "avg", "mean"]):
            intent = "AVG"
        else:
            intent = "SUM"

        # 2. Detect Flow (Income vs Expense)
        if any(w in q for w in ["earned", "income", "salary", "credit", "received", "earnings", "inflow"]):
            filters["flow"] = "INCOME"
        else:
            filters["flow"] = "EXPENSE"

        # 3. Detect Categories
        matched_category = None
        for cat, keywords in CATEGORY_KEYWORDS.items():
            if any(re.search(rf"\b{re.escape(kw)}\b", q) for kw in keywords):
                matched_category = cat
                break
        if matched_category:
            filters["category"] = matched_category

        # 4. Detect Specific Merchants
        for merchant in ["swiggy", "zomato", "blinkit", "zepto", "amazon", "flipkart", "uber", "ola", "irctc", "netflix", "spotify", "starbucks", "dmart"]:
            if merchant in q:
                filters["merchant"] = merchant.title()
                break

        # 5. Detect Date Ranges
        today = date.today()
        start_date = None
        end_date = None
        date_label = "ALL_TIME"

        if "last month" in q or "previous month" in q:
            # First day of last month
            first_of_this_month = today.replace(day=1)
            last_day_last_month = first_of_this_month - timedelta(days=1)
            start_date = last_day_last_month.replace(day=1)
            end_date = last_day_last_month
            date_label = start_date.strftime("%B %Y")
        elif "this month" in q or "current month" in q:
            start_date = today.replace(day=1)
            end_date = today
            date_label = today.strftime("%B %Y")
        elif "last 3 months" in q or "past 3 months" in q or "3 months" in q:
            start_date = today - timedelta(days=90)
            end_date = today
            date_label = "Last 3 Months"
        elif "last 6 months" in q or "past 6 months" in q or "6 months" in q:
            start_date = today - timedelta(days=180)
            end_date = today
            date_label = "Last 6 Months"
        elif "this year" in q:
            start_date = date(today.year, 1, 1)
            end_date = today
            date_label = str(today.year)
        elif "last year" in q:
            start_date = date(today.year - 1, 1, 1)
            end_date = date(today.year - 1, 12, 31)
            date_label = str(today.year - 1)
        else:
            # Check for specific named month e.g., "in August" or "August 2026"
            for m_name, m_num in MONTH_NAMES.items():
                if re.search(rf"\b{m_name}\b", q):
                    year_match = re.search(r"\b(202[0-9])\b", q)
                    year = int(year_match.group(1)) if year_match else today.year
                    last_day = calendar.monthrange(year, m_num)[1]
                    start_date = date(year, m_num, 1)
                    end_date = date(year, m_num, last_day)
                    date_label = f"{m_name.capitalize()} {year}"
                    break

        if start_date and end_date:
            filters["start_date"] = start_date
            filters["end_date"] = end_date
            filters["date_label"] = date_label

        return {
            "intent": intent,
            "filters": filters,
            "period": date_label
        }

    def execute_plan(
        self, db_session: Session, user_id: Any, query: str, plan: Dict[str, Any]
    ) -> EvidencePackage:
        """
        Executes deterministic SQL queries to calculate absolute mathematical truth.
        """
        filters = plan.get("filters", {})
        intent = plan.get("intent", "SUM")
        period = plan.get("period", "ALL_TIME")

        # Base query on Transaction table directly
        q = db_session.query(Transaction).filter(Transaction.user_id == user_id)

        # Exclude internal non-spending transactions unless explicitly looking for transfers
        if filters.get("category") != "Transfer":
            q = q.filter(Transaction.is_excluded_from_spending == False)

        # Apply flow filter
        if filters.get("flow") == "INCOME":
            q = q.filter(Transaction.amount > 0)
        else:
            q = q.filter(Transaction.amount < 0)

        # Apply category filter
        if "category" in filters:
            q = q.filter(Transaction.category == filters["category"])

        # Apply merchant substring filter
        if "merchant" in filters:
            m_term = f"%{filters['merchant']}%"
            q = q.filter(
                Transaction.description.ilike(m_term) | Transaction.raw_narration.ilike(m_term)
            )

        # Apply date range
        if "start_date" in filters and "end_date" in filters:
            q = q.filter(
                Transaction.date >= filters["start_date"],
                Transaction.date <= filters["end_date"]
            )

        # 1. Execute exact SQL aggregation
        total_tx_count = q.count()
        
        if total_tx_count == 0:
            calc_node = CalculationNode(
                operation=intent,
                field="amount",
                filter_desc=str(filters),
                result=0.0,
                count=0,
                period=period
            )
            return EvidencePackage(
                question=query,
                period=period,
                calculation=calc_node,
                evidence=[],
                top_merchants=[]
            )

        if intent == "COUNT":
            computed_result = float(total_tx_count)
        elif intent == "MAX":
            max_val = q.with_entities(func.max(func.abs(Transaction.amount))).scalar()
            computed_result = float(max_val or 0.0)
        elif intent == "MIN":
            min_val = q.with_entities(func.min(func.abs(Transaction.amount))).scalar()
            computed_result = float(min_val or 0.0)
        elif intent == "AVG":
            avg_val = q.with_entities(func.avg(func.abs(Transaction.amount))).scalar()
            computed_result = float(avg_val or 0.0)
        else:  # SUM
            sum_val = q.with_entities(func.sum(func.abs(Transaction.amount))).scalar()
            computed_result = float(sum_val or 0.0)

        # 2. Extract Top Evidence records (up to 20 transactions)
        evidence_txs = q.order_by(desc(func.abs(Transaction.amount))).limit(20).all()
        evidence_records = [
            EvidenceRecord(
                transaction_id=str(t.id),
                date=str(t.date),
                description=t.description or t.raw_narration,
                amount=float(abs(t.amount)),
                category=t.category,
                source_document=t.source_id or "Bank Statement",
                source_page=t.source_page_number or 1
            )
            for t in evidence_txs
        ]

        # 3. Top merchant groupings
        merchant_groups = (
            q.with_entities(
                Transaction.description,
                func.sum(func.abs(Transaction.amount)).label("m_total"),
                func.count(Transaction.id).label("m_count")
            )
            .group_by(Transaction.description)
            .order_by(desc("m_total"))
            .limit(5)
            .all()
        )
        top_merchants = [
            {"merchant": m[0] or "Unknown", "total": float(m[1]), "count": m[2]}
            for m in merchant_groups if m[0]
        ]

        calc_node = CalculationNode(
            operation=intent,
            field="amount",
            filter_desc=str(filters),
            result=round(computed_result, 2),
            count=total_tx_count,
            period=period
        )

        return EvidencePackage(
            question=query,
            period=period,
            calculation=calc_node,
            evidence=evidence_records,
            top_merchants=top_merchants
        )
