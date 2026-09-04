import calendar
import datetime
import json
import logging
import re
import statistics
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.models import ReviewState, Transaction
from app.services.anomaly_detector import detect_spending_anomalies
from app.services.loans import calculate_emi

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


class FinancialMetrics(BaseModel):
    total_inflow: float = 0.0
    total_outflow: float = 0.0
    net_flow: float = 0.0
    transaction_count: int = 0
    average_amount: float = 0.0
    max_amount: float = 0.0
    min_amount: float = 0.0
    currency: str = "INR"


class FinancialAggregates(BaseModel):
    category_breakdown: List[Dict[str, Any]] = Field(default_factory=list)
    top_merchants: List[Dict[str, Any]] = Field(default_factory=list)


class LoanAffordabilityNode(BaseModel):
    principal: float
    annual_rate: float
    tenure_months: int
    tenure_years: float
    monthly_emi: float
    total_payment: float
    total_interest: float
    monthly_net_income: float
    foir_percentage: float
    max_recommended_emi: float
    max_affordable_loan: float
    status: str
    verdict: str


class EvidencePackage(BaseModel):
    question: str
    period: str
    metrics: FinancialMetrics = Field(default_factory=FinancialMetrics)
    aggregates: FinancialAggregates = Field(default_factory=FinancialAggregates)
    anomalies: List[Dict[str, Any]] = Field(default_factory=list)
    transaction_samples: List[EvidenceRecord] = Field(default_factory=list)
    loan_analysis: Optional[LoanAffordabilityNode] = None

    # Backwards-compatibility fields for legacy UI and tests
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


def extract_loan_parameters(query: str) -> Optional[Dict[str, Any]]:
    q = query.lower().replace(",", "")

    # Check if query is asking about loan/house/car/borrowing affordability or EMI
    loan_markers = [
        "loan", "home loan", "house loan", "car loan", "personal loan",
        "mortgage", "emi", "borrow", "afford an house", "afford a house",
        "afford a home", "afford a flat", "afford an apartment", "afford a car",
        "afford a loan", "afford an loan"
    ]
    is_loan_query = any(w in q for w in loan_markers) or (
        ("afford" in q or "buy" in q) and any(w in q for w in ["interest", "lac", "lakh", "crore", "emi", "tenure", "years"])
    )

    if not is_loan_query:
        return None

    # 1. Extract Principal Amount
    principal = None

    # Check crore: e.g. "1.5 cr", "2 crore"
    cr_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)\b", q)
    if cr_match:
        principal = float(cr_match.group(1)) * 10_000_000

    # Check lakh / lac: e.g. "60 lac", "60 lakh", "60l"
    if not principal:
        lakh_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:lac|lacs|lakh|lakhs|l)\b", q)
        if lakh_match:
            principal = float(lakh_match.group(1)) * 100_000

    # Check thousand / k: e.g. "50k", "500 thousand"
    if not principal:
        k_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:k|thousand)\b", q)
        if k_match:
            principal = float(k_match.group(1)) * 1_000

    # Check raw numeric amounts (e.g. 5000000)
    if not principal:
        raw_match = re.search(r"(?:loan of|loan for|amount of|borrow)?\s*(?:rs\.?|₹)?\s*(\d{5,10})\b", q)
        if raw_match:
            principal = float(raw_match.group(1))

    # Fallback principal if loan detected but amount missing
    if not principal:
        principal = 5_000_000.0  # ₹50 Lakhs default

    # 2. Extract Tenure
    tenure_months = None
    year_match = re.search(r"(\d+)\s*(?:years|year|yr|yrs)\b", q)
    if year_match:
        tenure_months = int(year_match.group(1)) * 12
    else:
        month_match = re.search(r"(\d+)\s*(?:months|month|mo|mos)\b", q)
        if month_match:
            tenure_months = int(month_match.group(1))

    if not tenure_months:
        if any(w in q for w in ["home", "house", "property", "flat", "apartment"]):
            tenure_months = 240  # 20 years standard home loan
        elif "car" in q:
            tenure_months = 60  # 5 years standard auto loan
        else:
            tenure_months = 240 if principal >= 2_000_000 else 60

    # 3. Extract Annual Interest Rate
    rate = None
    rate_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:%|percent|pct)\b", q)
    if rate_match:
        rate = float(rate_match.group(1))
    else:
        rate_words = re.search(r"interest(?:\s*rate)?(?:\s*of)?\s*(\d+(?:\.\d+)?)", q)
        if rate_words:
            rate = float(rate_words.group(1))

    if not rate:
        rate = 8.5  # standard current retail benchmark rate in India

    return {
        "principal": float(principal),
        "annual_rate": float(rate),
        "tenure_months": int(tenure_months),
        "tenure_years": round(tenure_months / 12, 1),
    }


