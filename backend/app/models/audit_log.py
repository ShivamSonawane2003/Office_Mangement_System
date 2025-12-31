from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(100), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    username = Column(String(100), nullable=False)  # Store username for quick access
    target_type = Column(String(50))  # e.g., "Expense", "GST Claim", "User"
    target_id = Column(Integer)  # ID of the target entity
    target_name = Column(String(255))  # Human-readable target identifier
    status = Column(String(50), nullable=False, index=True)  # e.g., "success", "approved", "rejected"
    details = Column(Text)  # Additional details in JSON or text format
    ip_address = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    user = relationship("User", foreign_keys=[user_id])

