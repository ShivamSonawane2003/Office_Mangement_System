from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Enum
from datetime import datetime
import enum
from app.database import Base
from sqlalchemy.orm import relationship

class GSTStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    PAID = "paid"

class GSTClaim(Base):
    __tablename__ = "gst_claims"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    vendor = Column(String(255), nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String(100), nullable=False, index=True)
    gst_rate = Column(Float, nullable=False)
    gst_amount = Column(Float, nullable=False)
    ocr_extracted_gst_amount = Column(Float, nullable=True)  # Store OCR extracted GST amount for verification
    status = Column(String(50), default=GSTStatus.PENDING.value, index=True)
    payment_status = Column(String(50), default="unpaid", index=True)
    payment_comment = Column(String(500))  # Comment when payment status is changed to paid
    approved_by_id = Column(Integer, ForeignKey("users.id"))
    approval_notes = Column(String(500))
    bill_url = Column(String(255))
    previous_status = Column(String(50))  # Track previous status for undo
    last_status_change = Column(DateTime)  # Track when status was last changed
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = relationship("User", back_populates="gst_claims", foreign_keys=[user_id])
    approved_by = relationship("User", foreign_keys=[approved_by_id])

class GSTRate(Base):
    __tablename__ = "gst_rates"
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(100), unique=True, nullable=False)
    rate = Column(Float, nullable=False)
    active = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
