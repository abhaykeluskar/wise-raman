"""
UPI AutoPay & NACH Mandate Engine for WiseRaman
Identifies recurring electronic mandates, AutoPay commitments, and monthly cash obligations.
"""
from typing import List, Dict, Any
from datetime import datetime, date, timedelta
import re

MANDATE_PATTERNS = [
    (r'(UPI/AUTOPAY|AUTOPAY/|MANDATE/|UPI-AUTOPAY)', 'UPI_AUTOPAY'),
    (r'(ACH/|NACH/|ECS/|ECS\s+DEBIT)', 'NACH'),
    (r'(SI/|STANDING\s+INSTR|POS\s+SI)', 'STANDING_INSTRUCTION')
]

def detect_mandates(transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Detects recurring mandates from debit transactions.
    """
    grouped_mandates: Dict[str, Dict[str, Any]] = {}

    for tx in transactions:
        amt = float(tx.get("amount", 0))
        if amt >= 0:
            continue

        raw = (tx.get("raw_text") or tx.get("description") or "").upper()
        
        detected_type = None
        for pattern, m_type in MANDATE_PATTERNS:
            if re.search(pattern, raw):
                detected_type = m_type
                break

        if not detected_type:
            continue

        # Extract biller or merchant identifier
        biller = tx.get("description") or tx.get("raw_text") or "AutoPay Mandate"
        key = f"{biller}_{abs(amt):.0f}"

        if key not in grouped_mandates:
            grouped_mandates[key] = {
                "biller_name": biller,
                "mandate_type": detected_type,
                "amount": abs(amt),
                "account_id": tx.get("account_id"),
                "frequency": "MONTHLY",
                "occurrences": 1,
                "last_debit_date": str(tx.get("date")),
                "is_active": True
            }
        else:
            grouped_mandates[key]["occurrences"] += 1
            if str(tx.get("date")) > grouped_mandates[key]["last_debit_date"]:
                grouped_mandates[key]["last_debit_date"] = str(tx.get("date"))

    # Project next debit date (~30 days after last debit)
    results = []
    for item in grouped_mandates.values():
        try:
            last_dt = datetime.strptime(item["last_debit_date"], "%Y-%m-%d").date()
            next_dt = last_dt + timedelta(days=30)
            item["next_debit_date"] = str(next_dt)
        except Exception:
            item["next_debit_date"] = None
        results.append(item)

    return results

def summarize_mandates(mandates: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Summarizes total active monthly committed debits and 30-day upcoming schedule.
    """
    active_mandates = [m for m in mandates if m.get("is_active", True)]
    monthly_committed = sum(m.get("amount", 0) for m in active_mandates)

    return {
        "total_active_mandates": len(active_mandates),
        "total_monthly_committed": round(monthly_committed, 2),
        "annual_projected_commitment": round(monthly_committed * 12, 2),
        "mandates": active_mandates
    }
