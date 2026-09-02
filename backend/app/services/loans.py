from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from typing import List, Dict, Any, Optional

def calculate_emi(principal: float, annual_rate: float, tenure_months: int) -> float:
    """
    Standard reducing balance EMI calculation:
    EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
    where r is monthly interest rate.
    """
    if principal <= 0 or tenure_months <= 0:
        return 0.0
    if annual_rate <= 0:
        return round(principal / tenure_months, 2)

    p = Decimal(str(principal))
    r = Decimal(str(annual_rate)) / Decimal("12") / Decimal("100")
    n = tenure_months

    one_plus_r_n = (Decimal("1") + r) ** n
    emi = p * r * one_plus_r_n / (one_plus_r_n - Decimal("1"))
    return float(emi.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def generate_amortization_schedule(
    principal: float,
    annual_rate: float,
    tenure_months: int,
    start_date: Optional[date] = None,
    max_rows: int = 360
) -> List[Dict[str, Any]]:
    """
    Generates monthly amortization schedule with Principal, Interest, and Ending Balance.
    """
    if principal <= 0 or tenure_months <= 0:
        return []

    emi = calculate_emi(principal, annual_rate, tenure_months)
    monthly_rate = Decimal(str(annual_rate)) / Decimal("12") / Decimal("100") if annual_rate > 0 else Decimal("0")
    
    balance = Decimal(str(principal))
    schedule = []
    current_year = start_date.year if start_date else 2026
    current_month = start_date.month if start_date else 1

    for month_idx in range(1, min(tenure_months + 1, max_rows + 1)):
        interest_payment = (balance * monthly_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        principal_payment = Decimal(str(emi)) - interest_payment

        if principal_payment > balance or month_idx == tenure_months:
            principal_payment = balance
            actual_emi = principal_payment + interest_payment
        else:
            actual_emi = Decimal(str(emi))

        balance = max(Decimal("0.00"), balance - principal_payment)

        # compute date for next month
        m_str = f"{current_year}-{current_month:02d}"
        schedule.append({
            "month_index": month_idx,
            "period": m_str,
            "emi": float(actual_emi.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "principal": float(principal_payment.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "interest": float(interest_payment),
            "ending_balance": float(balance.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        })

        current_month += 1
        if current_month > 12:
            current_month = 1
            current_year += 1

        if balance <= 0:
            break

    return schedule

def simulate_prepayment(
    outstanding_balance: float,
    annual_rate: float,
    current_emi: float,
    lump_sum: float = 0.0,
    extra_monthly_emi: float = 0.0
) -> Dict[str, Any]:
    """
    Simulates the impact of a one-time lump-sum prepayment or extra monthly prepayment
    on reducing loan tenure and total interest payable.
    """
    balance = Decimal(str(outstanding_balance))
    monthly_rate = Decimal(str(annual_rate)) / Decimal("12") / Decimal("100") if annual_rate > 0 else Decimal("0")
    base_emi = Decimal(str(current_emi))

    if balance <= 0 or base_emi <= 0:
        return {
            "original_tenure_months": 0,
            "new_tenure_months": 0,
            "months_saved": 0,
            "original_total_interest": 0.0,
            "new_total_interest": 0.0,
            "interest_saved": 0.0
        }

    # 1. Baseline calculation
    temp_bal = balance
    orig_months = 0
    orig_total_interest = Decimal("0.0")
    while temp_bal > 0 and orig_months < 600:
        orig_months += 1
        interest = (temp_bal * monthly_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        principal = base_emi - interest
        if principal > temp_bal:
            principal = temp_bal
        orig_total_interest += interest
        temp_bal -= principal

    # 2. With Prepayment
    prepaid_bal = max(Decimal("0.0"), balance - Decimal(str(lump_sum)))
    new_emi = base_emi + Decimal(str(extra_monthly_emi))
    new_months = 0
    new_total_interest = Decimal("0.0")

    while prepaid_bal > 0 and new_months < 600:
        new_months += 1
        interest = (prepaid_bal * monthly_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        principal = new_emi - interest
        if principal > prepaid_bal:
            principal = prepaid_bal
        new_total_interest += interest
        prepaid_bal -= principal

    interest_saved = max(Decimal("0.0"), orig_total_interest - new_total_interest)
    months_saved = max(0, orig_months - new_months)

    return {
        "original_tenure_months": orig_months,
        "new_tenure_months": new_months,
        "months_saved": months_saved,
        "original_total_interest": float(orig_total_interest.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "new_total_interest": float(new_total_interest.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "interest_saved": float(interest_saved.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    }
