from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog
from app.models.user import User
from datetime import datetime
from app.routes.websocket import get_connection_manager
import asyncio

class AuditService:
    @staticmethod
    def log_action(
        db: Session,
        user_id: int,
        action: str,
        target_type: str = None,
        target_id: int = None,
        target_name: str = None,
        status: str = "success",
        details: str = None,
        ip_address: str = None
    ):
        """Log an action to the audit log"""
        try:
            # Get username for quick access
            user = db.query(User).filter(User.id == user_id).first()
            username = user.username if user else f"User_{user_id}"
            
            audit_log = AuditLog(
                action=action,
                user_id=user_id,
                username=username,
                target_type=target_type,
                target_id=target_id,
                target_name=target_name,
                status=status,
                details=details,
                ip_address=ip_address,
                created_at=datetime.utcnow()
            )
            db.add(audit_log)
            db.commit()
            AuditService._notify_websocket(audit_log)
            return audit_log
        except Exception as e:
            db.rollback()
            # Don't fail the main operation if audit logging fails
            print(f"Failed to log audit action: {e}")
            return None
    
    @staticmethod
    def get_audit_logs(db: Session, limit: int = 100, offset: int = 0):
        """Get audit logs ordered by most recent first"""
        return db.query(AuditLog).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    
    @staticmethod
    def get_audit_logs_count(db: Session):
        """Get total count of audit logs"""
        return db.query(AuditLog).count()

    @staticmethod
    def _notify_websocket(log_entry: AuditLog):
        """Trigger websocket update for audit subscribers."""
        try:
            manager = get_connection_manager()
            if not manager.active_connections:
                return

            payload = {
                "type": "audit_log_updated",
                "log": {
                    "id": log_entry.id,
                    "action": log_entry.action,
                    "user": log_entry.username,
                    "user_id": log_entry.user_id,
                    "target": log_entry.target_name or (
                        f"{log_entry.target_type} #{log_entry.target_id}"
                        if log_entry.target_type and log_entry.target_id
                        else "N/A"
                    ),
                    "target_type": log_entry.target_type,
                    "target_id": log_entry.target_id,
                    "timestamp": log_entry.created_at.isoformat() if log_entry.created_at else None,
                    "status": log_entry.status,
                    "details": log_entry.details,
                }
            }

            async def _broadcast():
                await manager.broadcast(payload)

            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            if loop and loop.is_running():
                loop.create_task(_broadcast())
            else:
                asyncio.run(_broadcast())
        except Exception as exc:
            print(f"Failed to broadcast audit log update: {exc}")

