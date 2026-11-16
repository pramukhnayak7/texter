import hashlib
import re
import threading
import faiss
import numpy as np

from .database import SessionLocal, init_db
from .models import Document, Chunk


class VectorStore:
    """Lightweight CPU vector store: FAISS for vectors + PostgreSQL for metadata.

    Data is scoped per user_id so every user has their own isolated memory.
    """

    def __init__(self):
        # Ensure PostgreSQL tables exist
        init_db()

        # Deterministic feature hashing avoids downloading/loading a neural model.
        # This keeps startup and memory use small on entry-level cloud instances.
        self.dimension = 4096
        self._lock = threading.RLock()

        # FAISS index (cosine similarity via IndexFlatIP + L2-normalized vectors)
        self.index = faiss.IndexFlatIP(self.dimension)

        # In-memory mapping: FAISS row index -> {source, text, user_id}
        self.id_map = []  # parallel to FAISS rows

        self._load()

    # ------------------------------------------------------------------
    # FAISS index (PostgreSQL is the durable source of truth)
    # ------------------------------------------------------------------

    def _load(self):
        """Rebuild FAISS from PostgreSQL so vectors and metadata stay aligned."""
        self._reindex_all()

    def _reindex_all(self):
        """Re-encode all chunks from PostgreSQL into FAISS."""
        db = SessionLocal()
        try:
            chunks = (
                db.query(Chunk)
                .order_by(Chunk.user_id, Chunk.source_name, Chunk.chunk_index)
                .all()
            )
            if not chunks:
                self.index = faiss.IndexFlatIP(self.dimension)
                self.id_map = []
                return

            texts = [c.text for c in chunks]
            embeddings = self._encode(texts)
            self.index = faiss.IndexFlatIP(self.dimension)
            self.index.add(embeddings)
            self.id_map = [
                {"source": c.source_name, "text": c.text, "user_id": c.user_id}
                for c in chunks
            ]
        finally:
            db.close()

    def _encode(self, texts):
        """Map words and adjacent word pairs into normalized hashed vectors."""
        vectors = np.zeros((len(texts), self.dimension), dtype=np.float32)
        for row, text in enumerate(texts):
            words = re.findall(r"[\w']+", text.casefold())
            features = words + [f"{a}_{b}" for a, b in zip(words, words[1:])]
            for feature in features:
                digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=4).digest()
                column = int.from_bytes(digest, "little") % self.dimension
                vectors[row, column] += 1.0
        if len(vectors):
            faiss.normalize_L2(vectors)
        return vectors

    def _remove_index_rows(self, source_name, user_id):
        """Drop a replaced source while keeping FAISS rows aligned with metadata."""
        if self.index.ntotal != len(self.id_map):
            self._reindex_all()
        keep = [
            i for i, item in enumerate(self.id_map)
            if not (item["source"] == source_name and item["user_id"] == user_id)
        ]
        if len(keep) == len(self.id_map):
            return
        updated = faiss.IndexFlatIP(self.dimension)
        if keep:
            vectors = np.vstack([self.index.reconstruct(i) for i in keep]).astype(np.float32)
            updated.add(vectors)
        self.index = updated
        self.id_map = [self.id_map[i] for i in keep]

    # ------------------------------------------------------------------
    # Ingestion (scoped to a user)
    # ------------------------------------------------------------------

    def add_texts(self, texts, source_name, user_id):
        """Add text chunks: store metadata in PostgreSQL, vectors in FAISS.

        All chunks are tagged with user_id for isolation.
        """
        if not texts:
            return 0
        embeddings = self._encode(texts)

        with self._lock:
            db = SessionLocal()
            try:
                # Remove an older upload with the same name, if present.
                existing = (
                    db.query(Document)
                    .filter(Document.source_name == source_name, Document.user_id == user_id)
                    .first()
                )
                if existing:
                    db.query(Chunk).filter(
                        Chunk.source_name == source_name, Chunk.user_id == user_id
                    ).delete()
                    db.delete(existing)

                doc = Document(
                    filename=source_name,
                    source_name=source_name,
                    user_id=user_id,
                    chunk_count=len(texts),
                )
                db.add(doc)
                db.flush()

                chunk_objs = []
                for i, text in enumerate(texts):
                    chunk = Chunk(
                        document_id=doc.id,
                        chunk_index=i,
                        text=text,
                        source_name=source_name,
                        user_id=user_id,
                    )
                    db.add(chunk)
                    chunk_objs.append(chunk)

                db.commit()

                # Replace the old vectors, then append the new vectors.
                self._remove_index_rows(source_name, user_id)
                self.index.add(embeddings)
                self.id_map.extend(
                    {"source": source_name, "text": chunk.text, "user_id": user_id}
                    for chunk in chunk_objs
                )
                return len(texts)
            finally:
                db.close()

    # ------------------------------------------------------------------
    # Search (scoped to a user — user isolation)
    # ------------------------------------------------------------------

    def search(self, query, user_id, top_k=5):
        """Search FAISS, then filter results to the given user_id only.

        Returns at most top_k chunks belonging to that user.
        """
        with self._lock:
            if self.index.ntotal == 0 or len(self.id_map) == 0:
                return []

            q_emb = self._encode([query])
            # IndexFlatIP is exact; inspect all rows before filtering by user.
            k = self.index.ntotal
            scores, indices = self.index.search(q_emb, k)

            results = []
            for score, idx in zip(scores[0], indices[0]):
                if idx == -1 or int(idx) >= len(self.id_map):
                    continue
                meta = self.id_map[int(idx)]
                if meta.get("user_id") != user_id:
                    continue
                results.append(
                    {
                        "score": float(score),
                        "source": meta["source"],
                        "text": meta["text"],
                    }
                )
                if len(results) >= top_k:
                    break
            return results

    # ------------------------------------------------------------------
    # Source management (scoped to a user)
    # ------------------------------------------------------------------

    def list_sources(self, user_id):
        """Return distinct source names for a given user from PostgreSQL."""
        with self._lock:
            db = SessionLocal()
            try:
                sources = (
                    db.query(Document.source_name)
                    .filter(Document.user_id == user_id)
                    .order_by(Document.source_name)
                    .all()
                )
                return [s[0] for s in sources]
            finally:
                db.close()

    def remove_source(self, source_name, user_id):
        """Remove a source for one user and keep FAISS rows aligned."""
        with self._lock:
            db = SessionLocal()
            try:
                doc = (
                    db.query(Document)
                    .filter(Document.source_name == source_name, Document.user_id == user_id)
                    .first()
                )
                if doc:
                    db.delete(doc)
                    db.commit()
                    self._remove_index_rows(source_name, user_id)
            finally:
                db.close()
            return len(self.id_map)

    def get_chunk_count(self, user_id):
        db = SessionLocal()
        try:
            return (
                db.query(Chunk)
                .filter(Chunk.user_id == user_id)
                .count()
            )
        finally:
            db.close()


# Module-level singleton imported by rag.py
store = VectorStore()
