from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.employee_asset import EmployeeAsset
from app.models.expenses_manager import ExpensesManagerItem
from app.models.user import User
from app.schemas.employee_asset import (
    EmployeeAssetCreate,
    EmployeeAssetUpdate,
    EmployeeAssetResponse
)
from app.security import get_current_user, TokenData, require_role
from app.utils.logger import get_logger
import os
from datetime import datetime

logger = get_logger(__name__)
router = APIRouter(prefix="/api/admin/employee-assets", tags=["employee-assets"])

# Predefined categories for Employee Assets
PREDEFINED_CATEGORIES = [
    "Mac book Air",
    "MAC",
    "MAC Air",
    "Mac mini",
    "Laptop",
    "iPhone 11 Pro",
    "iPhone 14 Pro",
    "Mobile",
    "Mobile 2",
    "Charger",
    "Mouse",
    "Monitor",
    "24\" Monitor",
    "SATA HDD/SSD Case",
    "RAM (Installed)",
    "MacBook Pro",
    "MacBook (General)",
    "Desktop PC",
    "Windows Laptop",
    "Linux Workstation",
    "All-in-One PC",
    "Chromebook",
    "Android Phone",
    "iPhone (General)",
    "iPad",
    "Tablet",
    "SIM Card",
    "eSIM",
    "27\" Monitor",
    "32\" Monitor",
    "UltraWide Monitor",
    "Secondary Monitor",
    "Display Adapter",
    "HDMI Adapter",
    "USB-C to HDMI Adapter",
    "Projector",
    "TV Display",
    "Keyboard",
    "Mechanical Keyboard",
    "Wireless Keyboard",
    "Trackpad",
    "Touchpad",
    "Headphones",
    "Bluetooth Headphones",
    "Headset (with mic)",
    "External HDD",
    "External SSD",
    "USB Drive",
    "Pen Drive",
    "SD Card",
    "Micro SD Card",
    "NVMe External Case",
    "Internal SSD",
    "Internal HDD",
    "USB-C Cable",
    "Lightning Cable",
    "Type-C Charger",
    "Laptop Charger",
    "Phone Charger",
    "HDMI Cable",
    "DisplayPort Cable",
    "VGA Cable",
    "Docking Station",
    "USB Hub",
    "Power Adapter",
    "Power Bank",
    "Router",
    "Wi-Fi Router",
    "Wi-Fi Adapter",
    "Ethernet Cable",
    "Ethernet Switch",
    "Network Card",
    "Access Card",
    "RFID Tag",
    "Security Key (YubiKey)",
    "Biometric Scanner",
    "Printer",
    "Scanner",
    "All-in-One Printer",
    "Web Camera",
    "Speakers",
    "Conference Mic",
    "Label Printer",
    "Laptop Stand",
    "Monitor Stand",
    "Desk Lamp",
    "Backrest / Ergonomic Support",
    "Tools",
    "Testing Devices",
    "Packaging Material",
    "Spare Parts",
    "Protection Case",
    "Laptop Bag",
    "Phone Case",
    "Screen Guard"
]

CONDITION_OPTIONS = [
    "Excellent",
    "Outstanding",
    "Good",
    "So So but woking",
    "Worst"
]

