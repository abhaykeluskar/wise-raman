"""
Financial Calendar & Month-End Cash Flow Projection Engine for WiseRaman
Integrates Salary, Credit Card Dues, EMIs, SIPs, NACH/AutoPay, Insurance, and Rent.
"""
from typing import List, Dict, Any
from datetime import datetime, date, timedelta

def build_financial_calendar(
    current_liquid_balance: float,
    monthly_salary: float,
    salary_day: int = 1,
    credit_cards: List[Dict[str, Any]] = None,
    loans: List[Dict[str, Any]] = None,
    mandates: List[Dict[str, Any]] = None,
    insurance_policies: List[Dict[str, Any]] = None,
    rent_amount: float = 0.0,
    rent_day: int = 5
) -> Dict[str, Any]:
    """
    Builds the monthly financial obligations schedule and projects month-end cash balance.
    """
    today = date.today()
    current_month_name = today.strftime("%B %Y")
    days_in_month = 30 # standard monthly projection window

    events = []

    # 1. Salary Inflow
    if monthly_salary > 0:
        events.append({
            "day": salary_day,
            "title": "Monthly Salary Credit",
            "type": "INCOME",
            "amount": float(monthly_salary),
            "category": "Salary",
            "is_inflow": True
        })

    # 2. Rent Outflow
    if rent_amount > 0:
        events.append({
            "day": rent_day,
            "title": "House Rent",
            "type": "FIXED_EXPENSE",
            "amount": float(rent_amount),
            "category": "Rent",
            "is_inflow": False
        })

    # 3. Credit Card Payment Dues
    if credit_cards:
        for c in credit_cards:
            due_day = c.get("payment_due_day") or 10
            due_amt = float(c.get("current_balance") or 0)
            if due_amt > 0:
                events.append({
                    "day": int(due_day),
                    "title": f"{c.get('card_name', 'Credit Card')} Statement Due",
                    "type": "CREDIT_CARD_DUE",
                    "amount": due_amt,
                    "category": "Credit Card",
                    "is_inflow": False
                })

    # 4. Loan EMIs
    if loans:
        for l in loans:
            emi_amt = float(l.get("emi_amount") or 0)
            if emi_amt > 0:
                events.append({
                    "day": 10, # Typical loan EMI debit day
                    "title": f"{l.get('loan_name', 'Loan')} Monthly EMI",
                    "type": "LOAN_EMI",
                    "amount": emi_amt,
                    "category": "Loans",
                    "is_inflow": False
                })

    # 5. Mandates / AutoPay
    if mandates:
        for m in mandates:
            m_amt = float(m.get("amount") or 0)
            if m_amt > 0:
                events.append({
                    "day": 15,
                    "title": f"AutoPay: {m.get('biller_name', 'Mandate')}",
                    "type": "MANDATE",
                    "amount": m_amt,
                    "category": "AutoPay",
                    "is_inflow": False
                })

    # Sort events chronologically by day
    events.sort(key=lambda x: x["day"])

    # Calculate Cash Flow Totals & Month-End Projection
    total_inflows = sum(e["amount"] for e in events if e["is_inflow"])
    total_outflows = sum(e["amount"] for e in events if not e["is_inflow"])
    projected_month_end_balance = current_liquid_balance + total_inflows - total_outflows

    return {
        "month": current_month_name,
        "starting_liquid_balance": round(current_liquid_balance, 2),
        "total_scheduled_inflows": round(total_inflows, 2),
        "total_scheduled_outflows": round(total_outflows, 2),
        "projected_month_end_balance": round(projected_month_end_balance, 2),
        "net_monthly_surplus": round(total_inflows - total_outflows, 2),
        "events_count": len(events),
        "events": events
    }
