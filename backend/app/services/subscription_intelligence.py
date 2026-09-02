"""
Advanced Subscription Intelligence & Lifecycle Management Engine for WiseRaman
Includes:
1. Price Hike & Stealth Drift Detection (consecutive charge price jumps)
2. Category Overlap & Redundancy Guard (multi-OTT, multi-AI redundancy analysis)
3. Direct 1-Click Provider Cancellation & Management Portal Catalog
4. Unified Aggregator combining Auto-detected, Mandates, and Custom DB Subscriptions
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
from collections import defaultdict
import re

# Comprehensive Cancellation and Subscription Management Deep Links
CANCELLATION_PORTAL_CATALOG: Dict[str, str] = {
    "NETFLIX": "https://www.netflix.com/youraccount",
    "SPOTIFY": "https://www.spotify.com/account/subscription/",
    "AMAZON PRIME": "https://www.amazon.in/mc/manage",
    "PRIME VIDEO": "https://www.amazon.in/mc/manage",
    "HOTSTAR": "https://www.hotstar.com/in/my-account",
    "DISNEY": "https://www.hotstar.com/in/my-account",
    "YOUTUBE": "https://www.youtube.com/paid_memberships",
    "APPLE": "https://apps.apple.com/account/subscriptions",
    "GOOGLE PLAY": "https://play.google.com/store/account/subscriptions",
    "CHATGPT": "https://chatgpt.com/#settings/Subscription",
    "OPENAI": "https://chatgpt.com/#settings/Subscription",
    "CLAUDE": "https://claude.ai/settings/billing",
    "MIDJOURNEY": "https://www.midjourney.com/account",
    "CULT.FIT": "https://www.cult.fit/profile",
    "SONY LIV": "https://www.sonyliv.com/my-account",
    "ZEE5": "https://www.zee5.com/myaccount/subscription",
    "JIOCINEMA": "https://www.jiocinema.com/subscription",
    "SWIGGY ONE": "https://www.swiggy.com/my-account",
    "ZOMATO GOLD": "https://www.zomato.com/",
    "NOTION": "https://www.notion.so/settings",
    "GITHUB": "https://github.com/settings/billing",
    "GOOGLE ONE": "https://one.google.com/settings",
    "ICLOUD": "https://apps.apple.com/account/subscriptions",
    "1PASSWORD": "https://my.1password.com/profile",
    "HEADSPACE": "https://www.headspace.com/subscription",
    "THE KEN": "https://the-ken.com/my-account/",
}

# Semantic Category Classifiers for Overlap Analysis
CATEGORY_KEYWORD_RULES = [
    (
        "OTT & Video Streaming",
        ["NETFLIX", "HOTSTAR", "DISNEY", "PRIME VIDEO", "AMAZON PRIME", "SONY LIV", "ZEE5", "JIOCINEMA", "YOUTUBE PREMIUM", "APPLE TV", "MUBI", "LIONSGATE"]
    ),
    (
        "Music & Audio Streaming",
        ["SPOTIFY", "APPLE MUSIC", "YOUTUBE MUSIC", "AMAZON MUSIC", "GAANA", "WYNK", "JIOSAAVN", "AUDIBLE"]
    ),
    (
        "AI & Developer Tools",
        ["OPENAI", "CHATGPT", "CLAUDE", "MIDJOURNEY", "GITHUB COPILOT", "CURSOR", "REPLIT", "VERCEL", "SUPABASE", "AWS"]
    ),
    (
        "Fitness & Wellness",
        ["CULT.FIT", "CULTFIT", "HEADSPACE", "CALM", "STRAVA", "WHOOP", "FITBIT", "APPLE FITNESS"]
    ),
    (
        "Cloud Storage & Productivity",
        ["GOOGLE ONE", "ICLOUD", "DROPBOX", "ONEDRIVE", "NOTION", "1PASSWORD", "BITWARDEN", "EVERNOTE", "ADOBE"]
    ),
    (
        "Food & Delivery Passes",
        ["SWIGGY ONE", "SWIGGY", "ZOMATO GOLD", "ZOMATO", "BLINKIT", "ZEPTO"]
    ),
    (
        "News & Publications",
        ["THE KEN", "ECONOMIC TIMES", "ET PRIME", "NEW YORK TIMES", "WSJ", "MEDIUM", "FINSHOTS"]
    )
]


def resolve_cancellation_url(service_name: str) -> Optional[str]:
    """Finds provider management URL from merchant name."""
    if not service_name:
        return None
    upper_name = service_name.upper()
    for kw, url in CANCELLATION_PORTAL_CATALOG.items():
        if kw in upper_name:
            return url
    return None


def resolve_category(service_name: str) -> str:
    """Categorizes service by keyword rules."""
    if not service_name:
        return "Digital & Utilities"
    upper_name = service_name.upper()
    for category_name, keywords in CATEGORY_KEYWORD_RULES:
        for kw in keywords:
            if kw in upper_name:
                return category_name
    return "Digital & Utilities"


def detect_price_hikes(transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Analyzes transaction sequences per merchant to detect sudden upward price revisions.
    Example: Netflix changing from ₹649 to ₹799 (+23.1%).
    """
    debit_txs = [t for t in transactions if float(t.get("amount", 0)) < 0 and not t.get("is_excluded_from_spending")]
    
    # Group by merchant or normalized narration
    merchant_groups = defaultdict(list)
    for t in debit_txs:
        name = (t.get("merchant") or t.get("normalized_narration") or t.get("description") or t.get("raw_text") or "").strip()
        if not name:
            continue
        try:
            d_val = t.get("date")
            dt = datetime.strptime(str(d_val)[:10], "%Y-%m-%d").date() if d_val else date.today()
        except Exception:
            dt = date.today()
        
        merchant_groups[name].append({
            "amount": abs(float(t.get("amount", 0))),
            "date": dt,
            "raw_text": t.get("raw_text", "")
        })

    price_hikes: List[Dict[str, Any]] = []

    for merchant_name, tx_list in merchant_groups.items():
        if len(tx_list) < 2:
            continue
        
        # Sort chronologically
        sorted_txs = sorted(tx_list, key=lambda x: x["date"])
        
        # Look for step price increases between consecutive recurring charges (at least 20 days apart)
        for i in range(1, len(sorted_txs)):
            prev = sorted_txs[i - 1]
            curr = sorted_txs[i]
            
            day_gap = (curr["date"] - prev["date"]).days
            # Must be a regular recurrence cadence (20 - 400 days)
            if not (20 <= day_gap <= 400):
                continue
                
            prev_amt = prev["amount"]
            curr_amt = curr["amount"]
            
            # Detect significant upward revision (>5% increase and > ₹30 jump)
            if curr_amt > prev_amt * 1.05 and (curr_amt - prev_amt) >= 30:
                hike_amount = round(curr_amt - prev_amt, 2)
                hike_pct = round(((curr_amt - prev_amt) / prev_amt) * 100, 1)
                
                # Check if this merchant resembles a subscription / digital service
                is_sub = any(kw in merchant_name.upper() for kw, _ in CANCELLATION_PORTAL_CATALOG.items()) or \
                         any(kw in merchant_name.upper() for _, kws in CATEGORY_KEYWORD_RULES for kw in kws)
                
                price_hikes.append({
                    "id": f"hike-{merchant_name}-{curr['date'].isoformat()}",
                    "merchant": merchant_name,
                    "previous_amount": prev_amt,
                    "current_amount": curr_amt,
                    "hike_amount": hike_amount,
                    "hike_pct": hike_pct,
                    "hike_date": curr["date"].isoformat(),
                    "annual_extra_cost": round(hike_amount * 12, 2) if day_gap <= 45 else hike_amount,
                    "is_known_subscription": is_sub,
                    "cancellation_url": resolve_cancellation_url(merchant_name)
                })

    # Return most recent hikes first
    return sorted(price_hikes, key=lambda x: x["hike_date"], reverse=True)


