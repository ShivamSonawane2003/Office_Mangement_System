from sqlalchemy import Column, Integer, String, Float, DateTime, Enum
from datetime import datetime
from app.database import Base
import enum

class ItemType(str, enum.Enum):
    MAIN = "main"
    MISCELLANEOUS = "miscellaneous"

class ExpensesManagerItem(Base):
    __tablename__ = "expenses_manager_items"
    
    id = Column(Integer, primary_key=True, index=True)
    item_type = Column(Enum(ItemType), nullable=False, index=True)
    date = Column(DateTime, nullable=False, index=True)
    item_name = Column(String(255), nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String(100), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

