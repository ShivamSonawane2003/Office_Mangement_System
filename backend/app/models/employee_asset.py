from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, UniqueConstraint
from datetime import datetime
from app.database import Base

class EmployeeAsset(Base):
    __tablename__ = "employee_assets"
    
    id = Column(Integer, primary_key=True, index=True)
    employee_name = Column(String(255), nullable=False, index=True)
    machine_device = Column(String(255), nullable=False, index=True)
    company_brand = Column(String(255))
    model = Column(String(255))
    configuration = Column(Text)  # Multi-line text
    issue_date = Column(DateTime, index=True)
    retirement_date = Column(DateTime, index=True)
    serial_number = Column(String(255), nullable=False, index=True)
    condition = Column(String(50), index=True)  # Excellent, Outstanding, Good, So So but woking, Worst
    any_issues = Column(Text)  # Multi-line text
    babuddin_no = Column(String(255))
    attachment_url = Column(String(500))  # Store path to uploaded file
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    