def analyze_category_overlap(subscriptions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Identifies multiple overlapping subscriptions in the same category
    (e.g., 4 OTT streaming platforms active simultaneously).
    """
    category_buckets = defaultdict(list)
    
    for sub in subscriptions:
        cat = sub.get("category") or resolve_category(sub.get("name", ""))
        category_buckets[cat].append(sub)

    overlaps: List[Dict[str, Any]] = []

    for cat_name, sub_list in category_buckets.items():
        if len(sub_list) >= 2:
            monthly_total = sum(float(s.get("amount") or 0) for s in sub_list)
            annual_total = monthly_total * 12
            
            # Recommendation: Rotating services can save ~40%
            rotation_savings_annual = round(annual_total * 0.40, 2)
            
            overlaps.append({
                "category": cat_name,
                "active_count": len(sub_list),
                "services": [s.get("name") for s in sub_list],
                "monthly_spend": round(monthly_total, 2),
                "annual_spend": round(annual_total, 2),
                "potential_rotation_savings": rotation_savings_annual,
                "suggestion": f"You have {len(sub_list)} active {cat_name} subscriptions. Consider rotating or pausing 1-2 to save up to ₹{rotation_savings_annual:,.0f}/year."
            })

    return sorted(overlaps, key=lambda x: x["annual_spend"], reverse=True)


def get_comprehensive_subscription_payload(
    auto_subscriptions: List[Dict[str, Any]],
    custom_subscriptions: List[Dict[str, Any]],
    mandates: List[Dict[str, Any]],
    transactions: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Combines auto-detected recurrence, database custom subscriptions, and mandates
    into a unified intelligence payload.
    """
    unified_list: List[Dict[str, Any]] = []
    seen_names = set()

    # 1. Add Custom Subscriptions (User-defined priorities)
    for c in custom_subscriptions:
        name = c.get("name") or "Custom Subscription"
        amt = float(c.get("amount") or 0)
        norm_key = name.strip().lower()
        seen_names.add(norm_key)

        unified_list.append({
            "id": f"custom-{c.get('id')}",
            "name": name,
            "category": c.get("category") or resolve_category(name),
            "amount": amt,
            "frequency": c.get("frequency") or "MONTHLY",
            "billing_day": c.get("billing_day") or 1,
            "next_expected_date": str(c.get("next_renewal_date") or ""),
            "payment_method": c.get("payment_method") or "Manual Record",
            "cancellation_url": c.get("cancellation_url") or resolve_cancellation_url(name),
            "is_custom": True,
            "is_active": c.get("is_active", True),
            "notes": c.get("notes") or ""
        })

    # 2. Add Auto-Detected Subscriptions
    for a in auto_subscriptions:
        name = a.get("name") or "Subscription"
        norm_key = name.strip().lower()
        if norm_key in seen_names:
            continue
        seen_names.add(norm_key)

        amt = float(a.get("amount") or 0)
        freq = a.get("frequency") or "Monthly"
        
        unified_list.append({
            "id": f"auto-{norm_key}",
            "name": name,
            "category": a.get("category") or resolve_category(name),
            "amount": amt,
            "frequency": freq.upper(),
            "billing_day": a.get("billing_day") or 10,
            "next_expected_date": str(a.get("next_expected_date") or ""),
            "payment_method": a.get("payment_method") or "Bank Debit / Card",
            "cancellation_url": resolve_cancellation_url(name),
            "is_custom": False,
            "is_active": True,
            "notes": "Auto-detected from transaction recurrence."
        })

    # 3. Add NACH / UPI AutoPay Mandates
    for m in mandates:
        name = m.get("biller_name") or "AutoPay Mandate"
        norm_key = name.strip().lower()
        if norm_key in seen_names:
            continue
        seen_names.add(norm_key)

        amt = float(m.get("amount") or 0)
        unified_list.append({
            "id": f"mandate-{norm_key}",
            "name": name,
            "category": resolve_category(name),
            "amount": amt,
            "frequency": m.get("frequency") or "MONTHLY",
            "billing_day": 5,
            "next_expected_date": str(m.get("next_debit_date") or ""),
            "payment_method": m.get("mandate_type") or "UPI AutoPay / NACH",
            "cancellation_url": resolve_cancellation_url(name),
            "is_custom": False,
            "is_active": True,
            "notes": f"Mandate record: {m.get('mandate_type', 'AutoPay')}"
        })

    # Total Run-Rate Calculation
    total_monthly = sum(
        s["amount"] if s["frequency"] == "MONTHLY" 
        else (s["amount"] / 12 if s["frequency"] == "ANNUAL" or s["frequency"] == "YEARLY" else s["amount"] * 4.3)
        for s in unified_list if s.get("is_active", True)
    )
    total_annual = total_monthly * 12

    # Run Price Hike Detection
    price_hikes = detect_price_hikes(transactions)

    # Run Category Overlap Analysis
    overlaps = analyze_category_overlap(unified_list)
    total_overlap_savings = sum(o["potential_rotation_savings"] for o in overlaps)

    return {
        "total_active_count": len([s for s in unified_list if s.get("is_active", True)]),
        "total_monthly_spend": round(total_monthly, 2),
        "total_annual_run_rate": round(total_annual, 2),
        "price_hikes_count": len(price_hikes),
        "potential_annual_savings": round(total_overlap_savings, 2),
        "price_hikes": price_hikes,
        "category_overlaps": overlaps,
        "subscriptions": unified_list
    }
