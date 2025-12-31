from sqlalchemy.orm import Session, joinedload
from app.models.gst_claim import GSTClaim, GSTRate, GSTStatus
from datetime import datetime, timedelta
from fastapi import HTTPException

UNDO_WINDOW_SECONDS = 10

class GSTService:
    @staticmethod
    def get_gst_rate(db: Session, category: str) -> float:
        rate = db.query(GSTRate).filter(GSTRate.category == category).first()
        return rate.rate if rate else 18.0

    @staticmethod
    def create_claim(db: Session, claim_data, user_id: int):
        gst_rate = claim_data.gst_rate or GSTService.get_gst_rate(db, claim_data.category)
        gst_amount = (
            claim_data.gst_amount
            if getattr(claim_data, "gst_amount", None) is not None
            else claim_data.amount * (gst_rate / 100)
        )

        claim = GSTClaim(
            user_id=user_id,
            vendor=claim_data.vendor,
            amount=claim_data.amount,
            category=claim_data.category,
            gst_rate=gst_rate,
            gst_amount=gst_amount,
            status=GSTStatus.PENDING.value,
            payment_status="unpaid"
        )
        db.add(claim)
        db.commit()
        db.refresh(claim)
        GSTService._create_embedding_for_claim(db, claim)
        return claim

    @staticmethod
    def create_claim_with_file(db: Session, claim_data, user_id: int, bill_url: str = None, ocr_extracted_gst_amount: float = None):
        """Create claim with file upload, using GST rate from claim_data (extracted via OCR)"""
        gst_rate = claim_data.gst_rate
        gst_amount = (
            claim_data.gst_amount
            if getattr(claim_data, "gst_amount", None) is not None
            else claim_data.amount * (gst_rate / 100)
        )

        claim = GSTClaim(
            user_id=user_id,
            vendor=claim_data.vendor,
            amount=claim_data.amount,
            category=claim_data.category,
            gst_rate=gst_rate,
            gst_amount=gst_amount,
            ocr_extracted_gst_amount=ocr_extracted_gst_amount,
            status=GSTStatus.PENDING.value,
            payment_status="unpaid",
            bill_url=bill_url
        )
        db.add(claim)
        db.commit()
        db.refresh(claim)
        GSTService._create_embedding_for_claim(db, claim)
        return claim

    @staticmethod
    def _create_embedding_for_claim(db: Session, claim: GSTClaim) -> None:
        """Ensure a GST claim has an embedding for semantic search."""
        try:
            from app.services.embedding_service import get_embedding_service

            embedding_service = get_embedding_service()
            claim_with_user = (
                db.query(GSTClaim)
                .options(joinedload(GSTClaim.user))
                .filter(GSTClaim.id == claim.id)
                .first()
            )
            if claim_with_user:
                embedding_service.add_gst_claim(claim_with_user, db)
        except Exception as exc:
            print(f"⚠️ Warning: Could not create embedding for GST claim {claim.id}: {exc}")

    @staticmethod
    def get_user_claims(db: Session, user_id: int = None):
        # If user_id is None, return all claims (for real-time multi-user sync)
        # Note: User relationship should be loaded separately in routes for better performance
        query = db.query(GSTClaim)
        if user_id is not None:
            query = query.filter(GSTClaim.user_id == user_id)
        return query.order_by(GSTClaim.created_at.desc()).all()

    @staticmethod
    def get_pending_claims(db: Session):
        return db.query(GSTClaim).filter(
            GSTClaim.status == GSTStatus.PENDING.value
        ).all()

    @staticmethod
    def get_approved_unpaid_claims(db: Session, month: int = None, year: int = None, user_id: int = None):
        query = db.query(GSTClaim).filter(
            GSTClaim.status == GSTStatus.APPROVED.value,
            GSTClaim.payment_status == "unpaid"
        )
        if user_id is not None:
            query = query.filter(GSTClaim.user_id == user_id)
        return query.all()

    @staticmethod
    def approve_claim(db: Session, claim_id: int, approved_by_id: int, notes: str = None):
        claim = db.query(GSTClaim).filter(GSTClaim.id == claim_id).first()
        if claim:
            claim.previous_status = claim.status if claim.status else GSTStatus.PENDING.value
            claim.last_status_change = datetime.utcnow()
            claim.status = GSTStatus.APPROVED.value
            claim.approved_by_id = approved_by_id
            claim.approval_notes = notes
            db.commit()
            db.refresh(claim)
        return claim

    @staticmethod
    def reject_claim(db: Session, claim_id: int, approved_by_id: int, notes: str = None):
        claim = db.query(GSTClaim).filter(GSTClaim.id == claim_id).first()
        if claim:
            claim.previous_status = claim.status if claim.status else GSTStatus.PENDING.value
            claim.last_status_change = datetime.utcnow()
            claim.status = GSTStatus.REJECTED.value
            claim.approved_by_id = approved_by_id
            claim.approval_notes = notes
            db.commit()
            db.refresh(claim)
        return claim

    @staticmethod
    def mark_as_paid(db: Session, claim_id: int):
        claim = db.query(GSTClaim).filter(GSTClaim.id == claim_id).first()
        if claim:
            claim.previous_status = claim.status if claim.status else GSTStatus.PENDING.value
            claim.last_status_change = datetime.utcnow()
            claim.status = GSTStatus.PAID.value
            claim.payment_status = "paid"
            db.commit()
            db.refresh(claim)
        return claim

    @staticmethod
    def toggle_payment_status(db: Session, claim_id: int, payment_comment: str = None):
        claim = db.query(GSTClaim).filter(GSTClaim.id == claim_id).first()
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        
        # Toggle payment status
        if claim.payment_status == "paid":
            claim.payment_status = "unpaid"
            claim.payment_comment = None  # Clear comment when marking as unpaid
        else:
            claim.payment_status = "paid"
            claim.payment_comment = payment_comment  # Save comment when marking as paid
        
        db.commit()
        db.refresh(claim)
        return claim

    @staticmethod
    def update_claim(db: Session, claim_id: int, claim_data):
        claim = db.query(GSTClaim).filter(GSTClaim.id == claim_id).first()
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        
        if claim_data.vendor:
            claim.vendor = claim_data.vendor
        if claim_data.amount is not None:
            claim.amount = claim_data.amount
        if claim_data.category:
            claim.category = claim_data.category
        if claim_data.gst_rate is not None:
            claim.gst_rate = claim_data.gst_rate
        
        # Recalculate GST amount
        claim.gst_amount = claim.amount * (claim.gst_rate / 100)
        
        db.commit()
        db.refresh(claim)
        return claim

    @staticmethod
    def delete_claim(db: Session, claim_id: int):
        claim = db.query(GSTClaim).filter(GSTClaim.id == claim_id).first()
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        
        db.delete(claim)
        db.commit()
        return True

    @staticmethod
    def undo_action(db: Session, claim_id: int, previous_status: str):
        claim = db.query(GSTClaim).filter(GSTClaim.id == claim_id).first()
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        
        # Check if undo window is still valid
        if claim.last_status_change:
            time_elapsed = datetime.utcnow() - claim.last_status_change
            if time_elapsed.total_seconds() > UNDO_WINDOW_SECONDS:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Undo window expired. Only {UNDO_WINDOW_SECONDS} seconds allowed."
                )
        
        # Restore previous status
        claim.status = previous_status if previous_status in [s.value for s in GSTStatus] else GSTStatus.PENDING.value
        if previous_status == GSTStatus.APPROVED.value:
            claim.payment_status = "unpaid"
        elif previous_status == GSTStatus.PENDING.value:
            claim.payment_status = "unpaid"
        claim.previous_status = None
        claim.last_status_change = None
        db.commit()
        db.refresh(claim)
        return claim
