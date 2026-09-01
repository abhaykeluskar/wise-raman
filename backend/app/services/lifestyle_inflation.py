"""
Lifestyle Inflation, Subscription Waste & Economic Savings Engine for WiseRaman
Calculates discretionary drift vs income growth, recurring subscription waste,
and True Economic Savings Rate (Savings + Investments + Loan Principal).
"""
from typing import List, Dict, Any
from datetime import datetime, date
from collections import defaultdict

DISCRETIONARY_CATEGORIES = {"Shopping", "Food & Dining", "Entertainment", "Travel", "Electronics", "Dining"}

def calculate_lifestyle_inflation(
    past_period_income: float,
    current_period_income: float,
    past_period_discretionary: float,
    current_period_discretionary: float
) -> Dict[str, Any]:
    """
    Computes Lifestyle Inflation Gap = Discretionary Growth % - Income Growth %
    """
    income_growth_pct = 0.0
    if past_period_income > 0:
        income_growth_pct = ((current_period_income - past_period_income) / past_period_income) * 100.0

    discretionary_growth_pct = 0.0
    if past_period_discretionary > 0:
        discretionary_growth_pct = ((current_period_discretionary - past_period_discretionary) / past_period_discretionary) * 100.0

    inflation_gap = discretionary_growth_pct - income_growth_pct
    is_lifestyle_creeping = inflation_gap > 5.0  # Discretionary spending growing >5% faster than income

    return {
        "income_growth_pct": round(income_growth_pct, 1),
        "discretionary_growth_pct": round(discretionary_growth_pct, 1),
        "lifestyle_inflation_gap": round(inflation_gap, 1),
        "is_lifestyle_creeping": is_lifestyle_creeping,
        "past_discretionary": round(past_period_discretionary, 2),
        "current_discretionary": round(current_period_discretionary, 2),
        "status": "LIFESTYLE_CREEP_DETECTED" if is_lifestyle_creeping else "CONTROLLED_GROWTH",
        "advice": (
            f"Your discretionary spending grew by {discretionary_growth_pct:.1f}% while income grew by {income_growth_pct:.1f}%. Consider directing the surplus into investments."
            if is_lifestyle_creeping else
            "Your discretionary spending is disciplined relative to income growth."
        )
    }

def calculate_true_economic_savings_rate(
    gross_income: float,
    cash_savings: float,
    investments_made: float,
    loan_principal_repaid: float
) -> Dict[str, Any]:
    """
    Computes True Economic Savings Rate:
    Includes Cash savings, Mutual Funds/SIP investments, and Home/Car Loan Principal repayment.
    """
    if gross_income <= 0:
        return {"true_savings_rate": 0.0, "total_economic_savings": 0.0}

    total_economic_savings = max(0, cash_savings) + investments_made + loan_principal_repaid
    rate_pct = (total_economic_savings / gross_income) * 100.0

    return {
        "gross_income": round(gross_income, 2),
        "cash_savings": round(cash_savings, 2),
        "investments_made": round(investments_made, 2),
        "loan_principal_repaid": round(loan_principal_repaid, 2),
        "total_economic_savings": round(total_economic_savings, 2),
        "true_savings_rate_pct": round(rate_pct, 1),
        "benchmark_comparison": "Excellent" if rate_pct >= 40 else "Good" if rate_pct >= 25 else "Moderate"
    }

def detect_subscription_waste(transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Identifies recurring subscriptions (Netflix, Prime, Spotify, SaaS, Gym, Apple Services).
    Categorizes them into KEEP, REVIEW, or CANCEL recommendations.
    """
    SUB_KEYWORDS = ["NETFLIX", "SPOTIFY", "AMAZON PRIME", "HOTSTAR", "YOUTUBE", "APPLE.COM", "CHATGPT", "CLAUDE", "MIDJOURNEY", "CULT.FIT"]
    found_subs: Dict[str, Dict[str, Any]] = {}

    for tx in transactions:
        amt = float(tx.get("amount", 0))
        if amt >= 0:
            continue

        raw = (tx.get("raw_text") or tx.get("description") or "").upper()
        for kw in SUB_KEYWORDS:
            if kw in raw:
                key = kw
                if key not in found_subs:
                    found_subs[key] = {
                        "name": key.title(),
                        "monthly_cost": abs(amt),
                        "annual_cost": abs(amt) * 12,
                        "last_charged": str(tx.get("date")),
                        "occurrences": 1,
                        "recommendation": "REVIEW"
                    }
                else:
                    found_subs[key]["occurrences"] += 1
                break

    total_monthly = sum(s["monthly_cost"] for s in found_subs.values())
    total_annual = total_monthly * 12

    return {
        "total_active_subscriptions": len(found_subs),
        "total_monthly_spend": round(total_monthly, 2),
        "total_annual_spend": round(total_annual, 2),
        "potential_annual_savings": round(total_annual * 0.35, 2),  # Target ~35% optimization
        "subscriptions": list(found_subs.values())
    }
