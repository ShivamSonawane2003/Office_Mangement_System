from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

class RoleResponse(BaseModel):
    id: int
    name: str
    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    department: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    username: str
    role: str
    expires_in: int

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    full_name: Optional[str] = None
    department: Optional[str] = None
    active: Optional[bool] = None

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str]
    department: Optional[str]
    role: RoleResponse
    active: bool
    created_at: datetime
    class Config:
        from_attributes = True
