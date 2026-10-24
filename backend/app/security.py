import hashlib
import secrets

from pwdlib import PasswordHash

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash("dummy-password-for-equal-work")


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def new_id() -> str:
    return secrets.token_hex(16)


def verify_password(password: str, hashed: str) -> bool:
    return passwords.verify(password, hashed)
