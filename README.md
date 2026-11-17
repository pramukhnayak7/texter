# OpenRouter Chat

This repository contains two services:

- **Chat UI:** Node.js/Express app served on port 3000, built with Fluent UI Web Components. It streams chat completions from OpenRouter and can read optional Supabase browser configuration.
- **Document Q&A:** FastAPI app with PostgreSQL metadata storage and CPU-only FAISS retrieval. It is a separate interface and runs on port 8000 inside Docker.

## Quick start (Docker + PostgreSQL)

```bash
# 1. Configure
cp .env.example .env
# edit .env and add your OPENROUTER_API_KEY (optional; without it answers use retrieved passages)

# 2. Start the document Q&A API and PostgreSQL
docker compose up --build

# 3. Open the document Q&A API at http://localhost:8001
```

To run the Node chat UI locally, use `npm install` then `npm start`; it listens on port 3000.

## AWS EC2: Ubuntu 22.04, 2 vCPUs, 2 GiB RAM

The EC2 Compose file runs both services and PostgreSQL. The Node chat UI is public on port 80 and the document Q&A service is available on port 8001. PostgreSQL is private to the Docker network. Container limits are set to keep total service memory below the instance size and reserve CPU and memory for Ubuntu and Docker.

1. Launch an x86_64 Ubuntu Server 22.04 LTS EC2 instance with 2 vCPUs and 2 GiB RAM. Attach persistent EBS storage for the Docker volumes.
2. In the EC2 security group, allow inbound TCP 22 only from your IP and TCP 80 and 8001 from the clients that need the apps. Do not open port 5432 publicly.
3. Install Docker Engine and the Docker Compose plugin using Docker's Ubuntu instructions.
4. In this directory, copy `.env.aws.example` to `.env.aws` and set unique long random values for `POSTGRES_PASSWORD` and `SESSION_SECRET_KEY`. Set `OPENROUTER_API_KEY` if you want generated answers.
5. Start services:

   ```bash
   docker compose --env-file .env.aws -f docker-compose.ec2.yml up -d --build
   ```

6. Open `http://<EC2-public-ip>/` for chat and `http://<EC2-public-ip>:8001/` for document Q&A. Check service status with `docker compose --env-file .env.aws -f docker-compose.ec2.yml ps` and logs with `docker compose --env-file .env.aws -f docker-compose.ec2.yml logs -f`.

The database and uploaded document data live in named Docker volumes. Back up those volumes or use an external database and persistent storage before relying on the instance for important data. A 2 GiB instance is suitable for light use; concurrent large PDF ingestion can exceed the RAG container's memory limit.

## Notes

- Document retrieval runs on CPU without downloading a neural model.
- Retrieval matches shared words and phrases; it may miss paraphrased questions that a semantic embedding model could find.
- Set `OPENROUTER_API_KEY` for generated answers in either service.
