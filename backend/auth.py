"""Session-based auth — password hashing + session tokens.

Stdlib only (hashlib/secrets/hmac); no new dependency. A login issues an opaque session
token stored in the UserSession table and set as an httponly cookie. get_current_user is a
FastAPI dependency that resolves the cookie back to a username (401 if missing/invalid).
"""
import hashlib
import hmac
import secrets

from fastapi import Cookie, HTTPException
from sqlmodel import Session

from db import User, UserSession, engine

SESSION_COOKIE = "session"
COOKIE_MAX_AGE = 60 * 60 * 24 * 7  # 7 days
_PBKDF2_ROUNDS = 200_000


# --- passwords --------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), _PBKDF2_ROUNDS
    ).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    test = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), _PBKDF2_ROUNDS
    ).hex()
    return hmac.compare_digest(test, digest)


# --- sessions ---------------------------------------------------------------
def create_session(username: str) -> str:
    token = secrets.token_urlsafe(32)
    with Session(engine) as s:
        s.add(UserSession(token=token, username=username))
        s.commit()
    return token


def delete_session(token: str) -> None:
    if not token:
        return
    with Session(engine) as s:
        row = s.get(UserSession, token)
        if row:
            s.delete(row)
            s.commit()


def register_user(username: str, password: str) -> None:
    """Create a user; raise 409 if the username is taken."""
    with Session(engine) as s:
        if s.get(User, username):
            raise HTTPException(409, "username already taken")
        s.add(User(username=username, password_hash=hash_password(password)))
        s.commit()


def authenticate(username: str, password: str) -> bool:
    with Session(engine) as s:
        user = s.get(User, username)
    return bool(user and verify_password(password, user.password_hash))


# --- dependency -------------------------------------------------------------
def get_current_user(session: str = Cookie(default=None, alias=SESSION_COOKIE)) -> str:
    if not session:
        raise HTTPException(401, "not authenticated")
    with Session(engine) as s:
        row = s.get(UserSession, session)
    if not row:
        raise HTTPException(401, "invalid session")
    return row.username