class FinancialQueryPlanner:
    """
    Translates NLP queries into deterministic SQL filters.
    Computes mathematical truth directly in PostgreSQL and produces an Immutable Evidence Package.
    """

    def parse_intent(self, user_query: str) -> Dict[str, Any]:
        q = user_query.lower()
        filters: Dict[str, Any] = {}

        # 0. Check for Loan / Affordability Planning intent
        loan_params = extract_loan_parameters(user_query)
        if loan_params:
            return {
                "intent": "LOAN_AFFORDABILITY",
                "filters": {"loan_params": loan_params},
                "period": f"{loan_params['tenure_years']:.0f} Years",
            }

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

        # Handle Loan & EMI Affordability queries deterministically
        if intent == "LOAN_AFFORDABILITY":
            loan_params = filters.get("loan_params", {})
            principal = float(loan_params.get("principal", 5_000_000.0))
            annual_rate = float(loan_params.get("annual_rate", 8.5))
            tenure_months = int(loan_params.get("tenure_months", 240))
            tenure_years = float(loan_params.get("tenure_years", 20.0))

            # Calculate exact monthly EMI using reducing balance amortization
            monthly_emi = calculate_emi(principal, annual_rate, tenure_months)
            total_payment = round(monthly_emi * tenure_months, 2)
            total_interest = round(total_payment - principal, 2)

            # Query verified income credits from the database
            income_txs = (
                db_session.query(Transaction)
                .filter(
                    Transaction.user_id == user_id,
                    Transaction.amount > 0,
                    Transaction.is_excluded_from_spending == False,
                )
                .order_by(desc(Transaction.date))
                .all()
            )

            # Look for payroll / salary transactions
            salary_credits = [
                float(t.amount)
                for t in income_txs
                if (t.category and any(k in t.category.lower() for k in ["salary", "income", "payroll"]))
                or (t.subcategory and "payroll" in t.subcategory.lower())
                or (t.raw_narration and any(k in t.raw_narration.lower() for k in ["salary", "neftcr", "payroll", "bofa", "corp"]))
            ]

            if salary_credits:
                monthly_net_income = round(float(statistics.median(salary_credits[:6])), 2)
            elif income_txs:
                recent_amounts = [float(t.amount) for t in income_txs[:6]]
                monthly_net_income = round(float(statistics.mean(recent_amounts)), 2)
            else:
                monthly_net_income = 0.0

            # FOIR (Fixed Obligation to Income Ratio)
            if monthly_net_income > 0:
                foir_pct = round((monthly_emi / monthly_net_income) * 100.0, 1)
            else:
                foir_pct = 0.0

            # Max recommended EMI (40% FOIR)
            max_recommended_emi_40 = round(monthly_net_income * 0.40, 2)

            # Max affordable loan principal at 40% FOIR
            if annual_rate > 0 and tenure_months > 0 and max_recommended_emi_40 > 0:
                r_dec = Decimal(str(annual_rate)) / Decimal("12") / Decimal("100")
                n_dec = tenure_months
                factor = ((Decimal("1") + r_dec) ** n_dec - Decimal("1")) / (r_dec * ((Decimal("1") + r_dec) ** n_dec))
                max_affordable_principal = round(float(Decimal(str(max_recommended_emi_40)) * factor), 2)
            else:
                max_affordable_principal = 0.0

            if foir_pct <= 40.0 and monthly_net_income > 0:
                status = "AFFORDABLE"
                verdict = f"Affordable. Monthly EMI of ₹{monthly_emi:,.2f} is within safe banking guidelines ({foir_pct}% of income)."
            elif foir_pct <= 50.0 and monthly_net_income > 0:
                status = "STRETCHED"
                verdict = f"Stretched. Monthly EMI of ₹{monthly_emi:,.2f} consumes {foir_pct}% of your income (at the 50% bank maximum ceiling)."
            else:
                status = "UNAFFORDABLE"
                verdict = f"Unaffordable. Monthly EMI of ₹{monthly_emi:,.2f} consumes {foir_pct}% of verified income (exceeds bank 50% FOIR cap and risks rejection)."

            loan_node = LoanAffordabilityNode(
                principal=principal,
                annual_rate=annual_rate,
                tenure_months=tenure_months,
                tenure_years=tenure_years,
                monthly_emi=monthly_emi,
                total_payment=total_payment,
                total_interest=total_interest,
                monthly_net_income=monthly_net_income,
                foir_percentage=foir_pct,
                max_recommended_emi=max_recommended_emi_40,
                max_affordable_loan=max_affordable_principal,
                status=status,
                verdict=verdict,
            )

            calc_node = CalculationNode(
                operation="LOAN_AFFORDABILITY",
                field="monthly_emi",
                filter_desc=f"Loan ₹{principal:,.0f} @ {annual_rate}% for {tenure_years:.0f}y",
                result=monthly_emi,
                count=len(income_txs),
                period=f"{tenure_years:.0f} Years",
            )

            evidence_records = [
                EvidenceRecord(
                    transaction_id=str(t.id),
                    date=str(t.date),
                    description=t.description or t.raw_narration,
                    amount=float(abs(t.amount)),
                    category=t.category,
                    source_document=t.source_id or "Bank Statement",
                    source_page=t.source_page_number or 1,
                )
                for t in income_txs[:5]
            ]

            return EvidencePackage(
                question=query,
                period=f"{tenure_years:.0f} Years",
                metrics=FinancialMetrics(
                    total_inflow=monthly_net_income,
                    total_outflow=monthly_emi,
                    net_flow=round(monthly_net_income - monthly_emi, 2),
                    transaction_count=len(income_txs),
                    currency="INR",
                ),
                aggregates=FinancialAggregates(),
                anomalies=[],
                transaction_samples=evidence_records,
                calculation=calc_node,
                evidence=evidence_records,
                top_merchants=[],
                loan_analysis=loan_node,
            )

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
                metrics=FinancialMetrics(transaction_count=0),
                aggregates=FinancialAggregates(),
                anomalies=[],
                transaction_samples=[],
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

        # 4. Category breakdown
        cat_groups = (
            q.with_entities(
                Transaction.category,
                func.sum(func.abs(Transaction.amount)).label("cat_total"),
                func.count(Transaction.id).label("cat_count")
            )
            .group_by(Transaction.category)
            .order_by(desc("cat_total"))
            .limit(5)
            .all()
        )
        category_breakdown = [
            {"category": c[0] or "Uncategorized", "total": float(c[1]), "count": c[2]}
            for c in cat_groups if c[0]
        ]

        # 5. Financial metrics calculation
        total_inflow = float(
            db_session.query(func.sum(Transaction.amount))
            .filter(Transaction.user_id == user_id, Transaction.amount > 0)
            .scalar() or 0.0
        )
        total_outflow = float(
            db_session.query(func.sum(func.abs(Transaction.amount)))
            .filter(Transaction.user_id == user_id, Transaction.amount < 0, Transaction.is_excluded_from_spending == False)
            .scalar() or 0.0
        )
        avg_val = float(q.with_entities(func.avg(func.abs(Transaction.amount))).scalar() or 0.0)
        max_val = float(q.with_entities(func.max(func.abs(Transaction.amount))).scalar() or 0.0)
        min_val = float(q.with_entities(func.min(func.abs(Transaction.amount))).scalar() or 0.0)

        metrics = FinancialMetrics(
            total_inflow=round(total_inflow, 2),
            total_outflow=round(total_outflow, 2),
            net_flow=round(total_inflow - total_outflow, 2),
            transaction_count=total_tx_count,
            average_amount=round(avg_val, 2),
            max_amount=round(max_val, 2),
            min_amount=round(min_val, 2),
            currency="INR"
        )

        # 6. Evaluate spending anomalies
        tx_dicts = [
            {
                "id": str(t.id),
                "amount": float(t.amount),
                "category": t.category,
                "description": t.description or t.raw_narration,
                "date": str(t.date),
                "raw_text": t.raw_narration
            }
            for t in evidence_txs
        ]
        try:
            detected_anomalies = detect_spending_anomalies(tx_dicts)
        except Exception as anomaly_err:
            logger.debug(f"Anomaly evaluation skipped: {anomaly_err}")
            detected_anomalies = []

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
            metrics=metrics,
            aggregates=FinancialAggregates(
                category_breakdown=category_breakdown,
                top_merchants=top_merchants
            ),
            anomalies=detected_anomalies,
            transaction_samples=evidence_records,
            calculation=calc_node,
            evidence=evidence_records,
            top_merchants=top_merchants
        )
