"""
Explainability & User Rule Simulation Engine for WiseRaman
Provides decision traces for classifications and pre-evaluates rule impact.
"""
from typing import List, Dict, Any
import re

def explain_transaction_classification(
    transaction: Dict[str, Any],
    applied_rule: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Returns an explainable audit trace for why a transaction was categorized.
    """
    desc = (transaction.get("description") or "").upper()
    raw = (transaction.get("raw_text") or "").upper()
    cat = transaction.get("category") or "Uncategorized"

    if applied_rule:
        return {
            "category": cat,
            "decision_source": "USER_EXPLICIT_RULE",
            "rule_id": applied_rule.get("id"),
            "match_pattern": applied_rule.get("match_pattern"),
            "confidence": 1.0,
            "explanation": f"Matched your custom rule '{applied_rule.get('match_pattern')}' with priority {applied_rule.get('priority', 100)}."
        }

    # Deterministic heuristics check
    if any(k in raw or k in desc for k in ["SWIGGY", "ZOMATO", "MCDONALD", "DOMINO"]):
        return {
            "category": "Food & Dining",
            "decision_source": "KNOWN_MERCHANT_RULE",
            "confidence": 0.98,
            "explanation": "Matched known Indian food delivery & restaurant merchant pattern."
        }

    if any(k in raw or k in desc for k in ["AMAZON", "FLIPKART", "MYNTRA", "MEESHO"]):
        return {
            "category": "Shopping",
            "decision_source": "KNOWN_MERCHANT_RULE",
            "confidence": 0.98,
            "explanation": "Matched verified e-commerce merchant directory."
        }

    if any(k in raw or k in desc for k in ["UBER", "OLA", "IRCTC", "INDIGO", "MAKEMYTRIP"]):
        return {
            "category": "Travel",
            "decision_source": "KNOWN_MERCHANT_RULE",
            "confidence": 0.96,
            "explanation": "Matched verified transit / airline / booking portal."
        }

    if any(k in raw or k in desc for k in ["BESCOM", "TATA POWER", "AIRTEL", "JIO", "INDANE"]):
        return {
            "category": "Utilities",
            "decision_source": "KNOWN_MERCHANT_RULE",
            "confidence": 0.97,
            "explanation": "Matched verified utility / telecom billing provider."
        }

    return {
        "category": cat,
        "decision_source": "DETERMINISTIC_CLASSIFIER",
        "confidence": float(transaction.get("extraction_confidence") or 0.85),
        "explanation": f"Categorized as '{cat}' via standard text classification."
    }

def test_rule_simulation(
    transactions: List[Dict[str, Any]],
    match_pattern: str,
    match_field: str = "raw_text",
    target_category: str = "Shopping"
) -> Dict[str, Any]:
    """
    Simulates applying a rule on historical transactions.
    Returns the count, total amount, and previews of matching transactions.
    """
    matched_txns = []
    pattern = re.compile(re.escape(match_pattern.strip()), re.IGNORECASE)

    for tx in transactions:
        text_to_match = tx.get(match_field) or tx.get("raw_text") or tx.get("description") or ""
        if pattern.search(text_to_match):
            matched_txns.append({
                "id": tx.get("id"),
                "date": str(tx.get("date")),
                "description": tx.get("description") or tx.get("raw_text"),
                "amount": float(tx.get("amount", 0)),
                "current_category": tx.get("category") or "Uncategorized",
                "new_category": target_category
            })

    total_amount = sum(abs(t["amount"]) for t in matched_txns)

    return {
        "match_pattern": match_pattern,
        "match_field": match_field,
        "target_category": target_category,
        "matched_count": len(matched_txns),
        "total_affected_amount": round(total_amount, 2),
        "preview_transactions": matched_txns[:20]  # Sample first 20
    }
