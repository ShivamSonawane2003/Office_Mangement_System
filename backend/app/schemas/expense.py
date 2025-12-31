from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ExpenseCreate(BaseModel):
    date: datetime
    amount: float
    label: str
    item: str
    category: str
    description: Optional[str] = None
    gst_eligible: bool = False

class ExpenseUpdate(BaseModel):
    status: Optional[str] = None
    amount: Optional[float] = None

class ExpenseResponse(BaseModel):
    id: int
    user_id: int
    date: datetime
    amount: float
    label: str
    item: str
    category: str
    status: str
    gst_eligible: bool
    gst_amount: float
    created_at: datetime
    username: Optional[str] = None
    full_name: Optional[str] = None
    class Config:
        from_attributes = True

class ExpenseSummary(BaseModel):
    total_expenses: float
    pending_expenses: float
    approved_expenses: float
    total_gst_due: float
    expense_count: int
