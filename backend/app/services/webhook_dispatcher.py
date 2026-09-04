import hmac
import hashlib
import json
import time
import uuid
import requests
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models import WebhookEndpoint, WebhookDelivery, WebhookEventType

def sign_payload(secret: str, payload_bytes: bytes) -> str:
    """Computes HMAC-SHA256 hexadecimal signature."""
    return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()

def dispatch_webhook_event_sync(
    db: Session,
    user_id: uuid.UUID,
    event_type: str,
    payload_data: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Dispatches a financial event to all matching registered webhook endpoints for the user.
    Records delivery outcome in WebhookDelivery table.
    """
    endpoints = db.query(WebhookEndpoint).filter(
        WebhookEndpoint.user_id == user_id,
        WebhookEndpoint.is_active == True
    ).all()

    dispatched = []
    enriched_payload = {
        "event": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": payload_data
    }
    payload_bytes = json.dumps(enriched_payload, default=str).encode("utf-8")

    for ep in endpoints:
        # Check event subscription
        try:
            subscribed = json.loads(ep.subscribed_events or "[]")
        except Exception:
            subscribed = []

        if subscribed and (event_type not in subscribed) and ("*" not in subscribed):
            continue

        signature = sign_payload(ep.secret, payload_bytes)
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "WiseRaman-Webhook/1.0",
            "X-WiseRaman-Signature": f"sha256={signature}",
            "X-WiseRaman-Event": event_type
        }

        start_time = time.time()
        status_code = None
        duration_ms = 0
        success = False
        error_msg = None

        try:
            resp = requests.post(ep.url, data=payload_bytes, headers=headers, timeout=5.0)
            status_code = resp.status_code
            duration_ms = int((time.time() - start_time) * 1000)
            success = 200 <= status_code < 300
        except Exception as ex:
            duration_ms = int((time.time() - start_time) * 1000)
            error_msg = str(ex)

        delivery = WebhookDelivery(
            webhook_id=ep.id,
            event_type=event_type,
            payload=json.dumps(enriched_payload, default=str),
            status_code=status_code,
            duration_ms=duration_ms,
            success=success,
            error_message=error_msg
        )
        db.add(delivery)
        dispatched.append({
            "endpoint_id": str(ep.id),
            "url": ep.url,
            "status_code": status_code,
            "success": success,
            "duration_ms": duration_ms
        })

    db.commit()
    return dispatched

def register_webhook_endpoint(
    db: Session,
    user_id: uuid.UUID,
    url: str,
    secret: Optional[str] = None,
    description: Optional[str] = None,
    subscribed_events: Optional[List[str]] = None
) -> WebhookEndpoint:
    """Registers a new webhook endpoint."""
    if not url.startswith("http://") and not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Invalid URL format. Must start with http:// or https://")

    sec = secret or uuid.uuid4().hex
    events_json = json.dumps(subscribed_events or [
        WebhookEventType.ANOMALY_DETECTED.value,
        WebhookEventType.BUDGET_OVERRUN.value,
        WebhookEventType.MANDATE_DUE.value,
        WebhookEventType.TRANSFER_COMPLETED.value
    ])

    ep = WebhookEndpoint(
        user_id=user_id,
        url=url,
        secret=sec,
        description=description or "External Automation Webhook",
        subscribed_events=events_json,
        is_active=True
    )
    db.add(ep)
    db.commit()
    db.refresh(ep)
    return ep

def send_test_ping(db: Session, user_id: uuid.UUID, endpoint_id: uuid.UUID) -> Dict[str, Any]:
    """Dispatches an immediate TEST_PING to an endpoint."""
    ep = db.query(WebhookEndpoint).filter(
        WebhookEndpoint.id == endpoint_id,
        WebhookEndpoint.user_id == user_id
    ).first()

    if not ep:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found.")

    test_payload = {
        "message": "WiseRaman Webhook Ping Test",
        "ping_time": datetime.now(timezone.utc).isoformat(),
        "endpoint_id": str(ep.id)
    }

    results = dispatch_webhook_event_sync(db, user_id, WebhookEventType.TEST_PING.value, test_payload)
    return results[0] if results else {"status": "skipped", "message": "No matching active endpoint"}
