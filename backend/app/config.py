import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
VECTOR_DIR = DATA_DIR / "vectors"

# Chunking
CHUNK_SIZE = 350          # words per chunk
CHUNK_OVERLAP = 40        # word overlap between chunks

# Retrieval
TOP_K = 5                 # number of chunks to retrieve

# Generation
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")

# Ensure directories exist
for _d in (DATA_DIR, UPLOAD_DIR, VECTOR_DIR):
    _d.mkdir(parents=True, exist_ok=True)
