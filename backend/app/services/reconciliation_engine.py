"""
Reconciliation & Data Integrity Engine for WiseRaman
Handles mathematical balance proofs, overlapping statement de-duplication,
and prioritized human-in-the-loop review queues.
"""
from typing import Dict, Any, List, Optional
import hashlib
from datetime import date, datetime
from decimal import Decimal

def compute_transaction_fingerprint(
    account_id: str,
    txn_date: str,
    amount: float,
    raw_text: str,
    utr_or_ref: Optional[str] = None
) -> str:
    """
    Computes a deterministic SHA-256 fingerprint for a transaction.
    Handles overlapping statements (e.g. Jan 1-31 vs Jan 25-Feb 28).
    """
    clean_amt = f"{float(amount):.2f}"
    clean_text = " ".join(raw_text.strip().upper().split())
    clean_ref = (utr_or_ref or "").strip().upper()
    
    payload = f"{account_id}|{txn_date}|{clean_amt}|{clean_text}|{clean_ref}"
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()

def verify_statement_balance(
    opening_balance: float,
    total_credits: float,
    total_debits: float,
    reported_closing_balance: float
) -> Dict[str, Any]:
    """
    Verifies the mathematical balance equality:
    Expected Closing = Opening Balance + Credits - Debits
    """
    op = Decimal(str(round(opening_balance, 2)))
    cr = Decimal(str(round(total_credits, 2)))
    dr = Decimal(str(round(total_debits, 2)))
    rep_cl = Decimal(str(round(reported_closing_balance, 2)))

    expected_cl = op + cr - dr
    discrepancy = abs(expected_cl - rep_cl)
    is_verified = discrepancy < Decimal('0.05')  # Allow slight rounding variance (<= 5 paise)

    return {
        "opening_balance": float(op),
        "total_credits": float(cr),
        "total_debits": float(dr),
        "reported_closing_balance": float(rep_cl),
        "expected_closing_balance": float(expected_cl),
        "discrepancy_amount": float(discrepancy),
        "status": "VERIFIED" if is_verified else "MISMATCH_FLAGGED",
        "is_verified": is_verified,
        "formula": f"{float(op):,.2f} + {float(cr):,.2f} - {float(dr):,.2f} = {float(expected_cl):,.2f}"
    }

def categorize_review_priority(item: Dict[str, Any]) -> str:
    """
    Classifies review queue items into 4 strict priority tiers:
    - CRITICAL: Balance mismatch, exact duplicate candidate, severe anomaly (>5x)
    - IMPORTANT: Unknown high-value merchant (>5k), ambiguous transfer, low extraction confidence (<0.80)
    - REVIEW: Category uncertainty or user validation needed
    - INFORMATIONAL: New mandate or new merchant
    """
    item_type = item.get("type", "")
    amount = abs(float(item.get("amount", 0)))
    confidence = float(item.get("confidence", 1.0))
    multiplier = float(item.get("anomaly_multiplier", 1.0))

    if item_type == "BALANCE_MISMATCH" or item_type == "DUPLICATE_CANDIDATE" or multiplier >= 5.0:
        return "CRITICAL"
    
    if (confidence < 0.80) or (item_type == "UNKNOWN_MERCHANT" and amount >= 5000) or item_type == "AMBIGUOUS_TRANSFER":
        return "IMPORTANT"
        
    if item_type == "CATEGORY_UNCERTAINTY" or (item_type == "UNKNOWN_MERCHANT" and amount < 5000):
        return "REVIEW"

    return "INFORMATIONAL"

def generate_review_queue_summary(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Aggregates review queue items into prioritized buckets for the UI.
    """
    critical = []
    important = []
    review = []
    informational = []

    for it in items:
        priority = categorize_review_priority(it)
        it["priority"] = priority
        if priority == "CRITICAL":
            critical.append(it)
        elif priority == "IMPORTANT":
            important.append(it)
        elif priority == "REVIEW":
            review.append(it)
        else:
            informational.append(it)

    return {
        "total_items_count": len(items),
        "critical_count": len(critical),
        "important_count": len(important),
        "review_count": len(review),
        "informational_count": len(informational),
        "critical": critical,
        "important": important,
        "review": review,
        "informational": informational
    }
