"""Symmetric encryption for secrets stored in the DB (e.g. SMB passwords).

Key source (in order): BACKUP_ENC_KEY env, else JWT_SECRET env, else a dev
default. The raw key is hashed to a 32-byte Fernet key, so any passphrase works.

Values are prefixed with 'enc:v1:' so we can tell encrypted from legacy
plaintext and make encrypt/decrypt idempotent (safe to call twice).
"""
from __future__ import annotations
import base64
import hashlib
import os
import logging

logger = logging.getLogger(__name__)

_PREFIX = "enc:v1:"


def _fernet():
    from cryptography.fernet import Fernet
    raw = os.getenv("BACKUP_ENC_KEY") or os.getenv("JWT_SECRET", "dev-secret-key")
    key = base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest())
    return Fernet(key)


def encrypt_secret(plaintext: str | None) -> str | None:
    """Encrypt a string. Returns prefixed token. Idempotent + null-safe."""
    if not plaintext:
        return plaintext
    if plaintext.startswith(_PREFIX):
        return plaintext  # already encrypted
    try:
        token = _fernet().encrypt(plaintext.encode()).decode()
        return _PREFIX + token
    except Exception as e:
        logger.error("encrypt_secret failed: %s", e)
        return plaintext  # never lose the value


def decrypt_secret(value: str | None) -> str | None:
    """Decrypt a prefixed token. Plaintext/legacy values pass through unchanged."""
    if not value or not value.startswith(_PREFIX):
        return value
    try:
        from cryptography.fernet import InvalidToken
        try:
            return _fernet().decrypt(value[len(_PREFIX):].encode()).decode()
        except InvalidToken:
            logger.error("decrypt_secret: invalid token (wrong key?)")
            return ""
    except Exception as e:
        logger.error("decrypt_secret failed: %s", e)
        return ""


def is_encrypted(value: str | None) -> bool:
    return bool(value) and value.startswith(_PREFIX)
