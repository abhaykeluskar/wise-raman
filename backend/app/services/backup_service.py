"""
Encrypted Backup & Portability Engine for WiseRaman
Implements .wbr envelope with Argon2id KDF + AES-256-GCM authenticated cipher.
Follows wrapped DEK/KEK key hierarchy and self-verifying test-restore.
"""
import os
import json
import zipfile
import io
import base64
import hashlib
from datetime import datetime
from typing import Dict, Any, Tuple

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
            "accounts": len(data_payload.get("accounts", [])),
            "transactions": len(data_payload.get("transactions", [])),
            "rules": len(data_payload.get("rules", [])),
            "goals": len(data_payload.get("goals", [])),
            "loans": len(data_payload.get("loans", [])),
            "documents": len(data_payload.get("documents", []))
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

def test_restore_backup(wbr_bytes: bytes, passphrase: str) -> Dict[str, Any]:
    """
    Decodes, decrypts and validates a .wbr archive in memory.
    Validates cryptographic authenticity and integrity without modifying the database.
    """
    try:
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
        if "accounts" not in data_payload:
            issues.append("Missing 'accounts' semantic block.")
        if "transactions" not in data_payload:
            issues.append("Missing 'transactions' semantic block.")
            
        semantic_verified = len(issues) == 0

        return {
            "is_valid": True,
            "verified": semantic_verified,
            "semantic_issues": issues,
            "version": manifest.get("version"),
            "created_at": manifest.get("created_at"),
            "user_email": manifest.get("user_email"),
            "record_counts": manifest.get("record_counts", {}),
            "payload_data": data_payload if semantic_verified else None
        }
    except Exception as e:
        return {
            "is_valid": False,
            "error": f"Decryption failed. Incorrect passphrase or corrupt backup: {str(e)}"
        }

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
