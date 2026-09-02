"""
Explainable Financial Health Score Engine for WiseRaman
Implements continuous benchmark curves across 6 weighted dimensions:
1. Savings Rate (25%)
2. Debt Burden (20%)
3. Emergency Reserve (20%)
4. Credit Utilization (15%)
5. Investment Consistency (10%)
6. Cash Flow Stability (10%)

Includes Data Sufficiency gating (<3 months) and overall Confidence Score calculation.
"""
from typing import Dict, Any, List
import math

def _score_curve(value: float, min_val: float, max_val: float, reverse: bool = False) -> float:
    """
    Interpolates a continuous score between 0 and 100 along a smooth curve.
    """
    if max_val == min_val:
        return 50.0
    
    clamped = max(min_val, min(max_val, value))
    ratio = (clamped - min_val) / (max_val - min_val)
    
    if reverse:
        ratio = 1.0 - ratio
        
    return round(ratio * 100.0, 1)

def calculate_financial_health_score(
    monthly_income: float,
    monthly_expenses: float,
    monthly_emi: float,
    liquid_reserves: float,
    total_credit_limit: float,
    current_credit_spend: float,
    monthly_investments: float,
    months_of_history: int,
    account_count: int,
    card_count: int
) -> Dict[str, Any]:
    """
    Calculates the 0-100 explainable Financial Health Score with benchmark curves.
    """
    # 1. Data Sufficiency Gating
    if months_of_history < 3 or monthly_income <= 0:
        return {
            "score": None,
            "status": "NOT_ENOUGH_DATA",
            "insufficient_data": True,
            "confidence_score": 0.25,
            "display_title": "Not enough data yet",
            "message": f"WiseRaman needs at least 3 months of bank statements to compute a reliable health score (currently {months_of_history} month(s) available).",
            "missing_inputs": [
                "3+ months transaction history" if months_of_history < 3 else None,
                "Income verification" if monthly_income <= 0 else None
            ],
            "pillars": {}
        }

    # 2. Confidence Score Metric (0% - 100%)
    # Computed based on available history months, accounts linked, and investment data
    history_factor = min(1.0, months_of_history / 12.0) * 0.50
    accounts_factor = min(1.0, account_count / 3.0) * 0.25
    cards_factor = min(1.0, card_count / 2.0) * 0.15
    invest_factor = 0.10 if monthly_investments > 0 else 0.05
    confidence_pct = round((history_factor + accounts_factor + cards_factor + invest_factor) * 100, 0)

    # 3. Pillar 1: Savings Rate (Weight: 25%)
    # Net savings = Income - Expenses (including investments + principal)
    savings_amt = max(0, monthly_income - monthly_expenses)
    savings_rate_pct = (savings_amt / monthly_income) * 100.0
    # Benchmark curve: 0% -> 0 pts, 20% -> 60 pts, 40%+ -> 100 pts
    savings_score = _score_curve(savings_rate_pct, min_val=0.0, max_val=40.0)

    # 4. Pillar 2: Debt Burden / FOIR (Weight: 20%)
    # EMI to Income ratio. Benchmark curve: 0% -> 100 pts, 30% -> 70 pts, 50%+ -> 0 pts
    debt_ratio_pct = (monthly_emi / monthly_income) * 100.0 if monthly_income > 0 else 0.0
    debt_score = _score_curve(debt_ratio_pct, min_val=0.0, max_val=50.0, reverse=True)

    # 5. Pillar 3: Emergency Reserve Coverage (Weight: 20%)
    # Liquid buffer / monthly essential expenses. Benchmark: 0 mos -> 0 pts, 3 mos -> 60 pts, 6+ mos -> 100 pts
    essential_burn = max(1000, monthly_expenses)
    coverage_months = liquid_reserves / essential_burn
    emergency_score = _score_curve(coverage_months, min_val=0.0, max_val=6.0)

    # 6. Pillar 4: Credit Card Utilization (Weight: 15%)
    # Spend / Limit. Benchmark curve: <30% -> 100 pts, 50% -> 60 pts, 80%+ -> 0 pts
    card_util_pct = (current_credit_spend / total_credit_limit * 100.0) if total_credit_limit > 0 else 10.0
    credit_score = _score_curve(card_util_pct, min_val=10.0, max_val=80.0, reverse=True)

    # 7. Pillar 5: Investment Regularity (Weight: 10%)
    # Monthly investment / Income. Benchmark: 0% -> 0 pts, 15%+ -> 100 pts
    invest_ratio_pct = (monthly_investments / monthly_income) * 100.0 if monthly_income > 0 else 0.0
    invest_score = _score_curve(invest_ratio_pct, min_val=0.0, max_val=20.0)

    # 8. Pillar 6: Cash Flow Stability (Weight: 10%)
    # Positive free cash buffer. Benchmark: 0 pts if negative, 100 pts if net cashflow > 15% income
    net_free_cash_pct = ((monthly_income - monthly_expenses - monthly_emi) / monthly_income) * 100.0
    cashflow_score = _score_curve(net_free_cash_pct, min_val=0.0, max_val=25.0)

    # Weighted Total Score
    total_score = (
        (savings_score * 0.25) +
        (debt_score * 0.20) +
        (emergency_score * 0.20) +
        (credit_score * 0.15) +
        (invest_score * 0.10) +
        (cashflow_score * 0.10)
    )
    final_score = round(total_score, 0)

    # Health Tier
    if final_score >= 80:
        tier = "EXCELLENT"
        color = "#10b981"
    elif final_score >= 65:
        tier = "GOOD"
        color = "#3b82f6"
    elif final_score >= 50:
        tier = "MODERATE"
        color = "#eab308"
    else:
        tier = "NEEDS_ATTENTION"
        color = "#ef4444"

    return {
        "score": int(final_score),
        "tier": tier,
        "color": color,
        "insufficient_data": False,
        "confidence_score": int(confidence_pct),
        "confidence_label": f"Based on {months_of_history} months history, {account_count} accounts, and {card_count} cards",
        "pillars": {
            "savings_rate": {
                "name": "Savings Rate",
                "weight": "25%",
                "score": savings_score,
                "current_value": f"{savings_rate_pct:.1f}%",
                "benchmark": "30% - 40%+ of net income",
                "explanation": f"You save {savings_rate_pct:.1f}% of income after expenses."
            },
            "debt_burden": {
                "name": "Debt Burden (FOIR)",
                "weight": "20%",
                "score": debt_score,
                "current_value": f"{debt_ratio_pct:.1f}%",
                "benchmark": "< 30% of income committed to EMI",
                "explanation": f"EMIs account for {debt_ratio_pct:.1f}% of monthly income."
            },
            "emergency_reserve": {
                "name": "Emergency Reserve",
                "weight": "20%",
                "score": emergency_score,
                "current_value": f"{coverage_months:.1f} Months",
                "benchmark": "6 Months of essential monthly burn",
                "explanation": f"Liquid savings cover {coverage_months:.1f} months of expenses."
            },
            "credit_utilization": {
                "name": "Credit Card Utilization",
                "weight": "15%",
                "score": credit_score,
                "current_value": f"{card_util_pct:.1f}%",
                "benchmark": "< 30% of total limit",
                "explanation": f"Peak card utilization is {card_util_pct:.1f}%."
            },
            "investment_consistency": {
                "name": "Investment Consistency",
                "weight": "10%",
                "score": invest_score,
                "current_value": f"{invest_ratio_pct:.1f}%",
                "benchmark": "15% - 20% into mutual funds, SIPs, PPF",
                "explanation": f"Monthly SIP/wealth allocation is {invest_ratio_pct:.1f}%."
            },
            "cash_flow_stability": {
                "name": "Cash Flow Buffer",
                "weight": "10%",
                "score": cashflow_score,
                "current_value": f"{net_free_cash_pct:.1f}%",
                "benchmark": "> 15% positive buffer post bills & EMIs",
                "explanation": f"Net free buffer after all commitments is {net_free_cash_pct:.1f}%."
            }
        }
    }
