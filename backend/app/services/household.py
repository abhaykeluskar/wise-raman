from decimal import Decimal
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import Account, AccountVisibility, AccountClassification, AccountSubtype, HouseholdMember, Loan, FixedDeposit, InvestmentHolding, Transaction, TransactionType

HOUSEHOLD_EXPENSE_CATEGORIES = [
    "Domestic Help", "Cook", "Maid", "Rent", "Electricity", "Gas",
    "Internet", "Society Maintenance", "Groceries", "School", "Tuition", "Milk"
]

def get_household_dashboard(db: Session, user_id: str) -> Dict[str, Any]:
    """
    Aggregates Household Mode data:
    - Family Members
    - Combined Household Net Worth (Shared + Household accounts)
    - Essential Household Category Breakdown
    """
    # 1. Family Members
    members = db.query(HouseholdMember).filter(HouseholdMember.user_id == user_id).all()
    member_list = [{
        "id": str(m.id),
        "name": m.name,
        "relationship": m.relationship,
        "avatar_color": m.avatar_color
    } for m in members]

    # 2. Accounts (Filter by SHARED & HOUSEHOLD for household view, plus user's total)
    accounts = db.query(Account).filter(Account.user_id == user_id).all()
    
    total_assets = Decimal("0.00")
    total_liabilities = Decimal("0.00")
    shared_assets = Decimal("0.00")
    shared_liabilities = Decimal("0.00")

    for acc in accounts:
        bal = Decimal(str(acc.balance or 0))
        if acc.classification == AccountClassification.ASSET:
            total_assets += bal
            if acc.visibility in [AccountVisibility.SHARED, AccountVisibility.HOUSEHOLD]:
                shared_assets += bal
        else:
            total_liabilities += bal
            if acc.visibility in [AccountVisibility.SHARED, AccountVisibility.HOUSEHOLD]:
                shared_liabilities += bal

    # Add FDs
    fds = db.query(FixedDeposit).filter(FixedDeposit.user_id == user_id, FixedDeposit.is_active == True).all()
    fd_total = sum([Decimal(str(f.principal_amount or 0)) for f in fds])
    total_assets += fd_total
    shared_assets += fd_total

    # Add Investments
    holdings = db.query(InvestmentHolding).filter(InvestmentHolding.user_id == user_id).all()
    inv_total = sum([Decimal(str(h.current_value or 0)) for h in holdings])
    total_assets += inv_total
    shared_assets += inv_total

    # Add Loans
    loans = db.query(Loan).filter(Loan.user_id == user_id, Loan.is_active == True).all()
    loan_total = sum([Decimal(str(l.outstanding_balance or 0)) for l in loans])
    total_liabilities += loan_total
    shared_liabilities += loan_total

    combined_net_worth = total_assets - total_liabilities
    shared_net_worth = shared_assets - shared_liabilities

    # 3. Household Category Spending
    household_spending = {}
    for cat in HOUSEHOLD_EXPENSE_CATEGORIES:
        spent = db.query(func.sum(Transaction.amount)).filter(
            Transaction.user_id == user_id,
            Transaction.transaction_type == TransactionType.EXPENSE,
            Transaction.category.ilike(f"%{cat}%")
        ).scalar() or Decimal("0.00")
        if abs(spent) > 0:
            household_spending[cat] = float(abs(spent))

    return {
        "members": member_list,
        "combined_net_worth": float(combined_net_worth),
        "shared_net_worth": float(shared_net_worth),
        "total_assets": float(total_assets),
        "total_liabilities": float(total_liabilities),
        "household_spending": household_spending
    }