@router.get("/categories")
async def get_categories(
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all categories (predefined + custom from database)"""
    # Get unique categories from existing assets
    custom_categories = db.query(EmployeeAsset.machine_device).distinct().all()
    custom_category_list = [cat[0] for cat in custom_categories if cat[0] and cat[0] not in PREDEFINED_CATEGORIES]
    
    # Combine predefined and custom categories
    all_categories = PREDEFINED_CATEGORIES + sorted(custom_category_list)
    return {"categories": all_categories}

@router.get("/conditions")
async def get_conditions(
    current_user: TokenData = Depends(get_current_user)
):
    """Get all condition options"""
    return {"conditions": CONDITION_OPTIONS}

@router.delete("/categories/{category_name:path}")
async def delete_category(
    category_name: str,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a custom category (cannot delete predefined categories)"""
    # Check user role
    if current_user.role not in ["Super Admin", "Admin"]:
        raise HTTPException(status_code=403, detail="Only Admin and Super Admin can delete categories")
    
    from urllib.parse import unquote
    category = unquote(category_name).strip()
    if not category:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")
    
    # Cannot delete predefined categories
    if category in PREDEFINED_CATEGORIES:
        raise HTTPException(status_code=400, detail="Cannot delete predefined categories")
    
    # Check if category is being used by any assets
    assets_with_category = db.query(EmployeeAsset).filter(
        EmployeeAsset.machine_device == category
    ).all()
    assets_count = len(assets_with_category)
    
    # Update all assets using this category to use the first predefined category as default
    default_category = PREDEFINED_CATEGORIES[0] if PREDEFINED_CATEGORIES else "Laptop"
    
    if assets_count > 0:
        for asset in assets_with_category:
            asset.machine_device = default_category
        db.commit()
        logger.info(f"Updated {assets_count} asset(s) from category '{category}' to '{default_category}'")
    
    return {
        "message": f"Category '{category}' deleted successfully",
        "updated_assets": assets_count
    }

@router.get("", response_model=List[EmployeeAssetResponse])
async def get_assets(
    employee_name: Optional[str] = None,
    machine_device: Optional[str] = None,
    condition: Optional[str] = None,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all employee assets with optional filters"""
    query = db.query(EmployeeAsset)
    
    # For Employee role, filter to show only their own assets
    if current_user.role == "Employee":
        # Get user's full_name or username to match against employee_name
        user = db.query(User).filter(User.id == current_user.user_id).first()
        if user:
            # Match by full_name if available, otherwise by username
            user_name = user.full_name if user.full_name else user.username
            query = query.filter(EmployeeAsset.employee_name.ilike(f"%{user_name}%"))
    
    # Apply additional filters
    if employee_name:
        query = query.filter(EmployeeAsset.employee_name.ilike(f"%{employee_name}%"))
    if machine_device:
        query = query.filter(EmployeeAsset.machine_device.ilike(f"%{machine_device}%"))
    if condition:
        query = query.filter(EmployeeAsset.condition == condition)
    
    assets = query.order_by(EmployeeAsset.created_at.desc()).all()
    return assets

@router.get("/{asset_id}", response_model=EmployeeAssetResponse)
async def get_asset(
    asset_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single employee asset"""
    asset = db.query(EmployeeAsset).filter(EmployeeAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    # For Employee role, check if asset belongs to them
    if current_user.role == "Employee":
        user = db.query(User).filter(User.id == current_user.user_id).first()
        if user:
            user_name = user.full_name if user.full_name else user.username
            if not asset.employee_name or user_name.lower() not in asset.employee_name.lower():
                raise HTTPException(status_code=403, detail="Access denied: You can only view your own assets")
    
    return asset

@router.post("", response_model=EmployeeAssetResponse)
async def create_asset(
    employee_name: str = Form(...),
    machine_device: str = Form(...),
    company_brand: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    configuration: Optional[str] = Form(None),
    issue_date: str = Form(""),
    retirement_date: str = Form(""),
    serial_number: str = Form(""),
    condition: Optional[str] = Form(None),
    any_issues: Optional[str] = Form(None),
    babuddin_no: Optional[str] = Form(None),
    attachment: Optional[UploadFile] = File(None),
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new employee asset"""
    # For Employee role, auto-fill employee_name with their name
    if current_user.role == "Employee":
        user = db.query(User).filter(User.id == current_user.user_id).first()
        if user:
            employee_name = user.full_name if user.full_name else user.username
    
    # Normalize serial_number: empty string gets a unique value to avoid unique constraint violation
    if serial_number and serial_number.strip():
        serial_number_normalized = serial_number.strip()
        # Check for duplicate serial number (only for non-empty values)
        existing = db.query(EmployeeAsset).filter(EmployeeAsset.serial_number == serial_number_normalized).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Serial number '{serial_number_normalized}' already exists")
    else:
        # Generate unique value for empty serial numbers to avoid unique constraint violation
        import uuid
        serial_number_normalized = f"__EMPTY_{uuid.uuid4().hex[:12]}__"
    
    # Parse dates - Same logic as Expenses Manager: parse ISO string and assign directly
    issue_date_obj = None
    retirement_date_obj = None
    if issue_date and str(issue_date).strip():
        try:
            issue_date_str = str(issue_date).strip()
            # Handle ISO format with or without timezone (same as Expenses Manager)
            if issue_date_str.endswith('Z'):
                issue_date_str = issue_date_str.replace('Z', '+00:00')
            elif '+' not in issue_date_str and len(issue_date_str) > 10 and 'T' in issue_date_str:
                issue_date_str = issue_date_str + '+00:00'
            issue_date_obj = datetime.fromisoformat(issue_date_str)
        except (ValueError, AttributeError) as e:
            logger.error(f"Error parsing issue_date: {issue_date}, error: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Invalid issue_date format: {str(e)}")
    if retirement_date and str(retirement_date).strip():
        try:
            retirement_date_str = str(retirement_date).strip()
            # Handle ISO format with or without timezone (same as Expenses Manager)
            if retirement_date_str.endswith('Z'):
                retirement_date_str = retirement_date_str.replace('Z', '+00:00')
            elif '+' not in retirement_date_str and len(retirement_date_str) > 10 and 'T' in retirement_date_str:
                retirement_date_str = retirement_date_str + '+00:00'
            retirement_date_obj = datetime.fromisoformat(retirement_date_str)
        except (ValueError, AttributeError) as e:
            logger.error(f"Error parsing retirement_date: {retirement_date}, error: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Invalid retirement_date format: {str(e)}")
    
    # Handle attachment upload
    attachment_url = None
    if attachment:
        upload_dir = "uploads/employee_assets"
        os.makedirs(upload_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(attachment.filename)[1] if attachment.filename else ".jpg"
        serial_for_filename = serial_number_normalized or "no_serial"
        filename = f"asset_{serial_for_filename}_{timestamp}{file_extension}"
        file_path = os.path.join(upload_dir, filename)
        
        with open(file_path, "wb") as buffer:
            content = await attachment.read()
            buffer.write(content)
        
        attachment_url = f"/uploads/employee_assets/{filename}"
    
    asset = EmployeeAsset(
        employee_name=employee_name,
        machine_device=machine_device,
        company_brand=company_brand,
        model=model,
        configuration=configuration,
        issue_date=issue_date_obj,
        retirement_date=retirement_date_obj,
        serial_number=serial_number_normalized,
        condition=condition,
        any_issues=any_issues,
        babuddin_no=babuddin_no,
        attachment_url=attachment_url
    )
    
    try:
        db.add(asset)
        db.commit()
        db.refresh(asset)
        
        logger.info(f"Created employee asset: {asset.id} - serial_number: {asset.serial_number}, issue_date: {asset.issue_date}, retirement_date: {asset.retirement_date}")
        logger.info(f"Asset after commit - serial_number type: {type(asset.serial_number)}, value: {asset.serial_number}")
        logger.info(f"Asset after commit - issue_date type: {type(asset.issue_date)}, value: {asset.issue_date}")
        logger.info(f"Asset after commit - retirement_date type: {type(asset.retirement_date)}, value: {asset.retirement_date}")
        return asset
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating asset: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to create asset: {str(e)}")

@router.put("/{asset_id}", response_model=EmployeeAssetResponse)
async def update_asset(
    asset_id: int,
    employee_name: Optional[str] = Form(None),
    machine_device: Optional[str] = Form(None),
    company_brand: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    configuration: str = Form(""),
    issue_date: str = Form(""),
    retirement_date: str = Form(""),
    serial_number: Optional[str] = Form(None),
    condition: Optional[str] = Form(None),
    any_issues: str = Form(""),
    babuddin_no: Optional[str] = Form(None),
    attachment: Optional[UploadFile] = File(None),
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an employee asset"""
    asset = db.query(EmployeeAsset).filter(EmployeeAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    # For Employee role, check if asset belongs to them
    if current_user.role == "Employee":
        user = db.query(User).filter(User.id == current_user.user_id).first()
        if user:
            user_name = user.full_name if user.full_name else user.username
            if not asset.employee_name or user_name.lower() not in asset.employee_name.lower():
                raise HTTPException(status_code=403, detail="Access denied: You can only edit your own assets")
            # Prevent employees from changing employee_name
            if employee_name is not None:
                employee_name = asset.employee_name
    
    # Check for duplicate serial number if changing
    if serial_number and serial_number != asset.serial_number:
        existing = db.query(EmployeeAsset).filter(EmployeeAsset.serial_number == serial_number).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Serial number '{serial_number}' already exists")
        asset.serial_number = serial_number
    
    # Update fields
    if employee_name is not None:
        asset.employee_name = employee_name
    if machine_device is not None:
        asset.machine_device = machine_device
    if company_brand is not None:
        asset.company_brand = company_brand
    if model is not None:
        asset.model = model
    # Always update configuration (even if empty string)
    asset.configuration = configuration if configuration is not None else ""
    
    # Handle date fields - process if provided (empty string means clear)
    # Handle issue_date
    if issue_date is not None:  # Only process if field was sent
        issue_date_str = str(issue_date).strip() if issue_date else ''
        logger.info(f"UPDATE - Received issue_date: '{issue_date}' (type: {type(issue_date)}), stripped: '{issue_date_str}'")
        if issue_date_str:
            try:
                # Handle ISO format with or without timezone
                if issue_date_str.endswith('Z'):
                    issue_date_str = issue_date_str.replace('Z', '+00:00')
                elif '+' not in issue_date_str and len(issue_date_str) > 10 and 'T' in issue_date_str:
                    issue_date_str = issue_date_str + '+00:00'
                
                parsed_date = datetime.fromisoformat(issue_date_str)
                asset.issue_date = parsed_date
                logger.info(f"UPDATE - Set issue_date to: {asset.issue_date}")
            except (ValueError, AttributeError) as e:
                logger.error(f"Error parsing issue_date: '{issue_date_str}', error: {str(e)}")
                raise HTTPException(status_code=400, detail=f"Invalid issue_date format: {str(e)}")
        else:
            # Empty string means clear the date
            asset.issue_date = None
            logger.info("UPDATE - Cleared issue_date (set to None)")
    
    # Handle retirement_date
    if retirement_date is not None:  # Only process if field was sent
        retirement_date_str = str(retirement_date).strip() if retirement_date else ''
        logger.info(f"UPDATE - Received retirement_date: '{retirement_date}' (type: {type(retirement_date)}), stripped: '{retirement_date_str}'")
        if retirement_date_str:
            try:
                # Handle ISO format with or without timezone
                if retirement_date_str.endswith('Z'):
                    retirement_date_str = retirement_date_str.replace('Z', '+00:00')
                elif '+' not in retirement_date_str and len(retirement_date_str) > 10 and 'T' in retirement_date_str:
                    retirement_date_str = retirement_date_str + '+00:00'
                
                parsed_date = datetime.fromisoformat(retirement_date_str)
                asset.retirement_date = parsed_date
                logger.info(f"UPDATE - Set retirement_date to: {asset.retirement_date}")
            except (ValueError, AttributeError) as e:
                logger.error(f"Error parsing retirement_date: '{retirement_date_str}', error: {str(e)}")
                raise HTTPException(status_code=400, detail=f"Invalid retirement_date format: {str(e)}")
        else:
            # Empty string means clear the date
            asset.retirement_date = None
            logger.info("UPDATE - Cleared retirement_date (set to None)")
    if condition is not None:
        asset.condition = condition
    # Always update any_issues (even if empty string)
    asset.any_issues = any_issues if any_issues is not None else ""
    if babuddin_no is not None:
        asset.babuddin_no = babuddin_no
    
    # Handle attachment upload
    if attachment:
        # Delete old attachment if exists
        if asset.attachment_url:
            old_path = asset.attachment_url.lstrip("/")
            if not os.path.isabs(old_path):
                old_path = os.path.join(os.getcwd(), old_path)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except:
                    pass
        
        upload_dir = "uploads/employee_assets"
        os.makedirs(upload_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(attachment.filename)[1] if attachment.filename else ".jpg"
        filename = f"asset_{asset.serial_number}_{timestamp}{file_extension}"
        file_path = os.path.join(upload_dir, filename)
        
        with open(file_path, "wb") as buffer:
            content = await attachment.read()
            buffer.write(content)
        
        asset.attachment_url = f"/uploads/employee_assets/{filename}"
    
    try:
        db.commit()
        logger.info(f"COMMIT SUCCESS for asset {asset.id}")
        
        # Force refresh to get data from database
        db.expire(asset)
        db.refresh(asset)
        
        logger.info(f"UPDATE SUCCESS - Asset {asset.id}: issue_date={asset.issue_date}, retirement_date={asset.retirement_date}")
        logger.info(f"UPDATE SUCCESS - issue_date type: {type(asset.issue_date)}, retirement_date type: {type(asset.retirement_date)}")
        
        # Double-check by querying directly from database
        db_asset = db.query(EmployeeAsset).filter(EmployeeAsset.id == asset_id).first()
        if db_asset:
            logger.info(f"DB VERIFY - Direct query: issue_date={db_asset.issue_date}, retirement_date={db_asset.retirement_date}")
        
    except Exception as e:
        logger.error(f"Error committing asset update: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update asset: {str(e)}")
    
    return asset

@router.put("/{asset_id}/reassign", response_model=EmployeeAssetResponse)
async def reassign_asset(
    asset_id: int,
    new_employee_name: str = Form(...),
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reassign an asset to a different employee (Super Admin and Admin only)"""
    # Check if user has permission (Super Admin or Admin)
    if current_user.role not in ["Super Admin", "Admin"]:
        raise HTTPException(status_code=403, detail="Access denied: Only Super Admin and Admin can reassign assets")
    
    asset = db.query(EmployeeAsset).filter(EmployeeAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    # Validate new employee name
    if not new_employee_name or not new_employee_name.strip():
        raise HTTPException(status_code=400, detail="New employee name cannot be empty")
    
    old_employee_name = asset.employee_name
    asset.employee_name = new_employee_name.strip()
    asset.updated_at = datetime.utcnow()
    
    try:
        db.commit()
        db.refresh(asset)
        logger.info(f"Reassigned asset {asset_id} from '{old_employee_name}' to '{new_employee_name}'")
        return asset
    except Exception as e:
        logger.error(f"Error reassigning asset: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to reassign asset: {str(e)}")

@router.delete("/{asset_id}")
async def delete_asset(
    asset_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an employee asset"""
    asset = db.query(EmployeeAsset).filter(EmployeeAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    # For Employee role, check if asset belongs to them
    if current_user.role == "Employee":
        user = db.query(User).filter(User.id == current_user.user_id).first()
        if user:
            user_name = user.full_name if user.full_name else user.username
            if not asset.employee_name or user_name.lower() not in asset.employee_name.lower():
                raise HTTPException(status_code=403, detail="Access denied: You can only delete your own assets")
    
    # Delete attachment if exists
    if asset.attachment_url:
        old_path = asset.attachment_url.lstrip("/")
        if not os.path.isabs(old_path):
            old_path = os.path.join(os.getcwd(), old_path)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except:
                pass
    
    db.delete(asset)
    db.commit()
    
    logger.info(f"Deleted employee asset: {asset_id} - {asset.serial_number}")
    return {"message": "Asset deleted successfully"}

