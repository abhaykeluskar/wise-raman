"""
Encrypted Backup & Portability Engine for WiseRaman
Implements .wbr envelope with Argon2id KDF + AES-256-GCM authenticated cipher.
Follows wrapped DEK/KEK key hierarchy, self-verifying test-restore, and selective database restore.
"""
import os
import json
import zipfile
import io
import base64
import hashlib
import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Dict, Any, Tuple, List, Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id

BACKUP_FORMAT_VERSION = 1

def _derive_kek(passphrase: str, salt: bytes) -> bytes:
    """
    Derives 32-byte Key Encryption Key (KEK) from passphrase using Argon2id.
    """
    kdf = Argon2id(
        salt=salt,
        length=32,
        iterations=3,
        lanes=4,
        memory_cost=65536
    )
    return kdf.derive(passphrase.encode('utf-8'))

def _parse_date(val):
    if not val:
        return None
    if isinstance(val, (date, datetime)):
        return val if isinstance(val, date) else val.date()
    try:
        return datetime.fromisoformat(str(val).split('T')[0]).date()
    except Exception:
        return None

def _parse_uuid(val):
    if not val:
        return uuid.uuid4()
    if isinstance(val, uuid.UUID):
        return val
    try:
        return uuid.UUID(str(val))
    except Exception:
        return uuid.uuid4()

