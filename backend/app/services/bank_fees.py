"""
Bank Fee & Charge Detection Engine for WiseRaman
Identifies hidden banking fees, avoidable leakages, and annual cost summaries.
"""
from typing import List, Dict, Any
import re

FEE_PATTERNS = [
    (r'(ATM\s+DECLINE|ATM\s+WDL\s+CHG|ATM\s+FEE|NFS\s+ATM)', 'ATM_FEE', True),
    (r'(SMS\s+ALERT|SMS\s+CHRG|CONSOLIDATED\s+SMS)', 'SMS_CHARGE', True),
    (r'(NON\s+MAINT|AVG\s+BAL\s+CHG|MIN\s+BAL|MAB\s+CHG)', 'MIN_BALANCE_PENALTY', True),
    (r'(ANNUAL\s+FEE|CARD\s+FEE|RENEWAL\s+FEE|ANNUAL\s+MAINT)', 'CARD_ANNUAL_FEE', False),
    (r'(IMPS\s+OUT\s+CHG|NEFT\s+CHG|RTGS\s+CHG)', 'IMPS_CHARGE', True),
    (r'(CHQ\s+RTN|CHEQUE\s+BOUNCE|ECS\s+REJECT|NACH\s+REJECT)', 'BOUNCE_PENALTY', True),
]

def scan_for_bank_fees(transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Scans transactions for banking fees and penalties.
    """
    detected_fees = []

    for tx in transactions:
        amt = float(tx.get("amount", 0))
        if amt >= 0:
            continue # Fees are always debit outflows

        raw = (tx.get("raw_text") or tx.get("description") or "").upper()
        
        for pattern, fee_type, is_avoidable in FEE_PATTERNS:
            if re.search(pattern, raw):
                detected_fees.append({
                    "transaction_id": tx.get("id"),
                    "account_id": tx.get("account_id"),
                    "fee_type": fee_type,
                    "amount": abs(amt),
                    "fee_date": str(tx.get("date")),
                    "raw_narration": tx.get("raw_text") or tx.get("description"),
                    "is_avoidable": is_avoidable
                })
                break

    return detected_fees

def summarize_bank_fees(fees: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes total fees, potentially avoidable fees, and categorization.
    """
    total = sum(f["amount"] for f in fees)
    avoidable = sum(f["amount"] for f in fees if f.get("is_avoidable", False))
    fixed = total - avoidable

    by_type = {}
    for f in fees:
        ftype = f["fee_type"]
        by_type[ftype] = by_type.get(ftype, 0.0) + f["amount"]

    return {
        "total_fees": round(total, 2),
        "avoidable_fees": round(avoidable, 2),
        "fixed_fees": round(fixed, 2),
        "avoidable_percentage": round((avoidable / total * 100) if total > 0 else 0, 1),
        "fees_by_type": by_type,
        "fee_count": len(fees),
        "detailed_fees": fees
    }
