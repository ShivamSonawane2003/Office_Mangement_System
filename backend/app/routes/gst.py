from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, Body
from fastapi.responses import FileResponse
import mimetypes
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.gst_claim import GSTClaim
from app.schemas.gst_claim import GSTClaimCreate, GSTClaimUpdate, GSTClaimApprove, GSTClaimResponse, GSTSummary
from app.services.gst_service import GSTService
from app.security import get_current_user, TokenData, require_role
from app.utils.logger import get_logger
from app.utils.ocr_service import extract_gst_rate_from_image, extract_gst_amount_from_image
from app.routes.websocket import get_connection_manager
import os
import shutil
from datetime import datetime

logger = get_logger(__name__)
router = APIRouter(prefix="/api/gst", tags=["gst"])

def _build_bill_api_url(claim_id: int) -> str:
    return f"/api/gst/claims/{claim_id}/bill"


def _serialize_claim(claim: GSTClaim, db: Session = None) -> GSTClaimResponse:
    response = GSTClaimResponse.model_validate(claim)
    response.bill_url = _build_bill_api_url(claim.id) if claim.bill_url else None
    # Include user information if available
    if hasattr(claim, 'user') and claim.user is not None:
        response.username = getattr(claim.user, 'username', None)
        response.full_name = getattr(claim.user, 'full_name', None)
    elif db is not None:
        # If user relationship not loaded, fetch it from database
        from app.models.user import User
        user = db.query(User).filter(User.id == claim.user_id).first()
        if user:
            response.username = user.username
            response.full_name = user.full_name
    
    # Calculate verification status: compare user-provided GST amount with OCR extracted amount
    # Access the attribute directly from the SQLAlchemy model
    # Note: OCR extraction only happens when adding new bills, not when viewing existing ones
    ocr_amount = getattr(claim, 'ocr_extracted_gst_amount', None)
    
    # Calculate verification status only if OCR data exists (extracted when bill was added)
    if ocr_amount is not None:
        # Allow tolerance for floating point comparison and rounding differences
        # Use 1% tolerance or minimum ₹1, whichever is larger (max ₹10)
        tolerance = max(0.01, min(claim.gst_amount * 0.01, 10.0))
        difference = abs(claim.gst_amount - ocr_amount)
        response.is_verified = difference <= tolerance
        logger.info(f"Verification: User amount=₹{claim.gst_amount}, OCR amount=₹{ocr_amount}, difference=₹{difference:.2f}, tolerance=₹{tolerance:.2f}, verified={response.is_verified}")
    else:
        response.is_verified = None  # No OCR data available (extraction failed or bill added before OCR feature)
    return response


@router.post("/claims", response_model=GSTClaimResponse)
async def create_claim(
    vendor: str = Form(...),
    amount: float = Form(...),
    bill_file: UploadFile = File(...),
    gst_rate: Optional[float] = Form(None),
    gst_amount: Optional[float] = Form(None),
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        logger.info(f"Creating GST claim for user {current_user.user_id}, vendor: {vendor}")
        
        # Read file content
        file_content = await bill_file.read()
        
        # Determine GST rate (prefer user input, fallback to OCR/default)
        if gst_rate is not None:
            logger.info(f"Using user provided GST rate {gst_rate}%")
        else:
            gst_rate = extract_gst_rate_from_image(file_content)
            if gst_rate is None:
                gst_rate = 18.0  # Default to 18% if OCR fails
                logger.warning("Using default GST rate 18% for claim")
            else:
                logger.info(f"Extracted GST rate {gst_rate}% from bill image")
        
        # Extract GST amount from OCR for verification
        ocr_extracted_gst_amount = extract_gst_amount_from_image(file_content)
        if ocr_extracted_gst_amount is not None:
            logger.info(f"OCR extracted GST amount: ₹{ocr_extracted_gst_amount}")
        else:
            logger.info("Could not extract GST amount from OCR")
        
        if gst_amount is not None:
            logger.info(f"Using user provided GST amount: ₹{gst_amount}")
        else:
            gst_amount = amount * (gst_rate / 100)
        
        # Save uploaded file
        upload_dir = "uploads/gst_bills"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(bill_file.filename)[1] if bill_file.filename else ".jpg"
        filename = f"gst_bill_{current_user.user_id}_{timestamp}{file_extension}"
        file_path = os.path.join(upload_dir, filename)
        
        # Save file
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)
        
        bill_url = f"/uploads/gst_bills/{filename}"
        
        # Create claim data
        claim_data = GSTClaimCreate(
            vendor=vendor,
            amount=amount,
            category="other",  # Default category since we removed it from frontend
            gst_rate=gst_rate,
            gst_amount=gst_amount
        )
        
        claim = GSTService.create_claim_with_file(db, claim_data, user_id=current_user.user_id, bill_url=bill_url, ocr_extracted_gst_amount=ocr_extracted_gst_amount)
        logger.info(f"GST claim {claim.id} created successfully")
        
        # Log audit action for GST claim creation
        from app.services.audit_service import AuditService
        AuditService.log_action(
            db=db,
            user_id=current_user.user_id,
            action="Created GST Claim",
            target_type="GST Claim",
            target_id=claim.id,
            target_name=f"GST Claim #{claim.id}",
            status="success",
            details=f"Vendor: {vendor}, Amount: ₹{amount}, GST Amount: ₹{gst_amount}"
        )
        
        # Broadcast update via WebSocket
        manager = get_connection_manager()
        await manager.broadcast({"type": "gst_updated", "action": "created", "claim_id": claim.id})
        # Load user information for the response
        from sqlalchemy.orm import joinedload
        claim_with_user = db.query(GSTClaim).options(joinedload(GSTClaim.user)).filter(GSTClaim.id == claim.id).first()
        return _serialize_claim(claim_with_user or claim, db)
    except Exception as e:
        logger.error(f"Error creating GST claim: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error creating GST claim: {str(e)}")

