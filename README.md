# OpenRouter Chat RAG — NotebookLM-style (CPU-only)

A responsive, deployable-anywhere RAG (Retrieval-Augmented Generation) chat app.
- **Backend:** FastAPI + Python
- **Retrieval:** lightweight word and phrase hashing with FAISS (CPU only; no model download)
- **Vector search:** FAISS CPU index (`IndexFlatIP` = cosine similarity)
- **Metadata DB:** PostgreSQL (stores documents, chunks, sources)
- **Generation:** OpenRouter API, with an extractive answer when no API key is set
- **Frontend:** Single-file HTML/JS/CSS, mobile-responsive, NotebookLM-inspired UI
- **Deploy:** Docker / Docker Compose on any cloud (AWS, GCP, Azure, Fly, Railway, etc.)

## Quick start (Docker + PostgreSQL)

```bash
# 1. Configure
cp .env.example .env
# edit .env and add your OPENROUTER_API_KEY (optional; without it answers use retrieved passages)

# 2. Start Postgres + RAG app
docker compose up --build

# 3. Open http://localhost:8001
```

## Without Docker (local dev)

```bash
cd openrouter-chat

# Start PostgreSQL (make sure it's running on localhost:5432)
# Create database: createdb -U postgres ragdb

cp .env.example .env
# edit .env with your DATABASE_URL and OPENROUTER_API_KEY

cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then open `http://localhost:8000` (or 8001 if port 8000 is taken).

## Usage

1. Upload PDF/TXT/MD files from the left panel.
2. Ask questions in the chat — answers are grounded in your uploaded sources with citations.
3. Remove sources anytime from the left panel.

## Cloud deployment

The document metadata is stored in PostgreSQL. FAISS vectors are rebuilt from that data when the app starts.
For an AWS EC2 demo, run the provided Docker Compose setup on a small x86_64 instance and keep its data volume attached. A managed PostgreSQL database can replace the bundled database for longer-lived deployments.

- **Railway / Fly / Render:** connect this repo, set env vars, deploy.
- **AWS ECS / GCP Cloud Run / Azure Container Apps:** build the Dockerfile and run on port `8000`, with a reachable PostgreSQL database.
- **Any VPS:** `docker compose up -d` and point a domain/reverse proxy at port `8000`.

You need a running PostgreSQL instance (the `db` service in docker-compose, or managed Postgres like RDS/Cloud SQL).

## Notes

- Retrieval runs on CPU and does not load a neural model, keeping the container small enough for a low-cost demo instance.
- Retrieval matches shared words and phrases; it may miss paraphrased questions that a semantic embedding model could find.
- Set `OPENROUTER_API_KEY` for generated answers. Without it, the app returns the best matching passage.
