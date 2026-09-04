import uuid
import json
import logging
from decimal import Decimal
from typing import List, Optional
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Transaction, TransferLink, WebhookEndpoint, WebhookDelivery, WebhookEventType
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Transfers & Webhooks"])

class TransferCreateRequest(BaseModel):
    from_account_id: uuid.UUID
    to_account_id: uuid.UUID
    amount: Decimal
    transfer_date: date_type
    description: Optional[str] = None
    reference_id: Optional[str] = None

class LinkExistingTransactionsRequest(BaseModel):
    from_transaction_id: uuid.UUID
    to_transaction_id: uuid.UUID
    amount: Optional[Decimal] = None

class EditTransferLinkRequest(BaseModel):
    current_transaction_id: Optional[uuid.UUID] = None
    new_counterpart_transaction_id: Optional[uuid.UUID] = None
    amount: Optional[Decimal] = None
    transfer_date: Optional[date_type] = None

class WebhookCreateRequest(BaseModel):
    url: str
    secret: Optional[str] = None
    description: Optional[str] = None
    subscribed_events: Optional[List[str]] = None

@router.post("/transfers")
def api_create_transfer(
    req: TransferCreateRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from app.services.transfers import create_atomic_transfer
    link = create_atomic_transfer(
        db=db,
        user_id=current_user.id,
        from_account_id=req.from_account_id,
        to_account_id=req.to_account_id,
        amount=req.amount,
        transfer_date=req.transfer_date,
        description=req.description,
        reference_id=req.reference_id
    )
    try:
        from app.services.webhook_dispatcher import dispatch_webhook_event_sync
        dispatch_webhook_event_sync(db, current_user.id, WebhookEventType.TRANSFER_COMPLETED.value, {
            "transfer_id": str(link.id),
            "amount": float(link.amount),
            "date": str(link.transfer_date)
        })
    except Exception:
        pass

    return {
        "message": "Transfer pair created successfully",
        "transfer_id": str(link.id),
        "amount": float(link.amount),
        "date": str(link.transfer_date)
    }

@router.get("/transfers")
def api_list_transfers(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from app.services.transfers import get_user_transfers
    return get_user_transfers(db, current_user.id)

@router.delete("/transfers/{link_id}")
def api_delete_transfer(
    link_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from app.services.transfers import delete_atomic_transfer
    return delete_atomic_transfer(db, current_user.id, link_id)

@router.post("/transfers/link-existing")
def api_link_existing_transactions(
    req: LinkExistingTransactionsRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from app.services.transfers import link_existing_transactions
    link = link_existing_transactions(
        db=db,
        user_id=current_user.id,
        from_transaction_id=req.from_transaction_id,
        to_transaction_id=req.to_transaction_id,
        custom_amount=req.amount
    )
    return {
        "status": "LINKED",
        "message": "Transactions successfully linked.",
        "transfer_link_id": str(link.id),
        "amount": float(link.amount),
        "date": str(link.transfer_date)
    }

@router.put("/transfers/links/{link_id}")
def api_edit_transfer_link(
    link_id: uuid.UUID,
    req: EditTransferLinkRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from app.services.transfers import edit_transfer_link
    return edit_transfer_link(
        db=db,
        user_id=current_user.id,
        transfer_link_id=link_id,
        current_transaction_id=req.current_transaction_id,
        new_counterpart_transaction_id=req.new_counterpart_transaction_id,
        new_amount=req.amount,
        new_transfer_date=req.transfer_date
    )

@router.delete("/transfers/links/{link_id}")
@router.post("/transfers/links/{link_id}/unlink")
def api_unlink_transactions(
    link_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from app.services.transfers import unlink_transactions
    return unlink_transactions(db, current_user.id, link_id)

@router.get("/transfers/candidates")
def api_get_payment_match_candidates(
    transaction_id: uuid.UUID,
    max_candidates: int = 10,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from app.services.transfers import find_payment_match_candidates
    return find_payment_match_candidates(db, current_user.id, transaction_id, max_candidates)

@router.get("/transfers/searchable-transactions")
def api_search_candidate_transactions(
    exclude_id: uuid.UUID,
    account_id: Optional[uuid.UUID] = None,
    query: Optional[str] = None,
    limit: int = 25,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from app.services.transfers import search_candidate_transactions
    return search_candidate_transactions(db, current_user.id, exclude_id, account_id, query, limit)

@router.get("/transfers/link-details/{transaction_id}")
def api_get_transaction_link_details(
    transaction_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    link = tx.transfer_link
    if not link:
        return {"is_linked": False}
    
    cp = tx.counterpart_transaction
    return {
        "is_linked": True,
        "transfer_link_id": str(link.id),
        "amount": float(link.amount),
        "transfer_date": str(link.transfer_date),
        "counterpart": {
            "id": str(cp.id) if cp else None,
            "account_id": str(cp.account_id) if cp else None,
            "account_name": cp.account.name if (cp and cp.account) else "Unknown",
            "date": str(cp.date) if cp else None,
            "amount": float(cp.amount) if cp else 0.0,
            "description": cp.description if cp else None,
            "raw_narration": cp.raw_narration if cp else None,
            "reference_id": cp.reference_id or cp.utr_number if cp else None,
            "payment_rail": cp.payment_rail.value if (cp and hasattr(cp.payment_rail, 'value')) else str(cp.payment_rail) if cp else None
        } if cp else None
    }

@router.get("/webhooks")
def api_list_webhooks(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    endpoints = db.query(WebhookEndpoint).filter(WebhookEndpoint.user_id == current_user.id).all()
    results = []
    for ep in endpoints:
        results.append({
            "id": str(ep.id),
            "url": ep.url,
            "description": ep.description,
            "subscribed_events": json.loads(ep.subscribed_events or "[]"),
            "is_active": ep.is_active,
            "created_at": ep.created_at.isoformat() if ep.created_at else None
        })
    return results

@router.post("/webhooks")
def api_create_webhook(
    req: WebhookCreateRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from app.services.webhook_dispatcher import register_webhook_endpoint
    ep = register_webhook_endpoint(
        db=db,
        user_id=current_user.id,
        url=req.url,
        secret=req.secret,
        description=req.description,
        subscribed_events=req.subscribed_events
    )
    return {
        "message": "Webhook endpoint registered successfully",
        "id": str(ep.id),
        "url": ep.url,
        "secret": ep.secret,
        "subscribed_events": json.loads(ep.subscribed_events)
    }

@router.delete("/webhooks/{endpoint_id}")
def api_delete_webhook(
    endpoint_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    ep = db.query(WebhookEndpoint).filter(
        WebhookEndpoint.id == endpoint_id,
        WebhookEndpoint.user_id == current_user.id
    ).first()
    if not ep:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found")
    db.delete(ep)
    db.commit()
    return {"message": "Webhook endpoint deleted successfully"}

@router.post("/webhooks/{endpoint_id}/test")
def api_test_webhook(
    endpoint_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from app.services.webhook_dispatcher import send_test_ping
    return send_test_ping(db, current_user.id, endpoint_id)

@router.get("/webhooks/{endpoint_id}/deliveries")
def api_webhook_deliveries(
    endpoint_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    ep = db.query(WebhookEndpoint).filter(
        WebhookEndpoint.id == endpoint_id,
        WebhookEndpoint.user_id == current_user.id
    ).first()
    if not ep:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found")

    deliveries = db.query(WebhookDelivery).filter(
        WebhookDelivery.webhook_id == endpoint_id
    ).order_by(WebhookDelivery.created_at.desc()).limit(50).all()

    return [{
        "id": str(d.id),
        "event_type": d.event_type,
        "status_code": d.status_code,
        "duration_ms": d.duration_ms,
        "success": d.success,
        "error_message": d.error_message,
        "created_at": d.created_at.isoformat() if d.created_at else None
    } for d in deliveries]