@router.get("/claims", response_model=List[GSTClaimResponse])
async def get_claims(
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # Filter by user_id if Employee, show all if Admin/Super Admin
        user_id = current_user.user_id if current_user.role == "Employee" else None
        logger.info(f"Fetching GST claims for user_id={user_id}, role={current_user.role}")
        # Load user relationship to include user information
        from sqlalchemy.orm import joinedload
        claims_query = db.query(GSTClaim).options(joinedload(GSTClaim.user))
        if user_id is not None:
            claims_query = claims_query.filter(GSTClaim.user_id == user_id)
        claims = claims_query.order_by(GSTClaim.created_at.desc()).all()
        logger.info(f"Found {len(claims)} GST claims")
        return [_serialize_claim(claim, db) for claim in claims]
    except Exception as e:
        logger.error(f"Error fetching GST claims: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error fetching GST claims: {str(e)}")

@router.get("/pending-claims")
async def get_pending_claims(
    current_user: TokenData = Depends(require_role("Admin", "Super Admin")),
    db: Session = Depends(get_db)
):
    claims = GSTService.get_pending_claims(db)
    return claims

@router.get("/approved-unpaid")
async def get_approved_unpaid(
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Filter by user_id if Employee, show all if Admin/Super Admin
    user_id = current_user.user_id if current_user.role == "Employee" else None
    # Get all unpaid claims (not just approved) with user information
    from sqlalchemy.orm import joinedload
    claims_query = db.query(GSTClaim).options(joinedload(GSTClaim.user)).filter(
        GSTClaim.payment_status == "unpaid"
    )
    if user_id is not None:
        claims_query = claims_query.filter(GSTClaim.user_id == user_id)
    claims = claims_query.order_by(GSTClaim.created_at.desc()).all()
    total = sum(c.gst_amount for c in claims)
    return {"claims": [_serialize_claim(claim, db) for claim in claims], "total_pending_payments": total}

# Commented out - Approve/Reject functionality disabled
# @router.put("/claims/{claim_id}/approve")
# async def approve_claim(
#     claim_id: int, 
#     data: GSTClaimApprove,
#     current_user: TokenData = Depends(require_role("Admin", "Super Admin")),
#     db: Session = Depends(get_db)
# ):
#     from app.services.audit_service import AuditService
#     from fastapi import Request
#     claim = GSTService.approve_claim(db, claim_id, approved_by_id=current_user.user_id, notes=data.approval_notes)
#     if not claim:
#         raise HTTPException(status_code=404, detail="Claim not found")
#     # Log audit action
#     AuditService.log_action(
#         db=db,
#         user_id=current_user.user_id,
#         action="Approved GST Claim",
#         target_type="GST Claim",
#         target_id=claim_id,
#         target_name=f"GST Claim #{claim_id}",
#         status="approved",
#         details=data.approval_notes
#     )
#     # Broadcast update via WebSocket
#     manager = get_connection_manager()
#     await manager.broadcast({"type": "gst_updated", "action": "approved", "claim_id": claim_id})
#     return claim

# @router.put("/claims/{claim_id}/reject")
# async def reject_claim(
#     claim_id: int, 
#     data: GSTClaimApprove,
#     current_user: TokenData = Depends(require_role("Admin", "Super Admin")),
#     db: Session = Depends(get_db)
# ):
#     from app.services.audit_service import AuditService
#     claim = GSTService.reject_claim(db, claim_id, approved_by_id=current_user.user_id, notes=data.approval_notes)
#     if not claim:
#         raise HTTPException(status_code=404, detail="Claim not found")
#     # Log audit action
#     AuditService.log_action(
#         db=db,
#         user_id=current_user.user_id,
#         action="Rejected GST Claim",
#         target_type="GST Claim",
#         target_id=claim_id,
#         target_name=f"GST Claim #{claim_id}",
#         status="rejected",
#         details=data.approval_notes
#     )
#     # Broadcast update via WebSocket
#     manager = get_connection_manager()
#     await manager.broadcast({"type": "gst_updated", "action": "rejected", "claim_id": claim_id})
#     return claim

@router.put("/claims/{claim_id}/pay")
async def mark_as_paid(
    claim_id: int,
    current_user: TokenData = Depends(require_role("Admin", "Super Admin")),
    db: Session = Depends(get_db)
):
    from app.services.audit_service import AuditService
    claim = GSTService.mark_as_paid(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    # Log audit action
    AuditService.log_action(
        db=db,
        user_id=current_user.user_id,
        action="Marked GST Claim as Paid",
        target_type="GST Claim",
        target_id=claim_id,
        target_name=f"GST Claim #{claim_id}",
        status="paid"
    )
    return claim

@router.put("/claims/{claim_id}/toggle-payment", response_model=GSTClaimResponse)
async def toggle_payment_status(
    claim_id: int,
    request: Request,
    payment_data: Optional[dict] = Body(None),
    current_user: TokenData = Depends(require_role("Admin", "Super Admin")),
    db: Session = Depends(get_db)
):
    try:
        logger.info(f"Toggling payment status for claim {claim_id} by user {current_user.user_id}")
        # Get the claim before toggling to know the old status
        old_claim = db.query(GSTClaim).filter(GSTClaim.id == claim_id).first()
        if not old_claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        
        old_status = old_claim.payment_status
        payment_comment = payment_data.get("payment_comment") if payment_data else None
        
        # Toggle payment status using service method
        claim = GSTService.toggle_payment_status(db, claim_id, payment_comment)
        new_status = claim.payment_status
        
        logger.info(f"Payment status toggled successfully for claim {claim_id} from {old_status} to {new_status}")
        
        # Log audit action - AuditService handles its own commit (don't include comment in audit log)
        from app.services.audit_service import AuditService
        from app.models.audit_log import AuditLog
        try:
            ip_address = request.client.host if request and hasattr(request, 'client') and request.client else None
            action_text = f"Changed GST Claim Payment Status from {old_status} to {new_status}"
            details_text = f"Payment status changed from {old_status} to {new_status}"
            audit_log = AuditService.log_action(
                db=db,
                user_id=current_user.user_id,
                action=action_text,
                target_type="GST Claim",
                target_id=claim_id,
                target_name=f"GST Claim #{claim_id}",
                status="success",
                details=details_text,
                ip_address=ip_address
            )
            if audit_log:
                logger.info(f"Audit log created: id={audit_log.id}, action='{action_text}', target_type='{audit_log.target_type}', target_id={audit_log.target_id}")
                # Verify the audit log was actually saved to the database
                db.refresh(audit_log)
                verify_log = db.query(AuditLog).filter(AuditLog.id == audit_log.id).first()
                if verify_log:
                    logger.info(f"Verified audit log exists in database: id={verify_log.id}, target_type='{verify_log.target_type}'")
                else:
                    logger.error(f"Audit log was created but not found in database: id={audit_log.id}")
            else:
                logger.error(f"AuditService.log_action returned None for payment status change on claim {claim_id}")
        except Exception as audit_error:
            logger.error(f"Exception creating audit log for payment status change: {audit_error}", exc_info=True)
            # Don't fail the main operation if audit logging fails
        
        # Broadcast update via WebSocket
        manager = get_connection_manager()
        await manager.broadcast({"type": "gst_updated", "action": "payment_toggled", "claim_id": claim_id})
        # Load user information for the response
        from sqlalchemy.orm import joinedload
        claim_with_user = db.query(GSTClaim).options(joinedload(GSTClaim.user)).filter(GSTClaim.id == claim_id).first()
        return _serialize_claim(claim_with_user or claim, db)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling payment status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error toggling payment status: {str(e)}")

@router.put("/claims/{claim_id}", response_model=GSTClaimResponse)
async def update_claim(
    claim_id: int,
    vendor: Optional[str] = Form(None),
    amount: Optional[float] = Form(None),
    gst_rate: Optional[float] = Form(None),
    gst_amount: Optional[float] = Form(None),
    bill_file: Optional[UploadFile] = File(None),
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        claim = db.query(GSTClaim).filter(GSTClaim.id == claim_id).first()
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        if claim.user_id != current_user.user_id and current_user.role == "Employee":
            raise HTTPException(status_code=403, detail="Unauthorized")
        
        logger.info(f"Updating GST claim {claim_id} by user {current_user.user_id}")
        
        # Update fields
        if vendor:
            claim.vendor = vendor
        if amount is not None:
            claim.amount = amount
        if gst_rate is not None:
            claim.gst_rate = gst_rate
        
        # Handle file upload if provided
        if bill_file:
            file_content = await bill_file.read()
            
            # Extract GST rate from new bill image
            gst_rate = extract_gst_rate_from_image(file_content)
            if gst_rate is not None:
                claim.gst_rate = gst_rate
                logger.info(f"Updated GST rate to {gst_rate}% from new bill image")
            
            # Save new file
            upload_dir = "uploads/gst_bills"
            os.makedirs(upload_dir, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            file_extension = os.path.splitext(bill_file.filename)[1] if bill_file.filename else ".jpg"
            filename = f"gst_bill_{current_user.user_id}_{timestamp}{file_extension}"
            file_path = os.path.join(upload_dir, filename)
            
            with open(file_path, "wb") as buffer:
                buffer.write(file_content)
            
            claim.bill_url = f"/uploads/gst_bills/{filename}"
        
        # Recalculate GST amount unless the user provided one explicitly
        if gst_amount is not None:
            claim.gst_amount = gst_amount
        else:
            claim.gst_amount = claim.amount * (claim.gst_rate / 100)
        
        db.commit()
        db.refresh(claim)
        
        logger.info(f"GST claim {claim_id} updated successfully")
        
        # Log audit action for GST claim edit
        from app.services.audit_service import AuditService
        AuditService.log_action(
            db=db,
            user_id=current_user.user_id,
            action="Edited GST Claim",
            target_type="GST Claim",
            target_id=claim_id,
            target_name=f"GST Claim #{claim_id}",
            status="success"
        )
        
        # Broadcast update via WebSocket
        manager = get_connection_manager()
        await manager.broadcast({"type": "gst_updated", "action": "updated", "claim_id": claim_id})
        # Load user information for the response
        from sqlalchemy.orm import joinedload
        claim_with_user = db.query(GSTClaim).options(joinedload(GSTClaim.user)).filter(GSTClaim.id == claim_id).first()
        return _serialize_claim(claim_with_user or claim, db)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating GST claim: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error updating GST claim: {str(e)}")


@router.get("/claims/{claim_id}/bill")
async def download_claim_bill(
    claim_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    claim = db.query(GSTClaim).filter(GSTClaim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.role == "Employee" and claim.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Unauthorized to access this GST bill")

    if not claim.bill_url:
        raise HTTPException(status_code=404, detail="No GST bill uploaded for this claim")

    bill_path = claim.bill_url.lstrip("/")
    if not os.path.isabs(bill_path):
        bill_path = os.path.join(os.getcwd(), bill_path)

    if not os.path.exists(bill_path):
        raise HTTPException(status_code=404, detail="GST bill file not found on server")

    media_type = mimetypes.guess_type(bill_path)[0] or "application/octet-stream"
    return FileResponse(
        path=bill_path,
        media_type=media_type,
        filename=os.path.basename(bill_path)
    )

@router.delete("/claims/{claim_id}")
async def delete_claim(
    claim_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        claim = db.query(GSTClaim).filter(GSTClaim.id == claim_id).first()
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        if claim.user_id != current_user.user_id and current_user.role == "Employee":
            raise HTTPException(status_code=403, detail="Unauthorized")
        
        logger.info(f"Deleting GST claim {claim_id} by user {current_user.user_id}")
        GSTService.delete_claim(db, claim_id)
        logger.info(f"GST claim {claim_id} deleted successfully")
        
        # Log audit action for GST claim deletion
        from app.services.audit_service import AuditService
        AuditService.log_action(
            db=db,
            user_id=current_user.user_id,
            action="Deleted GST Claim",
            target_type="GST Claim",
            target_id=claim_id,
            target_name=f"GST Claim #{claim_id}",
            status="success"
        )
        
        # Broadcast update via WebSocket
        manager = get_connection_manager()
        await manager.broadcast({"type": "gst_updated", "action": "deleted", "claim_id": claim_id})
        return {"message": "GST claim deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting GST claim: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error deleting GST claim: {str(e)}")

@router.put("/claims/{claim_id}/undo")
async def undo_action(
    claim_id: int, 
    previous_status: str,
    current_user: TokenData = Depends(require_role("Admin", "Super Admin")),
    db: Session = Depends(get_db)
):
    claim = GSTService.undo_action(db, claim_id, previous_status)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return claim