def build_backup_payload(db, user_id: uuid.UUID, include_entities: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Extracts user entities into a structured, portable dictionary payload.
    Supports filtering by include_entities.
    """
    from app.models import Account, Transaction, UserClassificationRule, FinancialGoal, Loan, CreditCard

    all_keys = ["accounts", "transactions", "rules", "goals", "loans", "credit_cards"]
    active_keys = set(include_entities if (include_entities and len(include_entities) > 0) else all_keys)

    payload = {}

    if "accounts" in active_keys:
        accounts = db.query(Account).filter(Account.user_id == user_id).all()
        payload["accounts"] = [
            {
                "id": str(a.id),
                "name": a.name,
                "bank_name": a.bank.name if a.bank else "Primary Bank",
                "account_number_masked": a.account_number_masked or "XXXX",
                "classification": a.classification.value if hasattr(a.classification, 'value') else str(a.classification or 'ASSET'),
                "subtype": a.subtype.value if hasattr(a.subtype, 'value') else str(a.subtype or 'SAVINGS'),
                "balance": float(a.balance or 0),
                "credit_limit": float(a.credit_limit) if a.credit_limit is not None else None,
                "available_limit": float(a.available_limit) if a.available_limit is not None else None,
                "monthly_cap": float(a.monthly_cap) if a.monthly_cap is not None else None,
                "billing_cycle_day": a.billing_cycle_day
            }
            for a in accounts
        ]

    if "transactions" in active_keys:
        txns = db.query(Transaction).filter(Transaction.user_id == user_id).all()
        payload["transactions"] = [
            {
                "id": str(t.id),
                "account_id": str(t.account_id),
                "account_name": t.account.name if t.account else "Account",
                "date": str(t.date),
                "amount": float(t.amount),
                "description": t.description,
                "raw_text": t.raw_narration or t.raw_text,
                "raw_narration": t.raw_narration,
                "category": t.category,
                "subcategory": t.subcategory,
                "transaction_type": t.transaction_type.value if hasattr(t.transaction_type, 'value') else str(t.transaction_type or ''),
                "payment_rail": t.payment_rail.value if hasattr(t.payment_rail, 'value') else str(t.payment_rail or ''),
                "reference_id": t.reference_id,
                "fingerprint": t.fingerprint
            }
            for t in txns
        ]

    if "rules" in active_keys:
        rules = db.query(UserClassificationRule).filter(UserClassificationRule.user_id == user_id).all()
        payload["rules"] = [
            {
                "id": str(r.id),
                "pattern": r.match_pattern,
                "match_pattern": r.match_pattern,
                "match_field": r.match_field,
                "category": r.target_category,
                "target_category": r.target_category,
                "target_subcategory": r.target_subcategory,
                "priority": r.priority,
                "is_active": r.is_active
            }
            for r in rules
        ]

    if "goals" in active_keys:
        goals = db.query(FinancialGoal).filter(FinancialGoal.user_id == user_id).all()
        payload["goals"] = [
            {
                "id": str(g.id),
                "name": g.name,
                "category": g.category,
                "target_amount": float(g.target_amount),
                "current_amount": float(g.current_amount or 0),
                "monthly_contribution": float(g.monthly_contribution or 0),
                "target_date": str(g.target_date) if g.target_date else None,
                "priority": g.priority,
                "is_completed": g.is_completed
            }
            for g in goals
        ]

    if "loans" in active_keys:
        loans = db.query(Loan).filter(Loan.user_id == user_id).all()
        payload["loans"] = [
            {
                "id": str(l.id),
                "loan_name": l.loan_name,
                "name": l.loan_name,
                "loan_type": l.loan_type,
                "lender_name": l.lender_name,
                "principal_amount": float(l.principal_amount),
                "outstanding_balance": float(l.outstanding_balance),
                "annual_interest_rate": float(l.annual_interest_rate),
                "emi_amount": float(l.emi_amount),
                "tenure_months": l.tenure_months,
                "remaining_tenure_months": l.remaining_tenure_months,
                "start_date": str(l.start_date) if l.start_date else None,
                "next_due_date": str(l.next_due_date) if l.next_due_date else None,
                "is_active": l.is_active
            }
            for l in loans
        ]

    if "credit_cards" in active_keys:
        cards = db.query(CreditCard).filter(CreditCard.user_id == user_id).all()
        payload["credit_cards"] = [
            {
                "id": str(c.id),
                "card_name": c.card_name,
                "name": c.card_name,
                "network": c.network,
                "reward_currency": c.reward_currency,
                "monthly_cap": float(c.monthly_cap) if c.monthly_cap is not None else None,
                "statement_date": c.statement_date,
                "bank_name": c.bank.name if c.bank else "Primary Bank",
                "is_active": c.is_active
            }
            for c in cards
        ]

    return payload

def create_encrypted_backup(
    data_payload: Dict[str, Any],
    passphrase: str,
    user_email: str
) -> Tuple[bytes, Dict[str, Any], str]:
    """
    Creates an encrypted .wbr backup archive.
    Returns: (wbr_bytes, recovery_descriptor, filename)
    """
    # 1. Generate salt and derive KEK
    salt = os.urandom(16)
    kek = _derive_kek(passphrase, salt)

    # 2. Generate random DEK and encrypt DEK with KEK
    dek = AESGCM.generate_key(bit_length=256)
    aesgcm_kek = AESGCM(kek)
    dek_nonce = os.urandom(12)
    encrypted_dek = aesgcm_kek.encrypt(dek_nonce, dek, b"wiseraman-dek-v1")

    # 3. Encrypt the data payload with DEK
    aesgcm_dek = AESGCM(dek)
    payload_nonce = os.urandom(12)
    raw_payload_bytes = json.dumps(data_payload, default=str).encode('utf-8')
    encrypted_payload = aesgcm_dek.encrypt(payload_nonce, raw_payload_bytes, b"wiseraman-payload-v1")

    # 4. Manifest metadata
    now_iso = datetime.now().isoformat()
    manifest = {
        "format": "wiseraman-backup",
        "version": BACKUP_FORMAT_VERSION,
        "created_at": now_iso,
        "user_email": user_email,
        "kdf": "Argon2id",
        "cipher": "AES-256-GCM",
        "salt_b64": base64.b64encode(salt).decode('utf-8'),
        "dek_nonce_b64": base64.b64encode(dek_nonce).decode('utf-8'),
        "encrypted_dek_b64": base64.b64encode(encrypted_dek).decode('utf-8'),
        "payload_nonce_b64": base64.b64encode(payload_nonce).decode('utf-8'),
        "record_counts": {
            key: len(val) for key, val in data_payload.items() if isinstance(val, list)
        }
    }

    # 5. Integrity checksum
    payload_hash = hashlib.sha256(encrypted_payload).hexdigest()
    integrity = {
        "payload_sha256": payload_hash,
        "manifest_sha256": hashlib.sha256(json.dumps(manifest).encode('utf-8')).hexdigest()
    }

    # 6. Build in-memory ZIP (.wbr)
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        zf.writestr("integrity.json", json.dumps(integrity, indent=2))
        zf.writestr("encrypted/payload.enc", encrypted_payload)

    wbr_bytes = zip_buffer.getvalue()
    date_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"wise-raman-{date_str}.wbr"

    # 7. Safe Recovery Descriptor (contains parameters & checksum, NO secret keys)
    recovery_descriptor = {
        "backup_filename": filename,
        "format": "wiseraman-recovery-descriptor",
        "version": BACKUP_FORMAT_VERSION,
        "created_at": now_iso,
        "cipher": "AES-256-GCM",
        "kdf": "Argon2id (time=3, memory=64MB, parallelism=4)",
        "archive_sha256": hashlib.sha256(wbr_bytes).hexdigest(),
        "record_counts": manifest["record_counts"],
        "note": "Keep your passphrase safe. WiseRaman cannot recover forgotten passphrases."
    }

    return wbr_bytes, recovery_descriptor, filename

def test_restore_backup(wbr_bytes: bytes, passphrase: str = "") -> Dict[str, Any]:
    """
    Decodes, decrypts and validates a .wbr archive (or JSON) in memory.
    Validates cryptographic authenticity and integrity without modifying the database.
    """
    try:
        # Check if plain unencrypted JSON
        trimmed = wbr_bytes.strip()
        if trimmed.startswith(b"{") and trimmed.endswith(b"}"):
            try:
                plain_json = json.loads(trimmed.decode('utf-8'))
                if isinstance(plain_json, dict):
                    data_payload = plain_json.get("data", plain_json)
                    record_counts = {k: len(v) for k, v in data_payload.items() if isinstance(v, list)}
                    entity_summary = {}
                    for k, count in record_counts.items():
                        entity_summary[k] = {
                            "count": count,
                            "samples": data_payload.get(k, [])[:2]
                        }
                    return {
                        "is_valid": True,
                        "verified": True,
                        "semantic_issues": [],
                        "version": plain_json.get("version", BACKUP_FORMAT_VERSION),
                        "created_at": plain_json.get("exported_at", datetime.now().isoformat()),
                        "user_email": plain_json.get("user_email", "Plain Export"),
                        "record_counts": record_counts,
                        "entity_summary": entity_summary,
                        "payload_data": data_payload
                    }
            except Exception:
                pass

        # Decrypt encrypted .wbr ZIP archive
        zip_buffer = io.BytesIO(wbr_bytes)
        with zipfile.ZipFile(zip_buffer, 'r') as zf:
            manifest_raw = zf.read("manifest.json").decode('utf-8')
            manifest = json.loads(manifest_raw)
            integrity_raw = zf.read("integrity.json").decode('utf-8')
            integrity = json.loads(integrity_raw)
            encrypted_payload = zf.read("encrypted/payload.enc")

        # 1. Verify integrity hash
        actual_payload_hash = hashlib.sha256(encrypted_payload).hexdigest()
        if actual_payload_hash != integrity.get("payload_sha256"):
            return {"is_valid": False, "error": "Integrity checksum mismatch. Archive may be corrupted."}

        # 2. Extract crypto parameters
        salt = base64.b64decode(manifest["salt_b64"])
        dek_nonce = base64.b64decode(manifest["dek_nonce_b64"])
        encrypted_dek = base64.b64decode(manifest["encrypted_dek_b64"])
        payload_nonce = base64.b64decode(manifest["payload_nonce_b64"])

        # 3. Derive KEK and unwrap DEK
        kek = _derive_kek(passphrase, salt)
        aesgcm_kek = AESGCM(kek)
        dek = aesgcm_kek.decrypt(dek_nonce, encrypted_dek, b"wiseraman-dek-v1")

        # 4. Decrypt payload
        aesgcm_dek = AESGCM(dek)
        decrypted_payload_bytes = aesgcm_dek.decrypt(payload_nonce, encrypted_payload, b"wiseraman-payload-v1")
        data_payload = json.loads(decrypted_payload_bytes.decode('utf-8'))

        # 5. Semantic & Cryptographic Checks
        issues = []
        if not isinstance(data_payload, dict):
            issues.append("Payload is not a valid JSON dictionary.")
        elif not any(k in data_payload for k in ["accounts", "transactions", "rules", "goals", "loans", "credit_cards"]):
            issues.append("Archive does not contain any recognized financial entities.")
            
        semantic_verified = len(issues) == 0

        # Build dynamic record counts & entity summary for checkboxes
        record_counts = {}
        entity_summary = {}
        for k in ["accounts", "transactions", "rules", "goals", "loans", "credit_cards"]:
            items = data_payload.get(k, [])
            if isinstance(items, list) and len(items) > 0:
                record_counts[k] = len(items)
                entity_summary[k] = {
                    "count": len(items),
                    "samples": items[:2]
                }

        return {
            "is_valid": True,
            "verified": semantic_verified,
            "semantic_issues": issues,
            "version": manifest.get("version"),
            "created_at": manifest.get("created_at"),
            "user_email": manifest.get("user_email"),
            "record_counts": record_counts,
            "entity_summary": entity_summary,
            "payload_data": data_payload if semantic_verified else None
        }
    except Exception as e:
        return {
            "is_valid": False,
            "error": f"Decryption failed. Incorrect passphrase or corrupt backup: {str(e)}"
        }

def apply_restore_backup(
    db,
    user_id: uuid.UUID,
    data_payload: Dict[str, Any],
    selected_entities: List[str],
    conflict_strategy: str = "skip_duplicates"
) -> Dict[str, Any]:
    """
    Executes selective restore of user entities into the database within an atomic transaction.
    Resolves foreign key relationships, handles duplicate detection, and reports detailed stats.
    """
    from app.models import (
        Bank, Account, Transaction, UserClassificationRule,
        FinancialGoal, Loan, CreditCard, AccountClassification,
        AccountSubtype, PaymentRail, TransactionType, ReviewState
    )
    from app.services.reconciliation_engine import compute_transaction_fingerprint

    stats = {
        "accounts": {"restored": 0, "skipped": 0, "updated": 0},
        "transactions": {"restored": 0, "skipped": 0, "updated": 0},
        "rules": {"restored": 0, "skipped": 0, "updated": 0},
        "goals": {"restored": 0, "skipped": 0, "updated": 0},
        "loans": {"restored": 0, "skipped": 0, "updated": 0},
        "credit_cards": {"restored": 0, "skipped": 0, "updated": 0}
    }

    try:
        # Default bank fallback
        default_bank = db.query(Bank).filter(
            (Bank.name == "Primary Bank") & ((Bank.user_id == user_id) | (Bank.user_id.is_(None)))
        ).first()
        if not default_bank:
            default_bank = Bank(id=uuid.uuid4(), name="Primary Bank", user_id=user_id)
            db.add(default_bank)
            db.flush()

        # 1. RESTORE ACCOUNTS
        if "accounts" in selected_entities and "accounts" in data_payload:
            for acc in data_payload["accounts"]:
                acc_name = acc.get("name") or "Restored Account"
                existing_acc = db.query(Account).filter(
                    Account.user_id == user_id,
                    Account.name == acc_name
                ).first()

                if existing_acc:
                    if conflict_strategy == "overwrite":
                        if "balance" in acc:
                            existing_acc.balance = Decimal(str(acc["balance"]))
                        if "subtype" in acc:
                            try:
                                existing_acc.subtype = AccountSubtype(acc["subtype"])
                            except Exception:
                                pass
                        if "classification" in acc:
                            try:
                                existing_acc.classification = AccountClassification(acc["classification"])
                            except Exception:
                                pass
                        stats["accounts"]["updated"] += 1
                        stats["accounts"]["restored"] += 1
                    else:
                        stats["accounts"]["skipped"] += 1
                else:
                    bank_name = acc.get("bank_name") or "Primary Bank"
                    bank = db.query(Bank).filter(
                        (Bank.name == bank_name) & ((Bank.user_id == user_id) | (Bank.user_id.is_(None)))
                    ).first()
                    if not bank:
                        bank = Bank(id=uuid.uuid4(), name=bank_name, user_id=user_id)
                        db.add(bank)
                        db.flush()

                    subtype_val = AccountSubtype.SAVINGS
                    if "subtype" in acc:
                        try:
                            subtype_val = AccountSubtype(acc["subtype"])
                        except Exception:
                            subtype_val = AccountSubtype.SAVINGS

                    class_val = AccountClassification.ASSET
                    if "classification" in acc:
                        try:
                            class_val = AccountClassification(acc["classification"])
                        except Exception:
                            class_val = AccountClassification.ASSET

                    new_acc = Account(
                        id=_parse_uuid(acc.get("id")),
                        user_id=user_id,
                        bank_id=bank.id,
                        account_number_masked=acc.get("account_number_masked", "XXXX"),
                        name=acc_name,
                        classification=class_val,
                        subtype=subtype_val,
                        balance=Decimal(str(acc.get("balance", 0.00))),
                        credit_limit=Decimal(str(acc["credit_limit"])) if acc.get("credit_limit") is not None else None,
                        monthly_cap=Decimal(str(acc["monthly_cap"])) if acc.get("monthly_cap") is not None else None,
                        billing_cycle_day=acc.get("billing_cycle_day")
                    )
                    db.add(new_acc)
                    db.flush()
                    stats["accounts"]["restored"] += 1

        # Cache accounts for mapping transactions & credit cards
        user_accounts = db.query(Account).filter(Account.user_id == user_id).all()
        account_by_id = {str(a.id): a for a in user_accounts}
        account_by_name = {a.name.lower(): a for a in user_accounts}
        fallback_account = user_accounts[0] if user_accounts else None

        # 2. RESTORE TRANSACTIONS
        if "transactions" in selected_entities and "transactions" in data_payload:
            for tx in data_payload["transactions"]:
                target_acc = None
                tx_acc_id = str(tx.get("account_id") or "")
                if tx_acc_id in account_by_id:
                    target_acc = account_by_id[tx_acc_id]
                elif tx.get("account_name") and tx["account_name"].lower() in account_by_name:
                    target_acc = account_by_name[tx["account_name"].lower()]
                else:
                    target_acc = fallback_account

                if not target_acc:
                    # Create default account if none exists
                    target_acc = Account(
                        id=uuid.uuid4(),
                        user_id=user_id,
                        bank_id=default_bank.id,
                        account_number_masked="XXXX",
                        name="Restored Primary Account",
                        classification=AccountClassification.ASSET,
                        subtype=AccountSubtype.SAVINGS,
                        balance=Decimal("0.00")
                    )
                    db.add(target_acc)
                    db.flush()
                    account_by_id[str(target_acc.id)] = target_acc
                    account_by_name[target_acc.name.lower()] = target_acc
                    fallback_account = target_acc

                tx_date = _parse_date(tx.get("date")) or date.today()
                tx_amount = Decimal(str(tx.get("amount", 0.0)))
                raw_text = tx.get("raw_narration") or tx.get("raw_text") or tx.get("description") or "Restored Transaction"
                clean_desc = tx.get("description") or raw_text
                fp = tx.get("fingerprint") or compute_transaction_fingerprint(
                    str(target_acc.id), str(tx_date), float(tx_amount), raw_text, tx.get("reference_id")
                )

                existing_tx = db.query(Transaction).filter(
                    Transaction.user_id == user_id,
                    (Transaction.fingerprint == fp) | (
                        (Transaction.account_id == target_acc.id) &
                        (Transaction.date == tx_date) &
                        (Transaction.amount == tx_amount) &
                        (Transaction.raw_narration == raw_text)
                    )
                ).first()

                if existing_tx:
                    if conflict_strategy == "overwrite":
                        existing_tx.category = (tx.get("category") or existing_tx.category)[:50]
                        if tx.get("subcategory"):
                            existing_tx.subcategory = tx["subcategory"][:50]
                        existing_tx.description = clean_desc
                        stats["transactions"]["updated"] += 1
                        stats["transactions"]["restored"] += 1
                    else:
                        stats["transactions"]["skipped"] += 1
                else:
                    ttype = TransactionType.EXPENSE if tx_amount < 0 else TransactionType.INCOME
                    if tx.get("transaction_type"):
                        try:
                            ttype = TransactionType(tx["transaction_type"])
                        except Exception:
                            pass

                    rail = PaymentRail.UPI
                    if tx.get("payment_rail"):
                        try:
                            rail = PaymentRail(tx["payment_rail"])
                        except Exception:
                            pass

                    new_tx = Transaction(
                        id=_parse_uuid(tx.get("id")),
                        user_id=user_id,
                        account_id=target_acc.id,
                        date=tx_date,
                        amount=tx_amount,
                        description=clean_desc,
                        raw_narration=raw_text,
                        category=(tx.get("category") or "Uncategorized")[:50],
                        subcategory=(tx.get("subcategory") or "")[:50],
                        transaction_type=ttype,
                        payment_rail=rail,
                        review_state=ReviewState.VERIFIED,
                        reference_id=(tx.get("reference_id")[:100] if tx.get("reference_id") else None),
                        fingerprint=fp,
                        verified=True
                    )
                    db.add(new_tx)
                    stats["transactions"]["restored"] += 1

        # 3. RESTORE RULES
        if "rules" in selected_entities and "rules" in data_payload:
            for r in data_payload["rules"]:
                pat = r.get("match_pattern") or r.get("pattern")
                if not pat:
                    continue
                cat = r.get("target_category") or r.get("category") or "Uncategorized"
                existing_rule = db.query(UserClassificationRule).filter(
                    UserClassificationRule.user_id == user_id,
                    UserClassificationRule.match_pattern == pat
                ).first()

                if existing_rule:
                    if conflict_strategy == "overwrite":
                        existing_rule.target_category = cat
                        if r.get("target_subcategory"):
                            existing_rule.target_subcategory = r["target_subcategory"]
                        stats["rules"]["updated"] += 1
                        stats["rules"]["restored"] += 1
                    else:
                        stats["rules"]["skipped"] += 1
                else:
                    new_rule = UserClassificationRule(
                        id=_parse_uuid(r.get("id")),
                        user_id=user_id,
                        match_pattern=pat,
                        match_field=r.get("match_field", "raw_text"),
                        target_category=cat,
                        target_subcategory=r.get("target_subcategory"),
                        is_excluded_from_spending=bool(r.get("is_excluded_from_spending", False)),
                        priority=int(r.get("priority", 100)),
                        is_active=bool(r.get("is_active", True))
                    )
                    db.add(new_rule)
                    stats["rules"]["restored"] += 1

        # 4. RESTORE GOALS
        if "goals" in selected_entities and "goals" in data_payload:
            for g in data_payload["goals"]:
                g_name = g.get("name")
                if not g_name:
                    continue
                existing_goal = db.query(FinancialGoal).filter(
                    FinancialGoal.user_id == user_id,
                    FinancialGoal.name == g_name
                ).first()

                if existing_goal:
                    if conflict_strategy == "overwrite":
                        existing_goal.target_amount = Decimal(str(g.get("target_amount", 0.0)))
                        existing_goal.current_amount = Decimal(str(g.get("current_amount", 0.0)))
                        stats["goals"]["updated"] += 1
                        stats["goals"]["restored"] += 1
                    else:
                        stats["goals"]["skipped"] += 1
                else:
                    new_goal = FinancialGoal(
                        id=_parse_uuid(g.get("id")),
                        user_id=user_id,
                        name=g_name,
                        category=g.get("category", "OTHER"),
                        target_amount=Decimal(str(g.get("target_amount", 0.0))),
                        current_amount=Decimal(str(g.get("current_amount", 0.0))),
                        monthly_contribution=Decimal(str(g.get("monthly_contribution", 0.0))),
                        target_date=_parse_date(g.get("target_date")),
                        priority=g.get("priority", "MEDIUM"),
                        is_completed=bool(g.get("is_completed", False))
                    )
                    db.add(new_goal)
                    stats["goals"]["restored"] += 1

        # 5. RESTORE LOANS
        if "loans" in selected_entities and "loans" in data_payload:
            for l in data_payload["loans"]:
                l_name = l.get("loan_name") or l.get("name")
                if not l_name:
                    continue
                existing_loan = db.query(Loan).filter(
                    Loan.user_id == user_id,
                    Loan.loan_name == l_name
                ).first()

                if existing_loan:
                    if conflict_strategy == "overwrite":
                        existing_loan.outstanding_balance = Decimal(str(l.get("outstanding_balance", 0.0)))
                        stats["loans"]["updated"] += 1
                        stats["loans"]["restored"] += 1
                    else:
                        stats["loans"]["skipped"] += 1
                else:
                    new_loan = Loan(
                        id=_parse_uuid(l.get("id")),
                        user_id=user_id,
                        loan_name=l_name,
                        loan_type=l.get("loan_type", "PERSONAL_LOAN"),
                        lender_name=l.get("lender_name", "Unknown Lender"),
                        principal_amount=Decimal(str(l.get("principal_amount", 0.0))),
                        outstanding_balance=Decimal(str(l.get("outstanding_balance", 0.0))),
                        annual_interest_rate=Decimal(str(l.get("annual_interest_rate", 10.0))),
                        emi_amount=Decimal(str(l.get("emi_amount", 0.0))),
                        tenure_months=int(l.get("tenure_months", 12)),
                        remaining_tenure_months=int(l.get("remaining_tenure_months", 12)),
                        start_date=_parse_date(l.get("start_date")) or date.today(),
                        next_due_date=_parse_date(l.get("next_due_date")),
                        is_active=bool(l.get("is_active", True))
                    )
                    db.add(new_loan)
                    stats["loans"]["restored"] += 1

        # 6. RESTORE CREDIT CARDS
        if "credit_cards" in selected_entities and "credit_cards" in data_payload:
            for c in data_payload["credit_cards"]:
                c_name = c.get("card_name") or c.get("name")
                if not c_name:
                    continue
                existing_card = db.query(CreditCard).filter(
                    CreditCard.user_id == user_id,
                    CreditCard.card_name == c_name
                ).first()

                if existing_card:
                    if conflict_strategy == "overwrite":
                        if c.get("monthly_cap") is not None:
                            existing_card.monthly_cap = Decimal(str(c["monthly_cap"]))
                        stats["credit_cards"]["updated"] += 1
                        stats["credit_cards"]["restored"] += 1
                    else:
                        stats["credit_cards"]["skipped"] += 1
                else:
                    new_card = CreditCard(
                        id=_parse_uuid(c.get("id")),
                        user_id=user_id,
                        bank_id=default_bank.id,
                        card_name=c_name,
                        network=c.get("network", "Visa"),
                        reward_currency=c.get("reward_currency", "Reward Points"),
                        monthly_cap=Decimal(str(c["monthly_cap"])) if c.get("monthly_cap") is not None else None,
                        statement_date=int(c.get("statement_date", 1)),
                        is_active=bool(c.get("is_active", True))
                    )
                    db.add(new_card)
                    stats["credit_cards"]["restored"] += 1

        db.commit()
        return {
            "success": True,
            "stats": stats,
            "conflict_strategy": conflict_strategy,
            "total_restored": sum(s["restored"] for s in stats.values()),
            "total_skipped": sum(s["skipped"] for s in stats.values())
        }
    except Exception as e:
        db.rollback()
        raise e

def create_plain_export(data_payload: Dict[str, Any], user_email: str) -> Dict[str, Any]:
    """
    Creates an unencrypted JSON export for interoperability.
    """
    return {
        "format": "wiseraman-plain-export",
        "version": BACKUP_FORMAT_VERSION,
        "exported_at": datetime.now().isoformat(),
        "user_email": user_email,
        "warning": "UNENCRYPTED FINANCIAL DATA - Store in a secure location",
        "data": data_payload
    }
