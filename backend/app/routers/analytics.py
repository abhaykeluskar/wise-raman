import uuid
import logging
from decimal import Decimal
from typing import List, Optional, Dict, Any
from datetime import date as date_type, timedelta, datetime
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_, case

from app.database import get_db
from app.models import (
    Account, AccountSubtype, AccountClassification, Transaction, TransactionType,
    CreditCard, CreditCardStatement, Loan, FinancialGoal,
    InsurancePolicy, MandateRecord, Payslip, CustomSubscription
)
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Analytics & Planning"])

class FinancialGoalCreate(BaseModel):
    name: str
    category: str = "EMERGENCY_FUND"
    target_amount: Decimal
    current_amount: Decimal = Decimal("0.00")
    monthly_contribution: Decimal = Decimal("0.00")
    target_date: Optional[date_type] = None
    priority: str = "MEDIUM"

class FinancialGoalUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    target_amount: Optional[Decimal] = None
    current_amount: Optional[Decimal] = None
    monthly_contribution: Optional[Decimal] = None
    target_date: Optional[date_type] = None
    priority: Optional[str] = None

class BudgetCreateRequest(BaseModel):
    category: str
    monthly_limit: Decimal
    budget_mode: Optional[str] = "ROLLOVER_SURPLUS_ONLY"

class GoalAllocationRequest(BaseModel):
    account_id: uuid.UUID
    amount: Decimal
    notes: Optional[str] = None

class GoalReleaseRequest(BaseModel):
    amount: Decimal
    notes: Optional[str] = None

