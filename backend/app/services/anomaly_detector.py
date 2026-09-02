"""
Spending Anomaly & Unusual Transaction Radar for WiseRaman
Implements multi-signal calibrated anomaly detection:
- 3.0x merchant baseline comparison (using 90d median & standard deviation)
- ₹2,000 transaction floor to prevent trivial alerts
- Merchant/category specific multipliers (Shopping 4.0x, Utilities 2.0x)
- Sample-size confidence gating (<3 txns suppressed)
- Non-alarmist severity levels: Elevated, Anomalous, Highly Anomalous
"""
from typing import List, Dict, Any
import statistics
from datetime import datetime, timedelta

CATEGORY_MULTIPLIERS = {
    "Shopping": 4.0,
    "Food & Dining": 3.0,
    "Groceries": 3.0,
    "Travel": 3.0,
    "Medical": 3.0,
    "Healthcare": 3.0,
    "Utilities": 2.0,
    "Fuel": 2.0,
}

BYPASS_CATEGORIES = {"Rent", "EMI", "Loan", "Insurance", "Salary", "Income", "Transfer"}
MIN_ABSOLUTE_FLOOR = 2000.0  # ₹2,000 floor

def detect_spending_anomalies(transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Evaluates transactions for unusual spending patterns relative to 90-day merchant history.
    """
    # 1. Group debit transactions by normalized merchant / description
    merchant_history: Dict[str, List[Dict[str, Any]]] = {}

    for tx in transactions:
        amt = float(tx.get("amount", 0))
        if amt >= 0:
            continue # Only evaluate expense outflows

        category = tx.get("category") or "Other"
        if category in BYPASS_CATEGORIES:
            continue # Bypass fixed recurring bills / transfers

        merchant = (tx.get("description") or tx.get("raw_text") or "Unknown").strip().upper()
        if not merchant:
            continue

        if merchant not in merchant_history:
            merchant_history[merchant] = []
        
        merchant_history[merchant].append({
            "id": tx.get("id"),
            "amount": abs(amt),
            "date": tx.get("date"),
            "category": category,
            "raw_text": tx.get("raw_text")
        })

    anomalies = []

    # 2. Analyze each merchant group
    for merchant, tx_list in merchant_history.items():
        if len(tx_list) < 3:
            # Gating: Insufficient historical samples (<3 txns) to establish a reliable baseline
            continue

        amounts = [t["amount"] for t in tx_list]
        median_val = statistics.median(amounts)
        mean_val = statistics.mean(amounts)
        stddev_val = statistics.stdev(amounts) if len(amounts) > 1 else 0.0
        sample_count = len(amounts)

        # Confidence rating based on sample count
        if sample_count < 6:
            confidence = "Low"
        elif sample_count <= 10:
            confidence = "Moderate"
        else:
            confidence = "High"

        # Check each transaction
        for t in tx_list:
            amt = t["amount"]
            if amt < MIN_ABSOLUTE_FLOOR:
                # Suppress small transactions under ₹2,000 floor
                continue

            category = t["category"]
            multiplier_threshold = CATEGORY_MULTIPLIERS.get(category, 3.0)

            # Primary anomaly test: >= max(threshold * median, median + 2*stddev)
            statistical_hurdle = max(multiplier_threshold * median_val, median_val + (2.0 * stddev_val))

            if amt >= statistical_hurdle and median_val > 0:
                ratio = amt / median_val

                # Determine severity level
                if ratio >= 5.0:
                    severity = "Highly Anomalous"
                    severity_color = "#ef4444"
                elif ratio >= 3.0:
                    severity = "Anomalous"
                    severity_color = "#f97316"
                else:
                    severity = "Elevated"
                    severity_color = "#eab308"

                anomalies.append({
                    "transaction_id": t["id"],
                    "merchant": merchant,
                    "category": category,
                    "amount": round(amt, 2),
                    "transaction_date": str(t["date"]),
                    "merchant_90d_median": round(median_val, 2),
                    "merchant_90d_mean": round(mean_val, 2),
                    "merchant_90d_stddev": round(stddev_val, 2),
                    "sample_count": sample_count,
                    "multiplier": round(ratio, 1),
                    "severity": severity,
                    "severity_color": severity_color,
                    "confidence": confidence,
                    "explanation": f"₹{amt:,.0f} is {ratio:.1f}x your 90-day typical spend (₹{median_val:,.0f}) with {merchant}."
                })

    # Sort by multiplier descending
    anomalies.sort(key=lambda x: x["multiplier"], reverse=True)
    return anomalies
