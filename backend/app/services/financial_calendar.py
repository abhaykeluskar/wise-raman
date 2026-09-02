"""
Financial Calendar & Month-End Cash Flow Projection Engine for WiseRaman
Integrates Subscriptions, Credit Card Dues, Loan EMIs, SIPs, NACH/AutoPay, Insurance, Rent, and Tax Deadlines.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
import calendar
import uuid


def build_financial_calendar(
    current_liquid_balance: float = 0.0,
    monthly_salary: float = 0.0,
    salary_day: int = 1,
    subscriptions: List[Dict[str, Any]] = None,
    credit_cards: List[Dict[str, Any]] = None,
    loans: List[Dict[str, Any]] = None,
    mandates: List[Dict[str, Any]] = None,
    insurance_policies: List[Dict[str, Any]] = None,
    utilities: List[Dict[str, Any]] = None,
    rent_amount: float = 0.0,
    rent_day: int = 5,
    include_tax_deadlines: bool = True,
    target_date: Optional[date] = None
) -> Dict[str, Any]:
    """
    Builds the monthly financial obligations schedule, tracks alert urgencies,
    and projects month-end cash balance.
    """
    today = target_date or date.today()
    current_year = today.year
    current_month = today.month
    current_month_name = today.strftime("%B %Y")
    _, days_in_current_month = calendar.monthrange(current_year, current_month)

    events: List[Dict[str, Any]] = []

    def make_event_date(day: int) -> date:
        clamped_day = max(1, min(int(day), days_in_current_month))
        return date(current_year, current_month, clamped_day)

    def compute_urgency(event_dt: date) -> str:
        delta = (event_dt - today).days
        if delta < 0:
            return "PAST"
        if delta == 0:
            return "TODAY"
        if delta <= 3:
            return "URGENT"
        if delta <= 7:
            return "SOON"
        return "UPCOMING"

    # 1. Salary / Income Inflow
    if monthly_salary > 0:
        s_day = min(salary_day, days_in_current_month)
        s_date = make_event_date(s_day)
        events.append({
            "id": f"salary-{current_year}-{current_month}",
            "day": s_day,
            "date": s_date.isoformat(),
            "title": "Monthly Salary Credit",
            "type": "SALARY_CREDIT",
            "amount": float(monthly_salary),
            "category": "Salary",
            "is_inflow": True,
            "urgency": compute_urgency(s_date),
            "details": {"source": "Employer Direct Deposit"}
        })

    # 2. House Rent Outflow
    if rent_amount > 0:
        r_day = min(rent_day, days_in_current_month)
        r_date = make_event_date(r_day)
        events.append({
            "id": f"rent-{current_year}-{current_month}",
            "day": r_day,
            "date": r_date.isoformat(),
            "title": "House Rent",
            "type": "RENT",
            "amount": float(rent_amount),
            "category": "Housing & Rent",
            "is_inflow": False,
            "urgency": compute_urgency(r_date),
            "details": {"due_day": r_day}
        })

    # 3. Subscriptions & Recurring Digital Services
    if subscriptions:
        for idx, sub in enumerate(subscriptions):
            amount = float(sub.get("amount") or 0)
            if amount <= 0:
                continue
            name = sub.get("name") or "Subscription"
            sub_date_str = sub.get("next_expected_date")
            sub_day = 15
            if sub_date_str:
                try:
                    dt = datetime.strptime(sub_date_str[:10], "%Y-%m-%d").date()
                    sub_day = dt.day
                except Exception:
                    sub_day = 15

            ev_date = make_event_date(sub_day)
            events.append({
                "id": f"sub-{idx}-{name.replace(' ', '_').lower()}",
                "day": ev_date.day,
                "date": ev_date.isoformat(),
                "title": f"Subscription: {name}",
                "type": "SUBSCRIPTION",
                "amount": amount,
                "category": "Entertainment & SaaS",
                "is_inflow": False,
                "urgency": compute_urgency(ev_date),
                "details": {
                    "provider": name,
                    "frequency": sub.get("frequency", "Monthly")
                }
            })

    # 4. Credit Card Payment Dues
    if credit_cards:
        for idx, c in enumerate(credit_cards):
            due_day = int(c.get("payment_due_day") or c.get("statement_date") or 10)
            due_amt = float(c.get("current_balance") or c.get("total_amount_due") or 0)
            card_name = c.get("card_name") or "Credit Card"
            if due_amt > 0:
                ev_date = make_event_date(due_day)
                events.append({
                    "id": f"cc-{idx}-{card_name.replace(' ', '_').lower()}",
                    "day": ev_date.day,
                    "date": ev_date.isoformat(),
                    "title": f"{card_name} Statement Due",
                    "type": "CREDIT_CARD_DUE",
                    "amount": due_amt,
                    "category": "Credit Card Dues",
                    "is_inflow": False,
                    "urgency": compute_urgency(ev_date),
                    "details": {
                        "card": card_name,
                        "min_due": float(c.get("minimum_amount_due") or 0)
                    }
                })

    # 5. Loan EMIs
    if loans:
        for idx, l in enumerate(loans):
            emi_amt = float(l.get("emi_amount") or 0)
            if emi_amt > 0:
                due_day = int(l.get("due_day") or 10)
                loan_name = l.get("loan_name") or "Loan"
                ev_date = make_event_date(due_day)
                events.append({
                    "id": f"loan-{idx}-{loan_name.replace(' ', '_').lower()}",
                    "day": ev_date.day,
                    "date": ev_date.isoformat(),
                    "title": f"{loan_name} Monthly EMI",
                    "type": "LOAN_EMI",
                    "amount": emi_amt,
                    "category": "Loans & Debt",
                    "is_inflow": False,
                    "urgency": compute_urgency(ev_date),
                    "details": {
                        "lender": l.get("lender_name", "Bank"),
                        "type": l.get("loan_type", "Loan")
                    }
                })

    # 6. Insurance Renewals
    if insurance_policies:
        for idx, p in enumerate(insurance_policies):
            premium = float(p.get("premium_amount") or 0)
            renewal_date_str = p.get("renewal_date")
            p_name = p.get("policy_name") or "Insurance Policy"
            
            # Check if renewal is this month
            include_policy = False
            r_day = 15
            if renewal_date_str:
                try:
                    rdt = datetime.strptime(str(renewal_date_str)[:10], "%Y-%m-%d").date()
                    if rdt.month == current_month:
                        include_policy = True
                        r_day = rdt.day
                except Exception:
                    pass
            elif premium > 0:
                # If no date but policy exists, check if monthly or periodic
                if p.get("premium_frequency") == "MONTHLY":
                    include_policy = True

            if include_policy and premium > 0:
                ev_date = make_event_date(r_day)
                events.append({
                    "id": f"ins-{idx}-{p_name.replace(' ', '_').lower()}",
                    "day": ev_date.day,
                    "date": ev_date.isoformat(),
                    "title": f"Insurance Renewal: {p_name}",
                    "type": "INSURANCE_RENEWAL",
                    "amount": premium,
                    "category": "Insurance",
                    "is_inflow": False,
                    "urgency": compute_urgency(ev_date),
                    "details": {
                        "insurer": p.get("insurer_name"),
                        "sum_insured": p.get("sum_insured")
                    }
                })

    # 7. UPI AutoPay & NACH Mandates
    if mandates:
        for idx, m in enumerate(mandates):
            m_amt = float(m.get("amount") or 0)
            if m_amt > 0:
                biller = m.get("biller_name") or "Mandate"
                m_day = 15
                if m.get("next_debit_date"):
                    try:
                        mdt = datetime.strptime(str(m["next_debit_date"])[:10], "%Y-%m-%d").date()
                        m_day = mdt.day
                    except Exception:
                        m_day = 15
                ev_date = make_event_date(m_day)
                events.append({
                    "id": f"mandate-{idx}-{biller.replace(' ', '_').lower()}",
                    "day": ev_date.day,
                    "date": ev_date.isoformat(),
                    "title": f"AutoPay: {biller}",
                    "type": "MANDATE",
                    "amount": m_amt,
                    "category": "AutoPay & Mandates",
                    "is_inflow": False,
                    "urgency": compute_urgency(ev_date),
                    "details": {
                        "mandate_type": m.get("mandate_type", "UPI_AUTOPAY")
                    }
                })

    # 8. Utilities (Broadband, Electricity, Mobile)
    if utilities:
        for idx, u in enumerate(utilities):
            u_amt = float(u.get("amount") or 0)
            if u_amt > 0:
                u_name = u.get("name") or "Utility Bill"
                u_day = int(u.get("day") or 20)
                ev_date = make_event_date(u_day)
                events.append({
                    "id": f"util-{idx}-{u_name.replace(' ', '_').lower()}",
                    "day": ev_date.day,
                    "date": ev_date.isoformat(),
                    "title": f"Bill: {u_name}",
                    "type": "UTILITY",
                    "amount": u_amt,
                    "category": "Utilities",
                    "is_inflow": False,
                    "urgency": compute_urgency(ev_date),
                    "details": {"biller": u_name}
                })

    # 9. Indian Statutory Tax Deadlines
    if include_tax_deadlines:
        tax_calendar_schedule = [
            {"month": 6, "day": 15, "title": "Advance Tax Installment (15%) - Q1", "desc": "First installment of Indian Advance Tax"},
            {"month": 7, "day": 31, "title": "ITR Filing Deadline (Individuals)", "desc": "Income Tax Return filing deadline for non-audit individual assessees"},
            {"month": 9, "day": 15, "title": "Advance Tax Installment (45%) - Q2", "desc": "Second installment of Indian Advance Tax"},
            {"month": 12, "day": 15, "title": "Advance Tax Installment (75%) - Q3", "desc": "Third installment of Indian Advance Tax"},
            {"month": 3, "day": 15, "title": "Advance Tax Installment (100%) - Q4", "desc": "Final installment of Indian Advance Tax for FY"}
        ]
        for t_item in tax_calendar_schedule:
            if t_item["month"] == current_month:
                ev_date = make_event_date(t_item["day"])
                events.append({
                    "id": f"tax-{current_year}-{current_month}-{t_item['day']}",
                    "day": ev_date.day,
                    "date": ev_date.isoformat(),
                    "title": t_item["title"],
                    "type": "TAX_DEADLINE",
                    "amount": 0.0,
                    "category": "Taxes & Statutory",
                    "is_inflow": False,
                    "urgency": compute_urgency(ev_date),
                    "details": {"notes": t_item["desc"]}
                })

    # Sort events chronologically by day
    events.sort(key=lambda x: (x["day"], x["is_inflow"]))

    # Calculate Cash Flow Totals & Month-End Projection
    total_inflows = sum(e["amount"] for e in events if e["is_inflow"])
    total_outflows = sum(e["amount"] for e in events if not e["is_inflow"])
    projected_month_end_balance = current_liquid_balance + total_inflows - total_outflows
    net_surplus = total_inflows - total_outflows

    # Liquidity safety checks
    liquidity_alert = None
    if projected_month_end_balance < 0:
        liquidity_alert = {
            "severity": "CRITICAL",
            "message": f"Projected cash deficit of ₹{abs(projected_month_end_balance):,.2f} by month-end. Consider transferring funds."
        }
    elif projected_month_end_balance < (total_outflows * 0.2):
        liquidity_alert = {
            "severity": "WARNING",
            "message": f"Low buffer remaining (₹{projected_month_end_balance:,.2f}). Maintain at least 20% buffer above outflows."
        }

    urgent_events_count = sum(1 for e in events if e["urgency"] in ["URGENT", "TODAY"])

    return {
        "month": current_month_name,
        "year": current_year,
        "month_index": current_month,
        "today": today.isoformat(),
        "starting_liquid_balance": round(current_liquid_balance, 2),
        "total_scheduled_inflows": round(total_inflows, 2),
        "total_scheduled_outflows": round(total_outflows, 2),
        "projected_month_end_balance": round(projected_month_end_balance, 2),
        "net_monthly_surplus": round(net_surplus, 2),
        "liquidity_alert": liquidity_alert,
        "urgent_events_count": urgent_events_count,
        "events_count": len(events),
        "events": events
    }
