from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class EmployeeAssetCreate(BaseModel):
    employee_name: str = Field(..., min_length=1, max_length=255)
    machine_device: str = Field(..., min_length=1, max_length=255)
    company_brand: Optional[str] = Field(None, max_length=255)
    model: Optional[str] = Field(None, max_length=255)
    configuration: Optional[str] = None
    issue_date: Optional[datetime] = None
    retirement_date: Optional[datetime] = None
    serial_number: Optional[str] = Field(None, max_length=255)
    condition: Optional[str] = Field(None, max_length=50)
    any_issues: Optional[str] = None
    babuddin_no: Optional[str] = Field(None, max_length=255)

class EmployeeAssetUpdate(BaseModel):
    employee_name: Optional[str] = Field(None, max_length=255)
    machine_device: Optional[str] = Field(None, max_length=255)
    company_brand: Optional[str] = Field(None, max_length=255)
    model: Optional[str] = Field(None, max_length=255)
    configuration: Optional[str] = None
    issue_date: Optional[datetime] = None
    retirement_date: Optional[datetime] = None
    serial_number: Optional[str] = Field(None, max_length=255)
    condition: Optional[str] = Field(None, max_length=50)
    any_issues: Optional[str] = None
    babuddin_no: Optional[str] = Field(None, max_length=255)

class EmployeeAssetResponse(BaseModel):
    id: int
    employee_name: str
    machine_device: str
    company_brand: Optional[str]
    model: Optional[str]
    configuration: Optional[str]
    issue_date: Optional[datetime]
    retirement_date: Optional[datetime]
    serial_number: Optional[str]
    condition: Optional[str]
    any_issues: Optional[str]
    babuddin_no: Optional[str]
    attachment_url: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

