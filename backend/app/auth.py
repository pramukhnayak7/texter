import os
from datetime import datetime, timedelta
from typing import Optional

from passlib.context import CryptContext
from itsdangerous import TimestampSigner, BadSignature, SignatureExpired

from .database import SessionLocal
from .models import User

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Session cookie signing
SECRET_KEY = os.getenv("SESSION_SECRET_KEY", "dev-secret-change-in-production")
signer = TimestampSigner(SECRET_KEY)

SESSION_COOKIE_NAME = "rag_session"
SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60  # 7 days
MAX_PASSWORD_BYTES = 72


def password_exceeds_limit(password: str) -> bool:
    return len(password.encode("utf-8")) > MAX_PASSWORD_BYTES


def hash_password(password: str) -> str:
    if password_exceeds_limit(password):
        raise ValueError("Password must be 72 UTF-8 bytes or fewer.")
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if password_exceeds_limit(plain_password):
        return False
    return pwd_context.verify(plain_password, hashed_password)


def create_session_token(user_id: int) -> str:
    """Create a signed session token containing user_id."""
    payload = f"{user_id}:{int(datetime.utcnow().timestamp())}"
    return signer.sign(payload.encode()).decode()


def verify_session_token(token: str) -> Optional[int]:
    """Verify a signed session token and return user_id, or None if invalid/expired."""
    try:
        data = signer.unsign(token.encode(), max_age=SESSION_MAX_AGE_SECONDS)
        user_id_str = data.decode().split(":")[0]
        return int(user_id_str)
    except (BadSignature, SignatureExpired, ValueError, IndexError):
        return None


def get_user_by_username(db, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()


def authenticate_user(db, username: str, password: str) -> Optional[User]:
    user = get_user_by_username(db, username)
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    if not user.is_active:
        return None
    return user


def create_user(db, username: str, password: str) -> User:
    """Create a new user. Raises if username already exists."""
    if get_user_by_username(db, username):
        raise ValueError("Username already exists")
    user = User(username=username, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
