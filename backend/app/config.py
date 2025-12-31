import os
from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "mysql+pymysql://root:shivam2003@localhost:3306/office_expense_dbV2")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    APP_NAME: str = "Infomanav Office Expense System"
    DEBUG: bool = False
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384
    HUGGINGFACE_TOKEN: str | None = None  # Optional HuggingFace token for gated models
    HF_TOKEN: str | None = None  # Alternative token name

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # Ignore extra environment variables

@lru_cache()
def get_settings():
    return Settings()
