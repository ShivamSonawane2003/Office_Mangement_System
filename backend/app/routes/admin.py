from fastapi import APIRouter, Depends, HTTPException, status, Request as FastAPIRequest
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User, Role
from app.schemas.user import UserResponse, UserCreate, UserUpdate
from app.security import get_current_user, TokenData, require_role, hash_password
from app.services.audit_service import AuditService
from datetime import datetime

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.get("/users")
async def get_all_users(
    current_user: TokenData = Depends(require_role("Super Admin")),
    db: Session = Depends(get_db)
):
    """Get all users (Super Admin only)"""
    users = db.query(User).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "department": u.department,
            "role": u.role.name if u.role else "Employee",
            "active": u.active,
            "created_at": u.created_at
        }
        for u in users
    ]

@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: TokenData = Depends(require_role("Super Admin")),
    request: FastAPIRequest = None,
    db: Session = Depends(get_db)
):
    """Update user details (Super Admin only)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    old_role = user.role.name if user.role else "Employee"
    old_active = user.active
    old_email = user.email
    
    changes = []
    if user_data.email is not None:
        # Check if email already exists for another user
        existing_user = db.query(User).filter(User.email == user_data.email, User.id != user_id).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already exists")
        if user.email != user_data.email:
            changes.append(f"Email: {old_email} → {user_data.email}")
        user.email = user_data.email
    
    if user_data.role is not None:
        role = db.query(Role).filter(Role.name == user_data.role).first()
        if not role:
            raise HTTPException(status_code=400, detail=f"Invalid role: {user_data.role}")
        if user.role_id != role.id:
            changes.append(f"Role: {old_role} → {user_data.role}")
            user.role_id = role.id
    
    if user_data.full_name is not None:
        if user.full_name != user_data.full_name:
            changes.append(f"Full Name: {user.full_name} → {user_data.full_name}")
        user.full_name = user_data.full_name
    if user_data.department is not None:
        if user.department != user_data.department:
            changes.append(f"Department: {user.department} → {user_data.department}")
        user.department = user_data.department
    if user_data.active is not None:
        if user.active != user_data.active:
            changes.append(f"Status: {'Active' if old_active else 'Inactive'} → {'Active' if user_data.active else 'Inactive'}")
        user.active = user_data.active
    
    try:
        user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating user: {str(e)}")
    
    # Log audit action
    ip_address = request.client.host if request and hasattr(request, 'client') and request.client else None
    action_text = "User Updated"
    if changes:
        action_text = f"User Updated: {', '.join(changes)}"
    AuditService.log_action(
        db=db,
        user_id=current_user.user_id,
        action=action_text,
        target_type="User",
        target_id=user.id,
        target_name=f"{user.username}",
        status="success",
        ip_address=ip_address
    )
    
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "department": user.department,
        "role": user.role.name if user.role else "Employee",
        "active": user.active
    }

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: TokenData = Depends(require_role("Super Admin")),
    request: FastAPIRequest = None,
    db: Session = Depends(get_db)
):
    """Delete user (Super Admin only)"""
    if user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Handle related records before deletion
    from app.models.expense import Expense
    from app.models.gst_claim import GSTClaim
    from app.models.audit_log import AuditLog
    
    username = user.username
    
    try:
        # Reassign expenses owned by this user to the current admin user
        expenses_updated = db.query(Expense).filter(Expense.user_id == user_id).update(
            {Expense.user_id: current_user.user_id},
            synchronize_session=False
        )
        
        # Set approved_by_id to NULL for expenses approved by this user (if any)
        db.query(Expense).filter(Expense.approved_by_id == user_id).update(
            {Expense.approved_by_id: None},
            synchronize_session=False
        )
        
        # Reassign GST claims owned by this user to the current admin user
        gst_claims_updated = db.query(GSTClaim).filter(GSTClaim.user_id == user_id).update(
            {GSTClaim.user_id: current_user.user_id},
            synchronize_session=False
        )
        
        # Set approved_by_id to NULL for GST claims approved by this user (if any)
        db.query(GSTClaim).filter(GSTClaim.approved_by_id == user_id).update(
            {GSTClaim.approved_by_id: None},
            synchronize_session=False
        )
        
        # Delete audit log entries associated with this user before deleting the user
        # This is necessary because audit_logs has a foreign key constraint on user_id
        audit_logs_count = db.query(AuditLog).filter(AuditLog.user_id == user_id).count()
        if audit_logs_count > 0:
            db.query(AuditLog).filter(AuditLog.user_id == user_id).delete()
        
        # Now delete the user
        db.delete(user)
        db.commit()
    except Exception as e:
        db.rollback()
        # Check if it's a foreign key constraint error
        error_str = str(e).lower()
        if 'foreign key' in error_str or 'constraint' in error_str:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete user due to database constraints. User has related records that must be handled first."
            )
        raise HTTPException(status_code=500, detail=f"Error deleting user: {str(e)}")
    
    # Log audit action
    ip_address = request.client.host if request and hasattr(request, 'client') and request.client else None
    try:
        AuditService.log_action(
            db=db,
            user_id=current_user.user_id,
            action="User Deleted",
            target_type="User",
            target_id=user_id,
            target_name=username,
            status="success",
            ip_address=ip_address
        )
    except Exception as audit_error:
        # Log audit failure but don't fail the deletion
        print(f"Warning: Failed to log audit action for user deletion: {audit_error}")
    
    return {"message": "User deleted successfully"}

@router.get("/statistics")
async def get_statistics(
    current_user: TokenData = Depends(require_role("Super Admin")),
    db: Session = Depends(get_db)
):
    """Get system statistics (Super Admin only)"""
    from app.models.expense import Expense
    from app.models.gst_claim import GSTClaim
    
    total_users = db.query(User).count()
    total_expenses = db.query(Expense).count()
    total_expenses_amount = sum(e.amount for e in db.query(Expense).all()) or 0
    pending_expenses = db.query(Expense).filter(Expense.status == "pending").count()
    total_gst_claims = db.query(GSTClaim).count()
    
    return {
        "total_users": total_users,
        "total_expenses": total_expenses,
        "total_expenses_amount": total_expenses_amount,
        "pending_expenses": pending_expenses,
        "total_gst_claims": total_gst_claims
    }

@router.get("/audit-log")
async def get_audit_log(
    current_user: TokenData = Depends(require_role("Super Admin")),
    db: Session = Depends(get_db),
    limit: int = 100,
    offset: int = 0
):
    """Get audit log filtered to only show Expenses and GST related actions (Super Admin only)"""
    from app.models.audit_log import AuditLog
    from app.models.expense import Expense
    from app.models.gst_claim import GSTClaim
    
    # Filter to only show Expenses and GST Claim related entries at database level
    # Actions include: approve, reject, edit, delete, and other related actions
    logs = db.query(AuditLog).filter(
        AuditLog.target_type.in_(["Expense", "GST Claim"])
    ).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    
    # Get total count of filtered logs
    total_filtered = db.query(AuditLog).filter(
        AuditLog.target_type.in_(["Expense", "GST Claim"])
    ).count()
    
    # Build response with expense/GST descriptions
    result_logs = []
    for log in logs:
        description = log.details or ""  # Start with audit log details if available
        
        # Fetch expense or GST claim description
        if log.target_type == "Expense" and log.target_id:
            expense = db.query(Expense).filter(Expense.id == log.target_id).first()
            if expense:
                # Use label as the main description, add item if different
                expense_desc = expense.label
                if expense.item and expense.item != expense.label:
                    expense_desc = f"{expense.label} ({expense.item})"
                description = expense_desc if not description else f"{expense_desc} - {description}"
        
        elif log.target_type == "GST Claim" and log.target_id:
            gst_claim = db.query(GSTClaim).filter(GSTClaim.id == log.target_id).first()
            if gst_claim:
                # Use vendor as the description
                gst_desc = f"Vendor: {gst_claim.vendor}"
                description = gst_desc if not description else f"{gst_desc} - {description}"
        
        result_logs.append({
                "id": log.id,
                "action": log.action,
                "user": log.username,
                "user_id": log.user_id,
                "target": log.target_name or f"{log.target_type} #{log.target_id}" if log.target_type and log.target_id else "N/A",
                "target_type": log.target_type,
                "target_id": log.target_id,
                "timestamp": log.created_at.isoformat() if log.created_at else None,
                "status": log.status,
            "details": description,  # This will now contain expense/GST description
                "ip_address": log.ip_address
        })
    
    return {
        "logs": result_logs,
        "total": total_filtered
    }
