import json
import numpy as np
from typing import List, Tuple
from sentence_transformers import SentenceTransformer
import faiss
from sqlalchemy import inspect, text
from app.config import get_settings
from sqlalchemy.orm import Session

settings = get_settings()

class EmbeddingService:
    """
    Service for database searching using EMBEDDING MODEL (sentence-transformers/all-MiniLM-L6-v2).
    
    This is the ONLY service that performs database searches.
    The Qwen model does NOT search - it only creates answers from these search results.
    """
    def __init__(self):
        # Initialize embedding model for semantic search
        # Model: sentence-transformers/all-MiniLM-L6-v2
        self.model = SentenceTransformer(settings.EMBEDDING_MODEL)
        self.embedding_dim = settings.EMBEDDING_DIMENSION
        self.index = faiss.IndexFlatL2(self.embedding_dim)
        # Map FAISS index -> (item_type, item_id) tuple
        # item_type: "expense" or "gst_claim"
        # item_id: expense.id or gst_claim.id
        self.id_map = {}  # Maps FAISS index to ("expense", expense_id) or ("gst_claim", gst_claim_id)
        self._schema_ready = False

    def generate_text(self, expense) -> str:
        date_parts = []
        if expense.date:
            # Full month name: "November 2025"
            date_parts.append(expense.date.strftime("%B %Y"))
            # Month abbreviation: "Nov 2025"
            date_parts.append(expense.date.strftime("%b %Y"))
            # Month number: "11 2025"
            date_parts.append(expense.date.strftime("%m %Y"))
            # Day and month: "15 November"
            date_parts.append(expense.date.strftime("%d %B"))
        
        date_str = " ".join(date_parts) if date_parts else ""
        text = f"{expense.label} {expense.item} {expense.category} {date_str} {expense.amount} rupees"
        if expense.description:
            text += f" {expense.description}"
        return text

    def create_embedding(self, text: str) -> np.ndarray:
        embedding = self.model.encode(text, convert_to_numpy=True)
        return embedding.astype(np.float32)

    def _ensure_schema(self, db: Session) -> None:
        """
        Make sure the embeddings table has the latest schema (item_type, item_id, indexes, etc.)
        This runs once per process to auto-migrate without manual SQL scripts.
        """
        if self._schema_ready:
            return
        
        inspector = inspect(db.bind)
        columns = {col["name"]: col for col in inspector.get_columns("embeddings")}
        
        # Add item_type column if missing
        if "item_type" not in columns:
            db.execute(text("ALTER TABLE embeddings ADD COLUMN item_type VARCHAR(20) NOT NULL DEFAULT 'expense' AFTER expense_id"))
            db.execute(text("UPDATE embeddings SET item_type = 'expense' WHERE item_type IS NULL OR item_type = ''"))
            columns["item_type"] = {"nullable": False}
        
        # Add item_id column if missing
        if "item_id" not in columns:
            db.execute(text("ALTER TABLE embeddings ADD COLUMN item_id INT NULL AFTER item_type"))
            # Populate with expense_id values for backward compatibility
            db.execute(text("UPDATE embeddings SET item_id = expense_id WHERE item_id IS NULL AND expense_id IS NOT NULL"))
            db.execute(text("ALTER TABLE embeddings MODIFY COLUMN item_id INT NOT NULL"))
            columns["item_id"] = {"nullable": False}
        
        # Make expense_id nullable (GST claims won't have one)
        if "expense_id" in columns and not columns["expense_id"].get("nullable", True):
            db.execute(text("ALTER TABLE embeddings MODIFY COLUMN expense_id INT NULL"))
        
        # Drop legacy unique index on expense_id if it exists
        indexes = inspector.get_indexes("embeddings")
        legacy_index = next((idx for idx in indexes if idx.get("unique") and idx.get("column_names") == ["expense_id"]), None)
        if legacy_index:
            try:
                db.execute(text("ALTER TABLE embeddings DROP INDEX expense_id"))
            except Exception:
                pass  # Index already removed or named differently
        
        # Ensure unique index on (item_type, item_id)
        indexes = inspector.get_indexes("embeddings")  # Refresh
        if not any(idx.get("name") == "uq_embeddings_item" for idx in indexes):
            db.execute(text("CREATE UNIQUE INDEX uq_embeddings_item ON embeddings (item_type, item_id)"))
        
        db.commit()
        self._schema_ready = True

    def _add_vector_to_index(self, item_type: str, item_id: int, embedding_vector: np.ndarray) -> None:
        """Add vector to FAISS index and update id_map."""
        faiss_index = self.index.ntotal
        self.index.add(np.array([embedding_vector]))
        self.id_map[faiss_index] = (item_type, item_id)

    def _upsert_embedding_record(
        self,
        item_type: str,
        item_id: int,
        text_value: str,
        embedding_vector: np.ndarray,
        db: Session,
        expense_id: int | None = None
    ) -> None:
        """Insert or update embedding row in the database without touching FAISS."""
        from app.models.expense import Embedding
        embedding_json = json.dumps(embedding_vector.tolist())
        
        existing = db.query(Embedding).filter(
            Embedding.item_type == item_type,
            Embedding.item_id == item_id
        ).first()
        
        if existing:
            existing.text = text_value
            existing.embedding_vector = embedding_json
            if expense_id is not None:
                existing.expense_id = expense_id
        else:
            db_embedding = Embedding(
                expense_id=expense_id,
                item_type=item_type,
                item_id=item_id,
                text=text_value,
                embedding_vector=embedding_json
            )
            db.add(db_embedding)
        
        db.commit()

    def add_expense(self, expense, db: Session) -> None:
        """Add expense embedding to FAISS index and database"""
        self._ensure_schema(db)
        text_value = self.generate_text(expense)
        embedding_vector = self.create_embedding(text_value)

        self._add_vector_to_index("expense", expense.id, embedding_vector)
        self._upsert_embedding_record("expense", expense.id, text_value, embedding_vector, db, expense_id=expense.id)
    
    def generate_gst_text(self, gst_claim) -> str:
        """Generate searchable text for GST claim"""
        date_parts = []
        if gst_claim.created_at:
            date = gst_claim.created_at
            # Full month name: "November 2025"
            date_parts.append(date.strftime("%B %Y"))
            # Month abbreviation: "Nov 2025"
            date_parts.append(date.strftime("%b %Y"))
            # Month number: "11 2025"
            date_parts.append(date.strftime("%m %Y"))
            # Day and month: "15 November"
            date_parts.append(date.strftime("%d %B"))
        
        date_str = " ".join(date_parts) if date_parts else ""
        
        # Include vendor, category, amount, GST amount, status for comprehensive search
        text = f"{gst_claim.vendor} {gst_claim.category} {date_str} {gst_claim.amount} rupees gst tax vat"
        text += f" gst amount {gst_claim.gst_amount} gst rate {gst_claim.gst_rate}%"
        
        # Add user name if available for person-based queries
        if hasattr(gst_claim, 'user') and gst_claim.user and gst_claim.user.full_name:
            text += f" {gst_claim.user.full_name}"
        
        return text
    
    def add_gst_claim(self, gst_claim, db: Session) -> None:
        """Add GST claim embedding to FAISS index and database"""
        self._ensure_schema(db)
        text_value = self.generate_gst_text(gst_claim)
        embedding_vector = self.create_embedding(text_value)

        self._add_vector_to_index("gst_claim", gst_claim.id, embedding_vector)
        self._upsert_embedding_record("gst_claim", gst_claim.id, text_value, embedding_vector, db, expense_id=None)

    def search(self, query: str, k: int = 10) -> List[Tuple[str, int, float]]:
        """
        Search database using EMBEDDING MODEL for semantic similarity.
        
        This is the PRIMARY method for searching ALL database items (expenses AND GST claims).
        Returns list of (item_type, item_id, similarity_score) tuples ordered by similarity.
        
        item_type: "expense" or "gst_claim"
        item_id: expense.id or gst_claim.id
        
        Note: Qwen model does NOT use this - it only receives the results to format answers.
        """
        # Create embedding vector for query using embedding model
        query_embedding = self.create_embedding(query)
        
        # Search FAISS index for similar embeddings (searches ALL data from ALL users)
        distances, indices = self.index.search(np.array([query_embedding]), k)

        results = []
        for idx, distance in zip(indices[0], distances[0]):
            if idx in self.id_map:
                # Convert distance to similarity score
                similarity = 1 / (1 + distance)
                # id_map contains (item_type, item_id) tuples
                item_type, item_id = self.id_map[idx]
                results.append((item_type, item_id, similarity))
        return results

    def load_from_db(self, db: Session) -> None:
        """
        Load ALL embeddings from database (from ALL users).
        This includes both expenses and GST claims.
        """
        from app.models.expense import Embedding

        self._ensure_schema(db)

        # Backfill missing embeddings so every expense/GST claim is searchable
        self._backfill_missing_embeddings(db)

        embeddings = db.query(Embedding).all()
        print(f"Loading {len(embeddings)} embeddings from database (all users)...")
        
        for emb in embeddings:
            embedding_vector = np.array(json.loads(emb.embedding_vector), dtype=np.float32)
            
            # Determine item_type and item_id
            if emb.item_type:
                # New format: use item_type and item_id
                item_type = emb.item_type
                item_id = emb.item_id
            else:
                # Old format: only expense_id exists (backward compatibility)
                item_type = "expense"
                item_id = emb.expense_id
            
            # Store as (item_type, item_id) tuple
            self._add_vector_to_index(item_type, item_id, embedding_vector)
        
        expense_count = sum(1 for item_type, _ in self.id_map.values() if item_type == "expense")
        gst_count = sum(1 for item_type, _ in self.id_map.values() if item_type == "gst_claim")
        print(f"✅ Loaded {len(embeddings)} embeddings: {expense_count} expenses, {gst_count} GST claims (all users)")

    def _backfill_missing_embeddings(self, db: Session) -> None:
        """
        Ensure every expense and GST claim has an embedding row.
        This only runs on startup/backfill and does not add vectors to FAISS directly.
        """
        from app.models.expense import Embedding, Expense
        from app.models.gst_claim import GSTClaim

        existing = db.query(Embedding).all()
        existing_map = set()
        for emb in existing:
            item_type = emb.item_type or "expense"
            item_id = emb.item_id or emb.expense_id
            existing_map.add((item_type, item_id))

        created = 0

        # Backfill expenses
        expenses = db.query(Expense).all()
        for expense in expenses:
            key = ("expense", expense.id)
            if key not in existing_map:
                text_value = self.generate_text(expense)
                embedding_vector = self.create_embedding(text_value)
                self._upsert_embedding_record("expense", expense.id, text_value, embedding_vector, db, expense_id=expense.id)
                existing_map.add(key)
                created += 1

        # Backfill GST claims
        gst_claims = db.query(GSTClaim).all()
        for claim in gst_claims:
            key = ("gst_claim", claim.id)
            if key not in existing_map:
                text_value = self.generate_gst_text(claim)
                embedding_vector = self.create_embedding(text_value)
                self._upsert_embedding_record("gst_claim", claim.id, text_value, embedding_vector, db, expense_id=None)
                existing_map.add(key)
                created += 1

        if created:
            print(f"ℹ️ Backfilled {created} missing embedding(s) so every record can be searched.")

_embedding_service = None

def get_embedding_service():
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
