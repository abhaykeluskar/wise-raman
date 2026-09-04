import base64
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.services.backup_service import (
    create_encrypted_backup, build_backup_payload,
    test_restore_backup, apply_restore_backup, create_plain_export
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backup", tags=["Backup & Restore"])

class BackupExportWbrRequest(BaseModel):
    passphrase: str
    selected_entities: Optional[List[str]] = None

class BackupExportPlainRequest(BaseModel):
    selected_entities: Optional[List[str]] = None

class BackupTestRestoreRequest(BaseModel):
    wbr_base64: str
    passphrase: Optional[str] = ""

class BackupApplyRestoreRequest(BaseModel):
    wbr_base64: str
    passphrase: Optional[str] = ""
    selected_entities: List[str]
    conflict_strategy: Optional[str] = "skip_duplicates"

@router.post("/export-wbr")
def export_encrypted_backup(data: BackupExportWbrRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    payload = build_backup_payload(db=db, user_id=current_user.id, include_entities=data.selected_entities)
    wbr_bytes, recovery_descriptor, filename = create_encrypted_backup(
        data_payload=payload,
        passphrase=data.passphrase,
        user_email=current_user.email
    )
    return {
        "filename": filename,
        "wbr_base64": base64.b64encode(wbr_bytes).decode('utf-8'),
        "recovery_descriptor": recovery_descriptor
    }

@router.post("/test-restore")
def test_restore_backup_api(data: BackupTestRestoreRequest, current_user = Depends(get_current_user)):
    try:
        wbr_bytes = base64.b64decode(data.wbr_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 payload")

    return test_restore_backup(wbr_bytes, data.passphrase or "")

@router.post("/restore")
def apply_backup_restore_api(data: BackupApplyRestoreRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        wbr_bytes = base64.b64decode(data.wbr_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 payload")

    verified_result = test_restore_backup(wbr_bytes, data.passphrase or "")
    if not verified_result.get("is_valid"):
        raise HTTPException(status_code=400, detail=verified_result.get("error", "Backup verification failed."))

    payload_data = verified_result.get("payload_data")
    if not payload_data:
        raise HTTPException(status_code=400, detail="No readable payload data found in backup archive.")

    if not data.selected_entities:
        raise HTTPException(status_code=400, detail="No entities selected for restore.")

    try:
        return apply_restore_backup(
            db=db,
            user_id=current_user.id,
            data_payload=payload_data,
            selected_entities=data.selected_entities,
            conflict_strategy=data.conflict_strategy or "skip_duplicates"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore operation failed: {str(e)}")

@router.post("/export-plain")
def export_plain_backup(data: Optional[BackupExportPlainRequest] = None, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    include_entities = data.selected_entities if data else None
    payload = build_backup_payload(db=db, user_id=current_user.id, include_entities=include_entities)
    return create_plain_export(payload, current_user.email)
