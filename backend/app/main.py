import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Response, Request
from fastapi.responses import JSONResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel

from .config import UPLOAD_DIR
from .rag import ingest_uploaded_file, generate_answer, store
from .database import SessionLocal, init_db
from .auth import (
    hash_password,
    verify_password,
    create_session_token,
    verify_session_token,
    get_user_by_username,
    authenticate_user,
    create_user,
    SESSION_COOKIE_NAME,
    password_exceeds_limit,
)

app = FastAPI(title="OpenRouter Chat RAG", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md"}


class AuthRequest(BaseModel):
    username: str
    password: str


class AskRequest(BaseModel):
    question: str


# ------------------------------------------------------------------
# DB session dependency
# ------------------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ------------------------------------------------------------------
# Auth helpers
# ------------------------------------------------------------------
def get_current_user_id(request: Request) -> Optional[int]:
    """Read the signed session cookie and return user_id, or None."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None
    return verify_session_token(token)


def require_user(request: Request) -> int:
    """Dependency that requires a logged-in user. Returns user_id."""
    user_id = get_current_user_id(request)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not logged in")
    return user_id


def set_session_cookie(response: Response, user_id: int):
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=create_session_token(user_id),
        httponly=True,
        secure=False,  # set True behind HTTPS in production
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path="/",
    )


def clear_session_cookie(response: Response):
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


# ------------------------------------------------------------------
# Startup
# ------------------------------------------------------------------
@app.on_event("startup")
def startup():
    init_db()


# ------------------------------------------------------------------
# Auth endpoints
# ------------------------------------------------------------------
@app.post("/register")
def register(data: AuthRequest, response: Response, db=Depends(get_db)):
    username = data.username.strip()
    password = data.password
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")
    if password_exceeds_limit(password):
        raise HTTPException(status_code=400, detail="Password must be 72 UTF-8 bytes or fewer.")
    try:
        user = create_user(db, username, password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    set_session_cookie(response, user.id)
    return {"status": "registered", "user_id": user.id, "username": user.username}


@app.post("/login")
def login(data: AuthRequest, response: Response, db=Depends(get_db)):
    username = data.username.strip()
    password = data.password
    if password_exceeds_limit(password):
        raise HTTPException(status_code=400, detail="Password must be 72 UTF-8 bytes or fewer.")
    user = authenticate_user(db, username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    set_session_cookie(response, user.id)
    return {"status": "logged_in", "user_id": user.id, "username": user.username}


@app.post("/logout")
def logout(response: Response):
    clear_session_cookie(response)
    return {"status": "logged_out"}


@app.get("/me")
def me(request: Request, db=Depends(get_db)):
    user_id = get_current_user_id(request)
    if user_id is None:
        return {"authenticated": False}
    from .models import User
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"authenticated": False}
    return {"authenticated": True, "user_id": user.id, "username": user.username}


# ------------------------------------------------------------------
# Sources (user-scoped)
# ------------------------------------------------------------------
@app.get("/sources")
def list_sources(request: Request, user_id: int = Depends(require_user)):
    sources = store.list_sources(user_id)
    return {"sources": sources}


@app.post("/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    user_id: int = Depends(require_user),
):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()
        chunks = ingest_uploaded_file(tmp.name, file.filename, user_id)
        if chunks == 0:
            raise HTTPException(
                status_code=400, detail="No text could be extracted from the file."
            )
        return {"filename": file.filename, "chunks": chunks}
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


@app.post("/ask")
def ask(
    data: AskRequest,
    request: Request,
    user_id: int = Depends(require_user),
):
    question = data.question
    if not question or not question.strip():
        raise HTTPException(status_code=400, detail="Question is required")
    result = generate_answer(question.strip(), user_id)
    return JSONResponse(content=result)


@app.delete("/sources/{source_name}")
def delete_source(
    request: Request,
    source_name: str,
    user_id: int = Depends(require_user),
):
    remaining = store.remove_source(source_name, user_id)
    return {"status": "deleted", "source": source_name, "remaining_chunks": remaining}


# ------------------------------------------------------------------
# Serve frontend
# ------------------------------------------------------------------
_static_dir = Path(__file__).parent / "static"
if _static_dir.exists():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")
