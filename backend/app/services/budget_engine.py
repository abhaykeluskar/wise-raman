import calendar
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import extract, func, and_
from fastapi import HTTPException

from app.models import (
    EnvelopeBudget, BudgetPeriodRecord, BudgetMode, Transaction,
    Category
)

def get_or_create_monthly_budget_status(
    db: Session,
    user_id: uuid.UUID,
    year: int,
    month: int
) -> Dict[str, Any]:
    """
    Computes real-time envelope budget statuses with Firefly III-style rollover calculations.
    """
    budgets = db.query(EnvelopeBudget).filter(
        EnvelopeBudget.user_id == user_id,
        EnvelopeBudget.is_active == True
    ).all()

    today = date.today()
    days_in_month = calendar.monthrange(year, month)[1]
    if year == today.year and month == today.month:
        days_left = max(1, days_in_month - today.day + 1)
    elif date(year, month, 1) < date(today.year, today.month, 1):
        days_left = 0
    else:
        days_left = days_in_month

    # Prior month coordinates
    if month == 1:
        prev_year, prev_month = year - 1, 12
    else:
        prev_year, prev_month = year, month - 1

    category_statuses = []
    total_base_limit = Decimal("0.00")
    total_effective_limit = Decimal("0.00")
    total_spent = Decimal("0.00")
    total_rollover_in = Decimal("0.00")

    for b in budgets:
        prev_record = db.query(BudgetPeriodRecord).filter(
            BudgetPeriodRecord.budget_id == b.id,
            BudgetPeriodRecord.year == prev_year,
            BudgetPeriodRecord.month == prev_month
        ).first()

        # Compute rollover based on BudgetMode
        rollover_in = Decimal("0.00")
        if prev_record:
            if b.budget_mode == BudgetMode.ROLLOVER_SURPLUS_ONLY:
                rollover_in = max(Decimal("0.00"), prev_record.closing_balance)
            elif b.budget_mode == BudgetMode.ROLLOVER_NET:
                rollover_in = prev_record.closing_balance
            elif b.budget_mode == BudgetMode.SAVINGS_SWEEP:
                rollover_in = Decimal("0.00") # Surplus was swept away
            elif b.budget_mode == BudgetMode.STRICT_RESET:
                rollover_in = Decimal("0.00")

        base_limit = Decimal(str(b.monthly_limit))
        effective_limit = max(Decimal("0.00"), base_limit + rollover_in)

        # Actual spend for current month in this category
        spend_query = db.query(func.coalesce(func.sum(Transaction.amount), Decimal("0.00"))).filter(
            Transaction.user_id == user_id,
            Transaction.category == b.category,
            extract("year", Transaction.date) == year,
            extract("month", Transaction.date) == month,
            Transaction.amount < 0,
            Transaction.is_excluded_from_spending == False
        ).scalar()

        spent_amount = abs(Decimal(str(spend_query)))
        closing_balance = effective_limit - spent_amount
        utilization_pct = round(float((spent_amount / effective_limit) * 100), 1) if effective_limit > 0 else 0.0
        daily_recommended = round(float(closing_balance / Decimal(days_left)), 2) if (days_left > 0 and closing_balance > 0) else 0.0
        is_overrun = spent_amount > effective_limit

        # Upsert BudgetPeriodRecord
        period_rec = db.query(BudgetPeriodRecord).filter(
            BudgetPeriodRecord.budget_id == b.id,
            BudgetPeriodRecord.year == year,
            BudgetPeriodRecord.month == month
        ).first()

        if not period_rec:
            period_rec = BudgetPeriodRecord(
                budget_id=b.id,
                user_id=user_id,
                year=year,
                month=month,
                base_limit=base_limit,
                rollover_in=rollover_in,
                effective_limit=effective_limit,
                spent_amount=spent_amount,
                closing_balance=closing_balance
            )
            db.add(period_rec)
        else:
            period_rec.base_limit = base_limit
            period_rec.rollover_in = rollover_in
            period_rec.effective_limit = effective_limit
            period_rec.spent_amount = spent_amount
            period_rec.closing_balance = closing_balance

        total_base_limit += base_limit
        total_effective_limit += effective_limit
        total_spent += spent_amount
        total_rollover_in += rollover_in

        category_statuses.append({
            "budget_id": str(b.id),
            "category": b.category,
            "budget_mode": b.budget_mode.value,
            "base_limit": float(base_limit),
            "rollover_in": float(rollover_in),
            "effective_limit": float(effective_limit),
            "spent_amount": float(spent_amount),
            "remaining_balance": float(closing_balance),
            "utilization_percentage": utilization_pct,
            "daily_recommended_spend": daily_recommended,
            "is_overrun": is_overrun,
            "days_left": days_left
        })

    db.commit()

    total_remaining = total_effective_limit - total_spent
    overall_utilization = round(float((total_spent / total_effective_limit) * 100), 1) if total_effective_limit > 0 else 0.0

    return {
        "year": year,
        "month": month,
        "days_in_month": days_in_month,
        "days_left": days_left,
        "total_base_limit": float(total_base_limit),
        "total_rollover_in": float(total_rollover_in),
        "total_effective_limit": float(total_effective_limit),
        "total_spent": float(total_spent),
        "total_remaining": float(total_remaining),
        "overall_utilization_percentage": overall_utilization,
        "is_overall_overrun": total_spent > total_effective_limit,
        "categories": category_statuses
    }

def set_envelope_budget(
    db: Session,
    user_id: uuid.UUID,
    category: str,
    monthly_limit: Decimal,
    budget_mode: BudgetMode = BudgetMode.ROLLOVER_SURPLUS_ONLY
) -> EnvelopeBudget:
    """
    Creates or updates an EnvelopeBudget.
    """
    if monthly_limit <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Monthly budget limit must be positive.")

    budget = db.query(EnvelopeBudget).filter(
        EnvelopeBudget.user_id == user_id,
        EnvelopeBudget.category == category
    ).first()

    if not budget:
        budget = EnvelopeBudget(
            user_id=user_id,
            category=category,
            monthly_limit=monthly_limit,
            budget_mode=budget_mode,
            is_active=True
        )
        db.add(budget)
    else:
        budget.monthly_limit = monthly_limit
        budget.budget_mode = budget_mode
        budget.is_active = True

    db.commit()
    db.refresh(budget)
    return budget

def delete_envelope_budget(db: Session, user_id: uuid.UUID, budget_id: uuid.UUID) -> Dict[str, str]:
    """
    Deactivates or deletes an envelope budget.
    """
    budget = db.query(EnvelopeBudget).filter(
        EnvelopeBudget.id == budget_id,
        EnvelopeBudget.user_id == user_id
    ).first()

    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found.")

    db.delete(budget)
    db.commit()
    return {"message": "Envelope budget deleted successfully."}
