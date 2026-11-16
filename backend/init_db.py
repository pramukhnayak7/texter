"""Auto-initialization script for the RAG app database.

Run this once before starting the app (or on every start — it is idempotent):

    python backend/init_db.py

It will:
  1. Create all PostgreSQL tables (users, documents, chunks)
  2. Create a default admin user if none exists (admin / admin123)
  3. Verify the FAISS index folder exists

Set DATABASE_URL in .env or as an environment variable.
"""

import os
import sys
from pathlib import Path

# Load .env from project root if present
ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
if ENV_FILE.exists():
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())

from app.database import engine, Base, init_db  # noqa: E402
from app.models import User  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.auth import hash_password  # noqa: E402


def ensure_default_user(db):
    """Create a default admin user if the users table is empty."""
    existing = db.query(User).first()
    if existing:
        print(f"[init_db] Users already exist (e.g. '{existing.username}'). Skipping default user.")
        return

    default_username = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
    default_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")

    user = User(username=default_username, password_hash=hash_password(default_password))
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"[init_db] Created default user: username='{default_username}' password='{default_password}'")
    print("[init_db]  >>> CHANGE THE DEFAULT PASSWORD IN PRODUCTION <<<")


def main():
    print("[init_db] Initializing database tables...")
    init_db()
    print("[init_db] Tables created (or already exist).")

    print("[init_db] Checking for default user...")
    db = SessionLocal()
    try:
        ensure_default_user(db)
    finally:
        db.close()

    # Ensure vector storage folder exists
    from app.config import VECTOR_DIR
    VECTOR_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[init_db] Vector directory ready: {VECTOR_DIR}")

    print("[init_db] Initialization complete.")


if __name__ == "__main__":
    main()
