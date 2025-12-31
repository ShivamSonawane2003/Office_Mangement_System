from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from app.models.expenses_manager import ItemType

class ExpensesManagerItemCreate(BaseModel):
    item_type: ItemType
    date: datetime
    item_name: str
    amount: float
    category: str

class ExpensesManagerItemUpdate(BaseModel):
    date: Optional[datetime] = None
    item_name: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None

class CategoryCreate(BaseModel):
    category: str = Field(..., min_length=1, max_length=100, description="Category name")

class ExpensesManagerItemResponse(BaseModel):
    id: int
    item_type: str
    date: datetime
    item_name: str
    amount: float
    category: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

