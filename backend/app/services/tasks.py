import uuid
import logging
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session, joinedload

from app.database import SessionLocal
from app.models import Transaction, Category, Account
from app.ai import get_embeddings_batch, get_embedding, categorize_transaction
from app.services.reconciliation import reconcile_transfers

logger = logging.getLogger(__name__)

# Lightweight in-memory registry for observability of background tasks
_task_status: Dict[str, Dict[str, Any]] = {}

def get_task_status(task_id: str) -> Optional[Dict[str, Any]]:
    return _task_status.get(task_id)

def run_reconcile_transfers(user_id: str):
    local_db = SessionLocal()
    try:
        reconcile_transfers(local_db, str(user_id))
    except Exception as e:
        logger.error(f"Error in run_reconcile_transfers: {e}")
    finally:
        local_db.close()

def run_bridge_algorithm(db: Session, user_id: str):
    """Identify and link transfers and credit card payments across accounts."""
    try:
        reconcile_transfers(db, str(user_id))
    except Exception as e:
        logger.error(f"Error in bridge algorithm: {e}")
        db.rollback()

def enrich_transactions_task(transaction_ids: List[uuid.UUID], task_id: Optional[str] = None):
    """Optimized background task using batch embeddings and fast categorization."""
    if task_id:
        _task_status[task_id] = {
            "status": "RUNNING",
            "progress": 0,
            "total": len(transaction_ids),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

    db = SessionLocal()
    try:
        db_categories = db.query(Category).all()
        categories_list = [c.name for c in db_categories] if db_categories else None
        txs = (
            db.query(Transaction)
            .options(joinedload(Transaction.account).joinedload(Account.bank))
            .filter(Transaction.id.in_(transaction_ids))
            .all()
        )
        if not txs:
            if task_id:
                _task_status[task_id] = {"status": "COMPLETED", "progress": 100, "total": 0}
            return

        # 1. Fast Rule-Based + AI Categorization
        for tx in txs:
            if not tx.category or tx.category in ["Processing...", "Parsing...", "UNKNOWN"]:
                category, subcategory, clean_description = categorize_transaction(
                    tx.description, float(tx.amount), categories_list
                )
                tx.category = category
                tx.subcategory = subcategory
                tx.description = clean_description
        db.commit()

        # 2. Batch Embedding Generation (up to 64 transactions per call)
        texts_to_embed = []
        txs_to_embed = []
        for tx in txs:
            if not tx.embedding:
                bank_name = tx.account.bank.name if tx.account and tx.account.bank else "Unknown"
                embed_text = (
                    f"Date: {tx.date}. Bank: {bank_name}. Description: {tx.description}. "
                    f"Amount: {tx.amount}. Category: {tx.category}. Subcategory: {tx.subcategory}."
                )
                texts_to_embed.append(embed_text)
                txs_to_embed.append(tx)

        if texts_to_embed:
            try:
                embeddings = asyncio.run(get_embeddings_batch(texts_to_embed, batch_size=64))
                for tx, emb in zip(txs_to_embed, embeddings):
                    if emb:
                        tx.embedding = emb
                db.commit()
            except Exception as embed_err:
                logger.warning(f"Batch embedding failed in background, falling back to individual: {embed_err}")
                for tx, text in zip(txs_to_embed, texts_to_embed):
                    emb = get_embedding(text)
                    if emb:
                        tx.embedding = emb
                db.commit()

        if txs and txs[0].account:
            run_bridge_algorithm(db, str(txs[0].account.user_id))

        if task_id:
            _task_status[task_id] = {
                "status": "COMPLETED",
                "progress": 100,
                "total": len(transaction_ids),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        logger.info(f"Successfully processed and embedded {len(txs)} transactions in background.")
    except Exception as e:
        logger.error(f"Error in background enrichment: {str(e)}")
        if task_id:
            _task_status[task_id] = {
                "status": "FAILED",
                "error": str(e),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
    finally:
        db.close()
