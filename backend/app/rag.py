from pathlib import Path

import requests
from fastapi import HTTPException

from .config import (
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    TOP_K,
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
)
from .vector_store import store

_system_prompt = """You are a helpful research assistant. Answer the user's question using ONLY the provided document sources.

Rules:
- Base your answer strictly on the sources below.
- Cite sources by name when you use information from them (e.g., "according to file.pdf").
- If the sources do not contain enough information, say so honestly.
- Be concise, accurate, and easy to read.
"""


def _openrouter_generate(system_prompt: str, user_prompt: str) -> str:
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://openrouter-chat.local",
        "X-Title": "OpenRouter Chat RAG",
    }
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "max_tokens": 1000,
    }
    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers=headers,
        json=payload,
        timeout=90,
    )
    try:
        resp.raise_for_status()
    except requests.HTTPError as exc:
        if resp.status_code == 401:
            detail = "OpenRouter rejected the API key. Replace OPENROUTER_API_KEY in .env with a valid key."
        else:
            try:
                detail = resp.json().get("error", {}).get("message", resp.reason)
            except (ValueError, AttributeError):
                detail = resp.reason
            detail = f"OpenRouter request failed ({resp.status_code}): {detail}"
        raise HTTPException(status_code=502, detail=detail) from exc
    return resp.json()["choices"][0]["message"]["content"]


def _extractive_answer(query: str, results: list) -> str:
    """Fallback when no LLM is configured: return the best matching chunk."""
    if not results:
        return "I don't have any documents indexed yet. Please upload a PDF, TXT, or MD file first."
    best = results[0]
    return (
        f"I couldn't reach a language model, but here's the most relevant passage "
        f"from **{best['source']}**:\n\n{best['text'][:800]}..."
    )


def build_context(results: list) -> str:
    parts = []
    for r in results:
        parts.append(f"[Source: {r['source']}]\n{r['text']}")
    return "\n\n---\n\n".join(parts)


def generate_answer(question: str, user_id: int) -> dict:
    results = store.search(question, user_id=user_id, top_k=TOP_K)
    context = build_context(results)

    user_prompt = f"""Sources:
{context}

Question: {question}

Answer:"""

    if OPENROUTER_API_KEY:
        answer = _openrouter_generate(_system_prompt, user_prompt)
    else:
        answer = _extractive_answer(question, results)

    return {
        "answer": answer,
        "sources": [
            {
                "source": r["source"],
                "text": r["text"][:400],
                "score": round(r["score"], 4),
            }
            for r in results
        ],
    }


# ------------------------------------------------------------------
# File ingestion helpers used by the API
# ------------------------------------------------------------------


def extract_text(file_path: str) -> str:
    path = Path(file_path)
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        import PyPDF2

        with open(file_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            return "\n".join(page.extract_text() or "" for page in reader.pages)
    # .txt, .md, or any plain text
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def chunk_text(text: str, source_name: str, user_id: int) -> int:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunks.append(" ".join(words[i : i + CHUNK_SIZE]))
        i += CHUNK_SIZE - CHUNK_OVERLAP
    return store.add_texts(chunks, source_name, user_id)


def ingest_uploaded_file(tmp_path: str, filename: str, user_id: int) -> int:
    text = extract_text(tmp_path)
    if not text.strip():
        return 0
    return chunk_text(text, filename, user_id)
