"""
RFC 5545 iCalendar (.ics) Export Engine for WiseRaman
Generates standard calendar feed and downloadable .ics files for financial alerts,
subscriptions, credit card dues, loan EMIs, insurance renewals, and tax deadlines.
Compatible with Google Calendar, Apple Calendar, Microsoft Outlook, and Thunderbird.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
import uuid


def _escape_ics_text(text: str) -> str:
    """Escapes special characters for RFC 5545 string fields."""
    if not text:
        return ""
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def generate_ics_calendar(
    events: List[Dict[str, Any]],
    calendar_name: str = "WiseRaman Financial Alerts & Calendar",
    reminder_days_before: int = 2
) -> str:
    """
    Generates standard RFC 5545 .ics calendar content from a list of financial calendar events.
    """
    now_utc_str = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//WiseRaman//Financial OS Calendar Engine//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape_ics_text(calendar_name)}",
        "X-WR-TIMEZONE:Asia/Kolkata",
        f"X-WR-CALDESC:{_escape_ics_text('Upcoming financial dues, subscriptions, bill payments, and tax alerts from WiseRaman.')}"
    ]

    for ev in events:
        ev_id = str(ev.get("id") or uuid.uuid4())
        title = ev.get("title") or "Financial Event"
        amount = float(ev.get("amount") or 0)
        ev_type = ev.get("type", "FINANCIAL_EVENT")
        is_inflow = ev.get("is_inflow", False)
        category = ev.get("category", "Finance")
        ev_date_str = ev.get("date")

        # Determine start date
        if ev_date_str:
            try:
                dt = datetime.strptime(ev_date_str, "%Y-%m-%d").date()
            except Exception:
                dt = date.today()
        elif "day" in ev:
            today = date.today()
            day = min(int(ev["day"]), 28)
            try:
                dt = today.replace(day=day)
            except Exception:
                dt = today
        else:
            dt = date.today()

        dtstart_str = dt.strftime("%Y%m%d")
        dtend_str = (dt + timedelta(days=1)).strftime("%Y%m%d")

        amount_prefix = "+" if is_inflow else "-"
        formatted_amount = f"₹{amount:,.2f}" if amount > 0 else "₹0.00"

        summary = f"[WiseRaman] {title} ({amount_prefix}{formatted_amount})"
        description_parts = [
            "WiseRaman Financial Alert",
            f"Type: {ev_type.replace('_', ' ').title()}",
            f"Amount: {formatted_amount} ({'Inflow' if is_inflow else 'Outflow'})",
            f"Category: {category}",
            f"Scheduled Date: {dt.strftime('%d %B %Y')}"
        ]
        if ev.get("details"):
            details = ev["details"]
            if isinstance(details, dict):
                for k, v in details.items():
                    description_parts.append(f"{k.replace('_', ' ').title()}: {v}")
            elif isinstance(details, str):
                description_parts.append(f"Notes: {details}")

        description_parts.append("Tracked offline & privately with WiseRaman Financial OS.")
        description_text = "\\n".join([_escape_ics_text(p) for p in description_parts])

        lines.extend([
            "BEGIN:VEVENT",
            f"UID:wiseraman-{ev_id}@{dtstart_str}",
            f"DTSTAMP:{now_utc_str}",
            f"DTSTART;VALUE=DATE:{dtstart_str}",
            f"DTEND;VALUE=DATE:{dtend_str}",
            f"SUMMARY:{_escape_ics_text(summary)}",
            f"DESCRIPTION:{description_text}",
            f"CATEGORIES:{_escape_ics_text(category)}",
            "STATUS:CONFIRMED",
            "TRANSP:TRANSPARENT"
        ])

        # Add VALARM notification reminder (default: 2 days before at 9:00 AM)
        if reminder_days_before > 0 and not is_inflow:
            lines.extend([
                "BEGIN:VALARM",
                f"TRIGGER:-P{reminder_days_before}D",
                "ACTION:DISPLAY",
                f"DESCRIPTION:{_escape_ics_text(f'Reminder: {title} due in {reminder_days_before} days ({formatted_amount})')}",
                "END:VALARM"
            ])

        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
