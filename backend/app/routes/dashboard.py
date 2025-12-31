from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.expense_service import ExpenseService
from app.services.gst_service import GSTService
from app.security import get_current_user, TokenData
from app.utils.logger import get_logger
from datetime import datetime

logger = get_logger(__name__)
router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/")
async def get_dashboard(
    month: int = None, 
    year: int = None,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        if not month:
            month = datetime.now().month
        if not year:
            year = datetime.now().year

        # Filter by user_id if Employee, show all if Admin/Super Admin
        user_id = current_user.user_id if current_user.role == "Employee" else None
        logger.info(f"Dashboard request - user_id={user_id}, role={current_user.role}, month={month}, year={year}")

        expense_summary = ExpenseService.get_summary(db, user_id=user_id, month=month, year=year)
        logger.info(f"Expense summary: {expense_summary}")

        # For GST claims, filter by user_id if Employee
        from app.models.gst_claim import GSTClaim
        from sqlalchemy import extract
        gst_claims_query = db.query(GSTClaim)
        if user_id is not None:
            gst_claims_query = gst_claims_query.filter(GSTClaim.user_id == user_id)
        if month and year:
            gst_claims_query = gst_claims_query.filter(
                extract('month', GSTClaim.created_at) == month,
                extract('year', GSTClaim.created_at) == year
            )
        all_gst_claims = gst_claims_query.all()
        
        # Get all unpaid GST claims (not just approved) with user information
        from sqlalchemy.orm import joinedload
        unpaid_claims_query = db.query(GSTClaim).options(joinedload(GSTClaim.user)).filter(
            GSTClaim.payment_status == "unpaid"
        )
        if user_id is not None:
            unpaid_claims_query = unpaid_claims_query.filter(GSTClaim.user_id == user_id)
        if month and year:
            unpaid_claims_query = unpaid_claims_query.filter(
                extract('month', GSTClaim.created_at) == month,
                extract('year', GSTClaim.created_at) == year
            )
        unpaid_claims = unpaid_claims_query.all()
        pending_payments_amount = sum(c.gst_amount for c in unpaid_claims)
        total_gst_due = sum(claim.gst_amount for claim in all_gst_claims)

        logger.info(f"GST claims - all: {len(all_gst_claims)}, unpaid: {len(unpaid_claims)}, pending_payments: {pending_payments_amount}, total_gst_due: {total_gst_due}")

        result = {
            "total_expenses": expense_summary["total_expenses"],
            "pending_expenses": expense_summary["pending_expenses"],
            "approved_expenses": expense_summary["approved_expenses"],
            "pending_payments": pending_payments_amount,
            "total_gst_due": total_gst_due
        }
        logger.info(f"Dashboard response: {result}")
        return result
    except Exception as e:
        logger.error(f"Error in dashboard endpoint: {e}", exc_info=True)
        raise

@router.get("/charts")
async def get_chart_data(
    month: int, 
    year: int,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.models.expense import Expense
    from sqlalchemy import extract
    
    # Filter by user_id if Employee, show all if Admin/Super Admin
    user_id = current_user.user_id if current_user.role == "Employee" else None
    expenses = ExpenseService.get_expenses(db, user_id=user_id, month=month, year=year)
    expense_summary = ExpenseService.get_summary(db, user_id=user_id, month=month, year=year)

    # Category breakdown
    categories = {}
    for expense in expenses:
        if expense.category not in categories:
            categories[expense.category] = 0
        categories[expense.category] += expense.amount

    # Daily totals
    daily_totals = {}
    for expense in expenses:
        day = expense.date.strftime("%Y-%m-%d")
        if day not in daily_totals:
            daily_totals[day] = 0
        daily_totals[day] += expense.amount

    # Status breakdown
    status_breakdown = {
        "pending": 0,
        "approved": 0,
        "rejected": 0
    }
    for expense in expenses:
        status_breakdown[expense.status] = status_breakdown.get(expense.status, 0) + expense.amount

    return {
        "categories": categories,
        "daily_total": daily_totals,
        "status_breakdown": status_breakdown,
        "pending_vs_approved": {
            "pending": expense_summary["pending_expenses"],
            "approved": expense_summary["approved_expenses"]
        }
    }