@router.get("/reports/spending")
def get_spending_report(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    query = db.query(
        func.to_char(Transaction.date, "YYYY-MM").label("month"),
        Transaction.category,
        func.sum(func.abs(Transaction.amount)).label("total")
    ).join(Account).filter(
        Transaction.amount < 0,
        Transaction.user_id == current_user.id,
        Transaction.is_excluded_from_spending == False,
        Transaction.category != "Salary/Income",
        Transaction.category != "Processing...",
        Transaction.category != "Transfer"
    )
    
    transfer_keywords = ['NEFT', 'RTGS', 'IMPS', 'TRANSFER', 'ATM', 'CASH WITHDRAWAL', 'EMI', 'AUTO DEBIT']
    transfer_conditions = [~Transaction.description.ilike(f'%{kw}%') for kw in transfer_keywords]
    
    query = query.filter(
        or_(
            Account.subtype == AccountSubtype.CREDIT_CARD,
            and_(
                Account.subtype.in_([AccountSubtype.SAVINGS, AccountSubtype.CURRENT]),
                *transfer_conditions
            )
        )
    ).group_by(
        "month",
        Transaction.category
    ).order_by("month")
    
    results = query.all()
    
    data_map = {}
    categories_found = set()
    for month, category, total in results:
        if month not in data_map:
            data_map[month] = {"month": month}
        data_map[month][category] = float(total)
        categories_found.add(category)
        
    formatted_data = []
    for m in sorted(data_map.keys()):
        row = data_map[m]
        for cat in categories_found:
            if cat not in row:
                row[cat] = 0.0
        formatted_data.append(row)
        
    return {
        "categories": list(categories_found),
        "data": formatted_data
    }

class AiReportRequest(BaseModel):
    period_type: str = "month"  # "month" | "quarter" | "year"
    period_value: str = "2026-08"

def resolve_period_range(period_type: str, period_value: str):
    import calendar
    today = date_type.today()
    try:
        if period_type == "quarter":
            parts = period_value.split("-Q")
            year = int(parts[0])
            q = int(parts[1])
            q_months = {1: (1, 3), 2: (4, 6), 3: (7, 9), 4: (10, 12)}
            start_m, end_m = q_months.get(q, (1, 3))
            start_date = date_type(year, start_m, 1)
            last_day = calendar.monthrange(year, end_m)[1]
            end_date = date_type(year, end_m, last_day)
            label = f"Q{q} {year}"
        elif period_type == "year":
            year = int(period_value)
            start_date = date_type(year, 1, 1)
            end_date = date_type(year, 12, 31)
            label = f"Full Year {year}"
        else:  # month
            parts = period_value.split("-")
            year = int(parts[0])
            month = int(parts[1])
            last_day = calendar.monthrange(year, month)[1]
            start_date = date_type(year, month, 1)
            end_date = date_type(year, month, last_day)
            label = datetime(year, month, 1).strftime("%B %Y")
    except Exception:
        start_date = date_type(today.year, today.month, 1)
        last_day = calendar.monthrange(today.year, today.month)[1]
        end_date = date_type(today.year, today.month, last_day)
        label = today.strftime("%B %Y")
    return start_date, end_date, label

def synthesize_ai_report(period_label, total_income, total_expense, net_savings, savings_rate, sorted_categories, top_expenses, grade):
    from app.ai import query_ollama_json

    top_cat_summary = ", ".join([f"{c['category']} (₹{c['amount']:,.0f} - {c['percentage']}%)" for c in sorted_categories[:3]]) if sorted_categories else "No categorized expenses"
    top_exp_summary = ", ".join([f"{e['merchant']}: ₹{e['amount']:,.0f}" for e in top_expenses[:3]]) if top_expenses else "No single large outflows"

    prompt = f"""You are WiseRaman, an expert personal wealth intelligence advisor. Analyze this user's financial performance for {period_label}.
Financial Metrics:
- Total Income: ₹{total_income:,.2f}
- Total Outflow: ₹{total_expense:,.2f}
- Net Surplus/Savings: ₹{net_savings:,.2f}
- Savings Rate: {savings_rate:.1f}%
- Discipline Grade: {grade}
- Top Spending Categories: {top_cat_summary}
- Notable Outflows: {top_exp_summary}

Respond in strictly valid JSON with these exact 3 keys:
{{
  "ai_summary": "A concise 2-sentence executive summary evaluating cash flow posture and capital retention.",
  "insights": ["Key observation 1 on primary spending drivers", "Key observation 2 on cash flow velocity", "Key observation 3 on savings discipline"],
  "recommendations": ["Actionable financial recommendation 1", "Actionable financial recommendation 2", "Actionable financial recommendation 3"]
}}"""

    try:
        res = query_ollama_json(prompt, timeout=10)
        if isinstance(res, dict) and "ai_summary" in res and "insights" in res and "recommendations" in res:
            return res["ai_summary"], res["insights"], res["recommendations"]
    except Exception as e:
        logger.info(f"Ollama structured generation fallback to deterministic synthesis: {e}")

    # High quality domain-grounded synthesis fallback
    primary_cat = sorted_categories[0]['category'] if sorted_categories else "Living Expenses"
    primary_pct = sorted_categories[0]['percentage'] if sorted_categories else 0.0

    if savings_rate >= 35:
        summary = (
            f"For {period_label}, you maintained an outstanding net surplus of ₹{net_savings:,.2f} with a {savings_rate:.1f}% savings rate. "
            f"Your cash flow posture is in aggressive expansion, significantly outperforming industry benchmark savings rates."
        )
    elif savings_rate >= 15:
        summary = (
            f"For {period_label}, you achieved a healthy net positive buffer of ₹{net_savings:,.2f} ({savings_rate:.1f}% savings rate). "
            f"Discretionary outflows in {primary_cat} accounted for {primary_pct:.1f}% of total expenditures."
        )
    elif savings_rate >= 0:
        summary = (
            f"During {period_label}, cash flows remained closely balanced with a net surplus of ₹{net_savings:,.2f} ({savings_rate:.1f}% savings rate). "
            f"Operational reserves are stable, but tighter discretionary budget caps will accelerate wealth generation."
        )
    else:
        summary = (
            f"During {period_label}, total outflows (₹{total_expense:,.2f}) exceeded income (₹{total_income:,.2f}) by ₹{abs(net_savings):,.2f}. "
            f"Corrective budget reallocation is recommended to protect long-term liquid reserves."
        )

    insights = [
        f"Primary Expense Driver: {primary_cat} comprised {primary_pct:.1f}% of all spending (₹{sorted_categories[0]['amount']:,.2f})." if sorted_categories else "Outflows were distributed evenly across essential categories.",
        f"Notable Single Outflow: {top_expenses[0]['merchant']} charged ₹{top_expenses[0]['amount']:,.2f} on {top_expenses[0]['date']}." if top_expenses else "No single transaction exceeded standard operating thresholds.",
        f"Capital Retention Rate: Your {savings_rate:.1f}% retention indicates a {'strong capital retention discipline' if savings_rate >= 20 else 'vulnerability to unexpected liquidity shocks'}."
    ]

    recommendations = [
        f"Implement a 15% target reduction on discretionary {primary_cat} expenses to redirect ~₹{(sorted_categories[0]['amount'] * 0.15):,.0f} into liquid investments." if sorted_categories else "Maintain active review on non-recurring transactions.",
        f"Allocate at least ₹{max(5000, int(abs(net_savings) * 0.35)):,.0f} toward automated index fund SIPs or emergency buffer replenishment.",
        "Audit recurring digital subscriptions and auto-debits before monthly billing cutoffs to prevent passive fee leakage."
    ]

    return summary, insights, recommendations

@router.post("/reports/ai-generate")
def generate_ai_report(request: AiReportRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Generates an AI-driven financial executive intelligence report for month, quarter, or year."""
    start_date, end_date, period_label = resolve_period_range(request.period_type, request.period_value)

    txs = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.date >= start_date,
        Transaction.date <= end_date,
        Transaction.is_excluded_from_spending == False
    ).order_by(Transaction.date.desc()).all()

    total_income = Decimal("0.00")
    total_expense = Decimal("0.00")
    categories_spend = defaultdict(Decimal)
    large_expenses = []

    for t in txs:
        amt = Decimal(str(t.amount or 0))
        is_transfer = (
            t.category == "Transfer"
            or t.transaction_type in [TransactionType.TRANSFER_INTERNAL, TransactionType.CC_BILL_PAYMENT, TransactionType.CC_PAYMENT_RECEIVED]
        )
        is_inflow = (t.transaction_type == TransactionType.INCOME or amt > 0)
        
        if is_inflow and not is_transfer:
            total_income += abs(amt)
        elif not is_inflow and not is_transfer:
            val = abs(amt)
            total_expense += val
            cat = t.category or "Other"
            categories_spend[cat] += val
            if val >= Decimal("500.00"):
                large_expenses.append({
                    "date": str(t.date),
                    "description": t.description or t.raw_narration or "Expense",
                    "merchant": t.description or "Expense",
                    "category": cat,
                    "amount": float(val)
                })

    net_savings = total_income - total_expense
    savings_rate = float((net_savings / total_income * Decimal("100.00")).quantize(Decimal("0.1"))) if total_income > 0 else 0.0

    sorted_categories = []
    for cat_name, cat_val in sorted(categories_spend.items(), key=lambda x: x[1], reverse=True):
        pct = float((cat_val / total_expense * Decimal("100.00")).quantize(Decimal("0.1"))) if total_expense > 0 else 0.0
        sorted_categories.append({
            "category": cat_name,
            "amount": float(cat_val),
            "percentage": pct
        })

    large_expenses.sort(key=lambda x: x["amount"], reverse=True)
    top_expenses = large_expenses[:5]

    if savings_rate >= 40:
        grade = "A+"
        grade_desc = "Exceptional Wealth Accumulation Discipline"
    elif savings_rate >= 25:
        grade = "A"
        grade_desc = "Solid Savings Rate (Exceeds Industry Standards)"
    elif savings_rate >= 15:
        grade = "B+"
        grade_desc = "Healthy Foundation with Expense Optimization Scope"
    elif savings_rate >= 0:
        grade = "B"
        grade_desc = "Break-even / Thin Buffer"
    else:
        grade = "C"
        grade_desc = "Deficit Spending Alert"

    ai_summary, insights, recommendations = synthesize_ai_report(
        period_label=period_label,
        total_income=float(total_income),
        total_expense=float(total_expense),
        net_savings=float(net_savings),
        savings_rate=savings_rate,
        sorted_categories=sorted_categories,
        top_expenses=top_expenses,
        grade=grade
    )

    return {
        "period_type": request.period_type,
        "period_value": request.period_value,
        "period_label": period_label,
        "start_date": str(start_date),
        "end_date": str(end_date),
        "transaction_count": len(txs),
        "metrics": {
            "total_income": float(total_income),
            "total_expense": float(total_expense),
            "net_savings": float(net_savings),
            "savings_rate": savings_rate
        },
        "grade": {
            "score": grade,
            "label": grade_desc
        },
        "categories": sorted_categories,
        "top_expenses": top_expenses,
        "ai_summary": ai_summary,
        "insights": insights,
        "recommendations": recommendations,
        "generated_at": datetime.now().isoformat()
    }

@router.get("/analytics/savings/cashflow")
def get_savings_cashflow(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    query = db.query(
        func.to_char(Transaction.date, "YYYY-MM").label("month"),
        func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)).label("cash_in"),
        func.sum(case((Transaction.amount < 0, Transaction.amount), else_=0)).label("cash_out")
    ).join(Account).filter(
        Account.user_id == current_user.id,
        Account.subtype.in_([AccountSubtype.SAVINGS, AccountSubtype.CURRENT]),
        Transaction.is_excluded_from_spending == False
    ).group_by("month").order_by("month")
    
    results = query.all()
    data = []
    for month, cash_in, cash_out in results:
        data.append({
            "month": month,
            "cash_in": float(cash_in) if cash_in else 0.0,
            "cash_out": float(cash_out) if cash_out else 0.0
        })
    return data

@router.get("/net-worth")
def get_net_worth(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()
    total_assets = 0.0
    total_liabilities = 0.0
    breakdown = {}

    for acc in accounts:
        val = float(acc.balance)
        subtype = acc.subtype.value
        if acc.classification == AccountClassification.ASSET:
            total_assets += val
            breakdown[subtype] = breakdown.get(subtype, 0.0) + val
        else:
            debt = abs(val)
            total_liabilities += debt
            breakdown[subtype] = breakdown.get(subtype, 0.0) + debt

    return {
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "net_worth": total_assets - total_liabilities,
        "breakdown": breakdown
    }

@router.get("/analytics/cashflow")
def get_cashflow(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    today = date_type.today()
    twelve_months_ago = today - timedelta(days=365)
    start_date = twelve_months_ago.replace(day=1)

    query = db.query(
        func.to_char(Transaction.date, "Mon YYYY").label("month_str"),
        func.to_char(Transaction.date, "YYYY-MM").label("month_sort"),
        func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)).label("cash_in"),
        func.sum(case((Transaction.amount < 0, func.abs(Transaction.amount)), else_=0)).label("cash_out")
    ).filter(
        Transaction.user_id == current_user.id,
        Transaction.is_excluded_from_spending == False,
        Transaction.date >= start_date
    ).group_by("month_str", "month_sort").order_by("month_sort")
    
    results = query.all()
    data = []
    for row in results:
        data.append({
            "month": row.month_str,
            "cash_in": float(row.cash_in) if row.cash_in else 0.0,
            "cash_out": float(row.cash_out) if row.cash_out else 0.0
        })
    return data

@router.get("/health-score")
def get_financial_health_score_api(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.health_score import calculate_financial_health_score

    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()
    cards = db.query(CreditCard).filter(CreditCard.user_id == current_user.id).all()
    loans = db.query(Loan).filter(Loan.user_id == current_user.id).all()
    txns = db.query(Transaction).filter(Transaction.user_id == current_user.id).all()

    liquid_reserves = sum(float(a.balance or 0) for a in accounts if a.subtype in [AccountSubtype.SAVINGS, AccountSubtype.CURRENT])
    total_credit_limit = sum(float(c.monthly_cap or (c.account.credit_limit if c.account else 0) or 0) for c in cards)
    current_credit_spend = sum(float(c.account.balance or 0) for c in cards if c.account)
    monthly_emi = sum(float(l.emi_amount or 0) for l in loans)

    incomes = [float(t.amount) for t in txns if float(t.amount) > 0 and t.category == "Salary/Income"]
    monthly_income = (sum(incomes) / max(1, len(incomes))) if incomes else 0.0

    expenses = [abs(float(t.amount)) for t in txns if float(t.amount) < 0 and not t.is_excluded_from_spending]
    monthly_expenses = (sum(expenses) / 3.0) if len(expenses) > 0 else 0.0
    months_count = 6 if len(txns) >= 10 else 2

    investments = [abs(float(t.amount)) for t in txns if float(t.amount) < 0 and t.category == "Investment"]
    monthly_investments = (sum(investments) / 3.0) if len(investments) > 0 else 0.0

    return calculate_financial_health_score(
        monthly_income=monthly_income,
        monthly_expenses=monthly_expenses,
        monthly_emi=monthly_emi,
        liquid_reserves=liquid_reserves,
        total_credit_limit=total_credit_limit,
        current_credit_spend=current_credit_spend,
        monthly_investments=monthly_investments,
        months_of_history=months_count,
        account_count=len(accounts),
        card_count=len(cards)
    )

@router.get("/analytics/anomalies")
def get_spending_anomalies_api(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.anomaly_detector import detect_spending_anomalies
    txns = db.query(Transaction).filter(Transaction.user_id == current_user.id).all()
    txn_dicts = [
        {
            "id": str(t.id),
            "amount": float(t.amount),
            "date": str(t.date),
            "raw_text": t.raw_text,
            "description": t.description,
            "category": t.category
        }
        for t in txns
    ]
    return detect_spending_anomalies(txn_dicts)

def _get_user_calendar_payload(db: Session, current_user):
    from app.services.financial_calendar import build_financial_calendar
    from app.services.mandates import detect_mandates

    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()
    liquid_balance = sum(float(a.balance or 0) for a in accounts if a.subtype in [AccountSubtype.SAVINGS, AccountSubtype.CURRENT])

    debit_txns = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.amount < 0,
        Transaction.is_excluded_from_spending == False
    ).order_by(Transaction.date).all()

    groups = defaultdict(list)
    for tx in debit_txns:
        desc = tx.description or tx.raw_text
        if desc:
            groups[desc.strip()].append(tx)

    subscriptions = []
    for desc, txs in groups.items():
        if len(txs) < 2:
            continue
        amounts = [abs(float(tx.amount)) for tx in txs]
        avg_amt = sum(amounts) / len(amounts)
        last_tx = txs[-1]
        subscriptions.append({
            "name": desc,
            "amount": round(avg_amt, 2),
            "frequency": "Monthly",
            "next_expected_date": (last_tx.date + timedelta(days=30)).isoformat(),
            "day": last_tx.date.day,
            "category": last_tx.category or "Subscription"
        })

    custom_subs = db.query(CustomSubscription).filter(
        CustomSubscription.user_id == current_user.id,
        CustomSubscription.is_active == True
    ).all()
    for cs in custom_subs:
        subscriptions.append({
            "name": cs.name,
            "amount": float(cs.amount),
            "frequency": cs.frequency.capitalize() if cs.frequency else "Monthly",
            "next_expected_date": cs.next_renewal_date.isoformat() if cs.next_renewal_date else None,
            "day": cs.billing_day or 1,
            "category": cs.category
        })

    cards = db.query(CreditCard).filter(CreditCard.user_id == current_user.id).all()
    card_dicts = [
        {
            "card_name": c.card_name,
            "current_balance": float(c.account.balance or 0) if c.account else 0.0,
            "payment_due_day": c.statement_date or 10,
            "statement_date": c.statement_date
        }
        for c in cards
    ]

    loans = db.query(Loan).filter(Loan.user_id == current_user.id).all()
    loan_dicts = [
        {
            "loan_name": l.loan_name,
            "emi_amount": float(l.emi_amount or 0),
            "due_day": l.next_due_date.day if hasattr(l, "next_due_date") and l.next_due_date else 10,
            "principal_remaining": float(l.outstanding_balance or 0)
        }
        for l in loans
    ]

    policies = db.query(InsurancePolicy).filter(InsurancePolicy.user_id == current_user.id, InsurancePolicy.is_active == True).all()
    insurance_dicts = [
        {
            "policy_name": p.policy_name,
            "premium_amount": float(p.premium_amount),
            "renewal_date": p.renewal_date.isoformat(),
            "frequency": p.premium_frequency
        }
        for p in policies
    ]

    mandates = db.query(MandateRecord).filter(MandateRecord.user_id == current_user.id, MandateRecord.is_active == True).all()
    mandate_dicts = [
        {
            "biller_name": m.biller_name,
            "amount": float(m.amount or 0),
            "mandate_type": m.mandate_type,
            "next_debit_date": str(m.next_debit_date) if m.next_debit_date else None
        }
        for m in mandates
    ]
    if not mandate_dicts:
        all_txns = db.query(Transaction).filter(Transaction.user_id == current_user.id).all()
        txn_dicts = [{"id": str(t.id), "amount": float(t.amount), "date": str(t.date), "raw_text": t.raw_text, "description": t.description} for t in all_txns]
        detected = detect_mandates(txn_dicts)
        mandate_dicts = [{"biller_name": d["biller_name"], "amount": d["amount"], "mandate_type": d["mandate_type"], "next_debit_date": d.get("next_debit_date")} for d in detected]

    monthly_salary = 0.0
    latest_payslip = db.query(Payslip).filter(Payslip.user_id == current_user.id).order_by(Payslip.created_at.desc()).first()
    if latest_payslip and latest_payslip.net_pay:
        monthly_salary = float(latest_payslip.net_pay)
    else:
        salary_txns = db.query(Transaction).filter(
            Transaction.user_id == current_user.id,
            Transaction.amount > 0,
            Transaction.category.ilike("%Salary%")
        ).order_by(Transaction.date.desc()).limit(3).all()
        if salary_txns:
            monthly_salary = float(salary_txns[0].amount)

    rent_amount = 0.0
    rent_day = 5
    rent_txns = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.amount < 0,
        Transaction.category.ilike("%Rent%")
    ).order_by(Transaction.date.desc()).limit(3).all()
    if rent_txns:
        rent_amount = abs(float(rent_txns[0].amount))
        rent_day = rent_txns[0].date.day

    return build_financial_calendar(
        liquid_balance=liquid_balance,
        subscriptions=subscriptions,
        credit_cards=card_dicts,
        loans=loan_dicts,
        insurance_policies=insurance_dicts,
        mandates=mandate_dicts,
        salary_amount=monthly_salary,
        salary_day=1,
        rent_amount=rent_amount,
        rent_day=rent_day,
        include_tax_deadlines=True
    )

@router.get("/analytics/financial-calendar")
def get_financial_calendar_api(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return _get_user_calendar_payload(db, current_user)

@router.get("/analytics/financial-calendar/export-ics")
def export_financial_calendar_ics_api(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.ics_export import generate_ics_calendar
    cal_data = _get_user_calendar_payload(db, current_user)
    events = cal_data.get("events", [])
    ics_text = generate_ics_calendar(
        events=events,
        calendar_name=f"WiseRaman - {current_user.name or 'Financial'} Calendar",
        reminder_days_before=2
    )
    return Response(
        content=ics_text,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=\"wiseraman_financial_calendar.ics\"",
            "Cache-Control": "no-cache"
        }
    )

@router.get("/budgets")
def api_get_budgets(year: Optional[int] = None, month: Optional[int] = None, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.budget_engine import get_or_create_monthly_budget_status
    now = date_type.today()
    y = year or now.year
    m = month or now.month
    return get_or_create_monthly_budget_status(db, current_user.id, y, m)

@router.post("/budgets")
def api_create_or_update_budget(req: BudgetCreateRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.budget_engine import set_envelope_budget
    from app.models import BudgetMode
    try:
        mode = BudgetMode(req.budget_mode)
    except ValueError:
        mode = BudgetMode.ROLLOVER_SURPLUS_ONLY

    budget = set_envelope_budget(
        db=db,
        user_id=current_user.id,
        category=req.category,
        monthly_limit=req.monthly_limit,
        budget_mode=mode
    )
    return {
        "message": f"Envelope budget for '{budget.category}' set to ₹{float(budget.monthly_limit):,.2f}",
        "budget_id": str(budget.id),
        "category": budget.category,
        "monthly_limit": float(budget.monthly_limit),
        "budget_mode": budget.budget_mode.value
    }

@router.delete("/budgets/{budget_id}")
def api_delete_budget(budget_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.budget_engine import delete_envelope_budget
    return delete_envelope_budget(db, current_user.id, budget_id)

@router.get("/goals")
def get_goals(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.goals import calculate_goal_projection
    goals = db.query(FinancialGoal).filter(FinancialGoal.user_id == current_user.id).order_by(FinancialGoal.created_at.desc()).all()
    return [calculate_goal_projection(g) for g in goals]

@router.post("/goals")
def create_goal(goal_data: FinancialGoalCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    goal = FinancialGoal(
        user_id=current_user.id,
        name=goal_data.name,
        category=goal_data.category,
        target_amount=goal_data.target_amount,
        current_amount=goal_data.current_amount,
        monthly_contribution=goal_data.monthly_contribution,
        target_date=goal_data.target_date,
        priority=goal_data.priority
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal

@router.put("/goals/{goal_id}")
def update_goal(goal_id: uuid.UUID, goal_data: FinancialGoalUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.goals import calculate_goal_projection
    goal = db.query(FinancialGoal).filter(FinancialGoal.id == goal_id, FinancialGoal.user_id == current_user.id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    if goal_data.name is not None:
        goal.name = goal_data.name
    if goal_data.category is not None:
        goal.category = goal_data.category
    if goal_data.target_amount is not None:
        goal.target_amount = goal_data.target_amount
    if goal_data.current_amount is not None:
        goal.current_amount = goal_data.current_amount
    if goal_data.monthly_contribution is not None:
        goal.monthly_contribution = goal_data.monthly_contribution
    if goal_data.priority is not None:
        goal.priority = goal_data.priority
    if goal_data.target_date is not None:
        goal.target_date = goal_data.target_date
    
    db.commit()
    db.refresh(goal)
    return calculate_goal_projection(goal)

@router.get("/goals/emergency-fund")
def get_emergency_fund_status(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.goals import calculate_emergency_fund_assessment
    return calculate_emergency_fund_assessment(db, str(current_user.id))

@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    g = db.query(FinancialGoal).filter(FinancialGoal.id == goal_id, FinancialGoal.user_id == current_user.id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(g)
    db.commit()
    return {"status": "deleted"}

@router.get("/accounts/{account_id}/goals-breakdown")
def api_account_goals_breakdown(account_id: uuid.UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.goals import get_account_virtual_allocation_breakdown
    return get_account_virtual_allocation_breakdown(db, account_id)

@router.post("/goals/{goal_id}/allocate")
def api_goal_allocate(goal_id: uuid.UUID, req: GoalAllocationRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.goals import allocate_funds_to_goal
    return allocate_funds_to_goal(
        db=db,
        user_id=current_user.id,
        goal_id=goal_id,
        account_id=req.account_id,
        amount=req.amount,
        notes=req.notes
    )

@router.post("/goals/{goal_id}/release")
def api_goal_release(goal_id: uuid.UUID, req: GoalReleaseRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.services.goals import release_funds_from_goal
    return release_funds_from_goal(
        db=db,
        user_id=current_user.id,
        goal_id=goal_id,
        amount=req.amount,
        notes=req.notes
    )
