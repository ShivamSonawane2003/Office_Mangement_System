from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Expense(Base):
    __tablename__ = "expenses"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(DateTime, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    label = Column(String(100), nullable=False)
    item = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False, index=True)
    description = Column(Text)
    status = Column(String(50), default="pending", index=True)
    gst_eligible = Column(Boolean, default=False)
    gst_amount = Column(Float, default=0)
    approved_for_gst = Column(Boolean, default=False)
    approved_by_id = Column(Integer, ForeignKey("users.id"))
    receipt_url = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = relationship("User", back_populates="expenses", foreign_keys=[user_id])
    embedding = relationship("Embedding", back_populates="expense", cascade="all, delete-orphan", uselist=False)

class Embedding(Base):
    __tablename__ = "embeddings"
    id = Column(Integer, primary_key=True, index=True)
    expense_id = Column(Integer, ForeignKey("expenses.id"), unique=True, nullable=True)  # Made nullable
    item_type = Column(String(20), nullable=False, default="expense", index=True)  # "expense" or "gst_claim"
    item_id = Column(Integer, nullable=False, index=True)  # expense_id or gst_claim_id
    text = Column(Text, nullable=False)
    embedding_vector = Column(String(20000), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expense = relationship("Expense", back_populates="embedding")
    
    # Unique constraint on item_type + item_id combination
    __table_args__ = (
        {'mysql_engine': 'InnoDB'},
    )
