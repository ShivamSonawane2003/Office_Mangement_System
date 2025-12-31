from sqlalchemy.orm import Session
from app.models.user import User, Role
from app.schemas.user import UserCreate, UserLogin
from app.security import hash_password, verify_password, create_access_token
from datetime import timedelta
from app.config import get_settings

settings = get_settings()

class AuthService:
    @staticmethod
    def register_user(db: Session, user_data: UserCreate) -> User:
        existing = db.query(User).filter(User.username == user_data.username).first()
        if existing:
            raise ValueError("Username already exists")

        user = User(
            username=user_data.username,
            email=user_data.email,
            password_hash=hash_password(user_data.password),
            role_id=3,
            full_name=user_data.full_name,
            department=user_data.department
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def authenticate_user(db: Session, login_data: UserLogin) -> User:
        user = db.query(User).filter(User.username == login_data.username).first()
        if not user or not verify_password(login_data.password, user.password_hash):
            return None
        return user

    @staticmethod
    def create_token(user: User) -> str:
        token_data = {
            "user_id": user.id,
            "username": user.username,
            "role": user.role.name
        }
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        return create_access_token(token_data, access_token_expires)

    @staticmethod
    def get_user_by_id(db: Session, user_id: int):
        return db.query(User).filter(User.id == user_id).first()
