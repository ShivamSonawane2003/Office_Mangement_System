from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base
from app.models.expense import Expense
from app.models.gst_claim import GSTClaim

class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)
    permissions = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    users = relationship("User", back_populates="role")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    full_name = Column(String(150))
    department = Column(String(100))
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    role = relationship("Role", back_populates="users")
    expenses = relationship(
        "Expense",
        back_populates="user",
        foreign_keys=[Expense.user_id],
        primaryjoin="User.id==Expense.user_id"
    )
    approved_expenses = relationship(
        "Expense",
        foreign_keys=[Expense.approved_by_id],
        primaryjoin="User.id==Expense.approved_by_id",
        viewonly=True
    )
    gst_claims = relationship(
        "GSTClaim",
        back_populates="user",
        foreign_keys=[GSTClaim.user_id],
        primaryjoin="User.id==GSTClaim.user_id"
    )
    approved_gst_claims = relationship(
        "GSTClaim",
        foreign_keys=[GSTClaim.approved_by_id],
        primaryjoin="User.id==GSTClaim.approved_by_id",
        viewonly=True
    )
