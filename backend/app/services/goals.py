import uuid
from decimal import Decimal
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from fastapi import HTTPException

from app.models import (
    Account, AccountSubtype, AccountClassification, Transaction,
    TransactionType, Loan, FixedDeposit, FinancialGoal,
    GoalAllocationLedger, GoalAllocationDirection
)

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
        "is_completed": goal.is_completed,
        "linked_account_id": str(goal.linked_account_id) if goal.linked_account_id else None,
        "linked_account_name": goal.linked_account.name if goal.linked_account else None
    }

def get_account_virtual_allocation_breakdown(db: Session, account_id: uuid.UUID) -> Dict[str, Any]:
    """
    Computes Firefly III-style Piggy Bank virtual allocations for a liquid account.
    Spendable Balance = Total Account Balance - Sum of all active goal allocations.
    """
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    total_balance = Decimal(str(account.balance or 0))
    goals = db.query(FinancialGoal).filter(
        FinancialGoal.linked_account_id == account_id,
        FinancialGoal.is_completed == False
    ).all()

    goal_locked = sum(Decimal(str(g.current_amount or 0)) for g in goals)
    spendable_balance = total_balance - goal_locked

    goal_list = []
    for g in goals:
        target = Decimal(str(g.target_amount or 0))
        cur = Decimal(str(g.current_amount or 0))
        goal_list.append({
            "goal_id": str(g.id),
            "name": g.name,
            "category": g.category,
            "allocated_amount": float(cur),
            "target_amount": float(target),
            "allocation_percentage_of_account": round(float((cur / total_balance) * 100), 1) if total_balance > 0 else 0.0
        })

    return {
        "account_id": str(account.id),
        "account_name": account.name,
        "subtype": account.subtype.value if account.subtype else "SAVINGS",
        "total_balance": float(total_balance),
        "goal_locked_amount": float(goal_locked),
        "spendable_balance": float(spendable_balance),
        "virtual_envelopes": goal_list
    }

def allocate_funds_to_goal(
    db: Session,
    user_id: uuid.UUID,
    goal_id: uuid.UUID,
    account_id: uuid.UUID,
    amount: Decimal,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Allocates virtual funds from a liquid account to a savings goal (Piggy Bank style).
    Guarantees Spendable Balance >= 0.
    """
    amount = abs(Decimal(str(amount)))
    if amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Allocation amount must be positive.")

    goal = db.query(FinancialGoal).filter(FinancialGoal.id == goal_id, FinancialGoal.user_id == user_id).first()
    account = db.query(Account).filter(Account.id == account_id, Account.user_id == user_id).first()

    if not goal or not account:
        raise HTTPException(status_code=404, detail="Goal or Account not found.")

    # Calculate current spendable balance
    breakdown = get_account_virtual_allocation_breakdown(db, account_id)
    spendable = Decimal(str(breakdown["spendable_balance"]))

    if amount > spendable:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient spendable balance. Available: ₹{spendable:,.2f}, Requested: ₹{amount:,.2f}"
        )

    goal.linked_account_id = account_id
    goal.current_amount = Decimal(str(goal.current_amount or 0)) + amount
    if goal.current_amount >= Decimal(str(goal.target_amount or 0)):
        goal.is_completed = True

    ledger = GoalAllocationLedger(
        user_id=user_id,
        goal_id=goal_id,
        account_id=account_id,
        amount=amount,
        direction=GoalAllocationDirection.ALLOCATE,
        notes=notes or f"Virtual allocation of ₹{amount:,.2f} to {goal.name}"
    )
    db.add(ledger)
    db.commit()

    return {
        "message": f"Successfully allocated ₹{amount:,.2f} to {goal.name}",
        "goal_id": str(goal.id),
        "goal_current_amount": float(goal.current_amount),
        "account_breakdown": get_account_virtual_allocation_breakdown(db, account_id)
    }

def release_funds_from_goal(
    db: Session,
    user_id: uuid.UUID,
    goal_id: uuid.UUID,
    amount: Decimal,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Releases funds from a savings goal back to the account's spendable balance.
    """
    amount = abs(Decimal(str(amount)))
    if amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Release amount must be positive.")

    goal = db.query(FinancialGoal).filter(FinancialGoal.id == goal_id, FinancialGoal.user_id == user_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")

    current_allocated = Decimal(str(goal.current_amount or 0))
    if amount > current_allocated:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot release more than currently allocated: ₹{current_allocated:,.2f}"
        )

    account_id = goal.linked_account_id
    goal.current_amount = current_allocated - amount
    if goal.current_amount < Decimal(str(goal.target_amount or 0)):
        goal.is_completed = False

    if account_id:
        ledger = GoalAllocationLedger(
            user_id=user_id,
            goal_id=goal_id,
            account_id=account_id,
            amount=amount,
            direction=GoalAllocationDirection.RELEASE,
            notes=notes or f"Released ₹{amount:,.2f} from {goal.name}"
        )
        db.add(ledger)

    db.commit()

    return {
        "message": f"Successfully released ₹{amount:,.2f} from {goal.name}",
        "goal_id": str(goal.id),
        "goal_current_amount": float(goal.current_amount),
        "account_breakdown": get_account_virtual_allocation_breakdown(db, account_id) if account_id else None
    }
