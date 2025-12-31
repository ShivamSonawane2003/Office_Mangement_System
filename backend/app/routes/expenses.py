from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List
from app.database import get_db
from app.models.expense import Expense
from app.schemas.expense import ExpenseCreate, ExpenseResponse, ExpenseSummary
from app.services.expense_service import ExpenseService
from app.services.embedding_service import get_embedding_service
from app.security import get_current_user, TokenData
from app.utils.logger import get_logger
from app.routes.websocket import get_connection_manager

logger = get_logger(__name__)
router = APIRouter(prefix="/api/expenses", tags=["expenses"])

def _serialize_expense(expense: Expense, db: Session = None) -> ExpenseResponse:
    """Serialize expense with user information"""
    response = ExpenseResponse.model_validate(expense)
    # Include user information if available
    # Try to access the relationship (should be loaded via joinedload)
    user_loaded = False
    try:
        # Check if user relationship exists and is loaded
        if hasattr(expense, 'user'):
            user_obj = getattr(expense, 'user', None)
            if user_obj is not None:
                response.username = getattr(user_obj, 'username', None)
                response.full_name = getattr(user_obj, 'full_name', None)
                user_loaded = True
                logger.info(f"Expense {expense.id}: Using loaded user relationship - username={response.username}, full_name={response.full_name}")
    except Exception as e:
        logger.warning(f"Expense {expense.id}: Error accessing user relationship: {e}")
    
    # If user not loaded from relationship, fetch from database
    if not user_loaded and db is not None:
        try:
            from app.models.user import User
            user = db.query(User).filter(User.id == expense.user_id).first()
            if user:
                response.username = user.username
                response.full_name = user.full_name
                logger.info(f"Expense {expense.id}: Loaded user from DB - username={user.username}, full_name={user.full_name}")
            else:
                logger.warning(f"Expense {expense.id}: User not found in database for user_id={expense.user_id}")
        except Exception as e:
            logger.error(f"Expense {expense.id}: Error loading user from DB: {e}", exc_info=True)
    
    return response

@router.post("/", response_model=ExpenseResponse)
async def create_expense(
    expense_data: ExpenseCreate, 
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        logger.info(f"Creating expense for user {current_user.user_id}")
        embedding_service = get_embedding_service()
        expense = ExpenseService.create_expense(db, expense_data, user_id=current_user.user_id, embedding_service=embedding_service)
        logger.info(f"Expense {expense.id} created successfully")
        # Broadcast update via WebSocket
        manager = get_connection_manager()
        await manager.broadcast({"type": "expense_updated", "action": "created", "expense_id": expense.id, "user_id": current_user.user_id})
        # Load user relationship for response
        expense_with_user = db.query(Expense).options(joinedload(Expense.user)).filter(Expense.id == expense.id).first()
        return _serialize_expense(expense_with_user or expense, db)
    except Exception as e:
        logger.error(f"Error creating expense: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error creating expense: {str(e)}")

@router.get("/", response_model=list[ExpenseResponse])
async def get_expenses(
    month: int = None, 
    year: int = None,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # Filter by user_id if Employee, show all if Admin/Super Admin
        user_id = current_user.user_id if current_user.role == "Employee" else None
        logger.info(f"Fetching expenses for user_id={user_id}, month={month}, year={year}, role={current_user.role}")
        # Load user relationship to include user information
        from sqlalchemy import extract
        expenses_query = db.query(Expense).options(joinedload(Expense.user))
        if user_id is not None:
            expenses_query = expenses_query.filter(Expense.user_id == user_id)
        if month and year:
            expenses_query = expenses_query.filter(
                extract('month', Expense.date) == month,
                extract('year', Expense.date) == year
            )
        expenses = expenses_query.order_by(Expense.date.desc()).all()
        logger.info(f"Found {len(expenses)} expenses")
        # Debug: Check if user relationship is loaded
        if expenses:
            first_expense = expenses[0]
            logger.info(f"Sample expense ID: {first_expense.id}, user_id: {first_expense.user_id}")
            logger.info(f"Has user attr: {hasattr(first_expense, 'user')}, user value: {getattr(first_expense, 'user', 'NOT_FOUND')}")
            if hasattr(first_expense, 'user') and first_expense.user:
                logger.info(f"User loaded: {first_expense.user.username}")
        return [_serialize_expense(expense, db) for expense in expenses]
    except Exception as e:
        logger.error(f"Error fetching expenses: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error fetching expenses: {str(e)}")

@router.get("/summary", response_model=ExpenseSummary)
async def get_summary(
    month: int, 
    year: int,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Filter by user_id if Employee, show all if Admin/Super Admin
    user_id = current_user.user_id if current_user.role == "Employee" else None
    summary = ExpenseService.get_summary(db, user_id=user_id, month=month, year=year)
    return summary

@router.put("/{expense_id}", response_model=ExpenseResponse)
async def update_expense_status(
    expense_id: int, 
    status: str,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.services.audit_service import AuditService
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if expense.user_id != current_user.user_id and current_user.role == "Employee":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    old_status = expense.status
    expense = ExpenseService.update_status(db, expense_id, status)
    
    # Log audit action for status changes (especially approve/reject by admin)
    if status in ["approved", "rejected"] and current_user.role in ["Admin", "Super Admin"]:
        action_text = f"{status.capitalize()} Expense"
        AuditService.log_action(
            db=db,
            user_id=current_user.user_id,
            action=action_text,
            target_type="Expense",
            target_id=expense_id,
            target_name=f"Expense #{expense_id}",
            status=status
        )
    
    # Broadcast update via WebSocket
    manager = get_connection_manager()
    await manager.broadcast({"type": "expense_updated", "action": "updated", "expense_id": expense_id, "user_id": current_user.user_id})
    # Load user relationship for response
    expense_with_user = db.query(Expense).options(joinedload(Expense.user)).filter(Expense.id == expense_id).first()
    return _serialize_expense(expense_with_user or expense, db)

@router.delete("/{expense_id}")
async def delete_expense(
    expense_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.services.audit_service import AuditService
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if expense.user_id != current_user.user_id and current_user.role == "Employee":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    ExpenseService.delete_expense(db, expense_id)
    
    # Log audit action for expense deletion
    AuditService.log_action(
        db=db,
        user_id=current_user.user_id,
        action="Deleted Expense",
        target_type="Expense",
        target_id=expense_id,
        target_name=f"Expense #{expense_id}",
        status="success"
    )
    
    # Broadcast update via WebSocket
    manager = get_connection_manager()
    await manager.broadcast({"type": "expense_updated", "action": "deleted", "expense_id": expense_id, "user_id": current_user.user_id})
    return {"message": "Expense deleted"}
