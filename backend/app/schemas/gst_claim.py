from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum

class GSTStatusEnum(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    PAID = "paid"

class GSTClaimCreate(BaseModel):
    vendor: str
    amount: float
    category: str
    gst_rate: float
    gst_amount: Optional[float] = None

class GSTClaimUpdate(BaseModel):
    vendor: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    gst_rate: Optional[float] = None
    gst_amount: Optional[float] = None

class GSTClaimApprove(BaseModel):
    status: GSTStatusEnum
    approval_notes: Optional[str] = None
    payment_status: Optional[str] = None

class GSTClaimResponse(BaseModel):
    id: int
    user_id: int
    vendor: str
    amount: float
    category: str
    gst_rate: float
    gst_amount: float
    status: GSTStatusEnum
    payment_status: str
    payment_comment: Optional[str] = None
    approval_notes: Optional[str]
    bill_url: Optional[str] = None
    created_at: datetime
    username: Optional[str] = None
    full_name: Optional[str] = None
    ocr_extracted_gst_amount: Optional[float] = None
    is_verified: Optional[bool] = None  # True if GST amount matches OCR, False otherwise
    class Config:
        from_attributes = True

class GSTRateResponse(BaseModel):
    id: int
    category: str
    rate: float
    active: bool

class GSTSummary(BaseModel):
    total_gst_amount: float
    approved_gst_amount: float
    pending_gst_amount: float
    pending_payments_amount: float
