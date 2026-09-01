from decimal import Decimal
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date

from app.models import Account, AccountSubtype, AccountClassification, Transaction, TransactionType, Loan, FixedDeposit, FinancialGoal

ESSENTIAL_CATEGORIES = [
    "Groceries", "Utilities", "Dining", "Healthcare", "Fuel", "Education",
    "Domestic Help", "Cook", "Maid", "Rent", "Electricity", "Gas", "Internet", "Society Maintenance"
]

def calculate_emergency_fund_assessment(db: Session, user_id: str) -> Dict[str, Any]:
    """
    Assesses Emergency Fund health:
    Essential Monthly Expenses = Avg monthly living expenses + Total Monthly EMIs + Monthly Insurance
    Liquid Assets = Savings + Current + FDs
    Coverage = Liquid Assets / Essential Monthly Expenses
    """
    # 1. Calculate liquid assets (Savings, Current, Active FDs)
    savings_accounts = db.query(Account).filter(
        Account.user_id == user_id,
        Account.classification == AccountClassification.ASSET,
        Account.subtype.in_([AccountSubtype.SAVINGS, AccountSubtype.CURRENT])
    ).all()
    
    total_savings = sum([Decimal(str(acc.balance or 0)) for acc in savings_accounts])

    active_fds = db.query(FixedDeposit).filter(
        FixedDeposit.user_id == user_id,
        FixedDeposit.is_active == True
    ).all()
    total_fds = sum([Decimal(str(fd.principal_amount or 0)) for fd in active_fds])

    liquid_reserves = total_savings + total_fds

    # 2. Monthly Loan EMIs
    active_loans = db.query(Loan).filter(Loan.user_id == user_id, Loan.is_active == True).all()
    monthly_emi_total = sum([Decimal(str(l.emi_amount or 0)) for l in active_loans])

    # 3. Monthly Essential Spending (Sample average from past transactions or default estimate)
    # Get last 90 days expenses in essential categories
    essential_txns = db.query(func.sum(Transaction.amount)).filter(
        Transaction.user_id == user_id,
        Transaction.transaction_type == TransactionType.EXPENSE,
        Transaction.is_excluded_from_spending == False,
        Transaction.category.in_(ESSENTIAL_CATEGORIES)
    ).scalar() or Decimal("0.0")

    # If user has transaction history, use monthly average (divide by 3 if 90 days), else baseline
    est_monthly_essential = abs(Decimal(str(essential_txns))) / Decimal("3") if abs(essential_txns) > 0 else Decimal("40000.00")
    total_monthly_burn = est_monthly_essential + monthly_emi_total

    if total_monthly_burn > 0:
        coverage_months = float((liquid_reserves / total_monthly_burn).quantize(Decimal("0.1")))
    else:
        coverage_months = 0.0

    recommended_fund_6m = total_monthly_burn * Decimal("6")
    shortfall = max(Decimal("0.0"), recommended_fund_6m - liquid_reserves)

    if coverage_months >= 6.0:
        status = "EXCELLENT"
        color = "#10B981" # Green
    elif coverage_months >= 3.0:
        status = "MODERATE"
        color = "#F59E0B" # Yellow
    elif coverage_months >= 1.0:
        status = "LOW"
        color = "#F97316" # Orange
    else:
        status = "CRITICAL"
        color = "#EF4444" # Red

    return {
        "liquid_reserves": float(liquid_reserves),
        "total_monthly_burn": float(total_monthly_burn),
        "essential_expenses": float(est_monthly_essential),
        "monthly_emis": float(monthly_emi_total),
        "coverage_months": coverage_months,
        "recommended_buffer_6m": float(recommended_fund_6m),
        "shortfall": float(shortfall),
        "status": status,
        "status_color": color
    }

def calculate_goal_projection(goal: FinancialGoal) -> Dict[str, Any]:
    target = Decimal(str(goal.target_amount or 0))
    current = Decimal(str(goal.current_amount or 0))
    monthly = Decimal(str(goal.monthly_contribution or 0))

    progress_pct = min(100.0, float((current / target * 100).quantize(Decimal("0.1")))) if target > 0 else 0.0
    remaining_amount = max(Decimal("0.0"), target - current)

    if monthly > 0:
        months_to_complete = int((remaining_amount / monthly).quantize(Decimal("1")))
    else:
        months_to_complete = None

    return {
        "id": str(goal.id),
        "name": goal.name,
        "category": goal.category,
        "target_amount": float(target),
        "current_amount": float(current),
        "monthly_contribution": float(monthly),
        "progress_percentage": progress_pct,
        "remaining_amount": float(remaining_amount),
        "estimated_months_left": months_to_complete,
        "priority": goal.priority,
        "is_completed": goal.is_completed
    }
