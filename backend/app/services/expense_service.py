from sqlalchemy.orm import Session
from sqlalchemy import extract
from app.models.expense import Expense
from datetime import datetime, date
from app.services.embedding_service import get_embedding_service

class ExpenseService:
    @staticmethod
    def create_expense(db: Session, expense_data, user_id: int, embedding_service=None):
        expense = Expense(
            user_id=user_id,
            date=expense_data.date,
            amount=expense_data.amount,
            label=expense_data.label,
            item=expense_data.item,
            category=expense_data.category,
            description=expense_data.description,
            gst_eligible=expense_data.gst_eligible,
            gst_amount=expense_data.amount * 0.18 if expense_data.gst_eligible else 0
        )
        db.add(expense)
        db.commit()
        db.refresh(expense)

        if embedding_service:
            embedding_service.add_expense(expense, db)

        return expense

    @staticmethod
    def get_expenses(db: Session, user_id: int = None, month: int = None, year: int = None):
        # If user_id is None, return all expenses (for real-time multi-user sync)
        query = db.query(Expense)
        if user_id is not None:
            query = query.filter(Expense.user_id == user_id)

        if month and year:
            query = query.filter(
                extract('month', Expense.date) == month,
                extract('year', Expense.date) == year
            )

        return query.order_by(Expense.date.desc()).all()

    @staticmethod
    def get_summary(db: Session, user_id: int = None, month: int = None, year: int = None):
        # If user_id is None, return summary for all expenses (for real-time multi-user sync)
        expenses = ExpenseService.get_expenses(db, user_id, month, year)

        total = sum(e.amount for e in expenses)
        pending = sum(e.amount for e in expenses if e.status == "pending")
        approved = sum(e.amount for e in expenses if e.status == "approved")
        gst_total = sum(e.gst_amount for e in expenses if e.gst_eligible)

        return {
            "total_expenses": total,
            "pending_expenses": pending,
            "approved_expenses": approved,
            "total_gst_due": gst_total,
            "expense_count": len(expenses)
        }

    @staticmethod
    def update_status(db: Session, expense_id: int, status: str):
        expense = db.query(Expense).filter(Expense.id == expense_id).first()
        if expense:
            expense.status = status
            db.commit()
            db.refresh(expense)
        return expense

    @staticmethod
    def delete_expense(db: Session, expense_id: int):
        expense = db.query(Expense).filter(Expense.id == expense_id).first()
        if expense:
            db.delete(expense)
            db.commit()
        return expense
