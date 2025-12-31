from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import get_settings
from app.database import engine, Base
from app.routes import auth, expenses, gst, search, dashboard, admin, websocket, documents, expenses_manager, employee_assets
from app.services.embedding_service import get_embedding_service
from app.utils.logger import setup_logging
# Import models to ensure they're registered with Base before create_all
from app.models import expenses_manager as _  # noqa: F401
from app.models import employee_asset as _  # noqa: F401
import os

# Setup logging
logger = setup_logging()

Base.metadata.create_all(bind=engine)
settings = get_settings()

app = FastAPI(
    title="Infomanav Office Expense System",
    description="Production-Ready AI-Powered Expense Management",
    version="1.0.0"
)

# CORS configuration - environment-based
cors_origins = os.getenv("CORS_ORIGINS", "*").split(",") if os.getenv("CORS_ORIGINS") else ["*"]
if cors_origins == ["*"] and os.getenv("ENVIRONMENT") == "production":
    # In production, restrict CORS to specific domains
    logger.warning("⚠️ CORS is set to '*' in production. Consider setting CORS_ORIGINS environment variable.")
    
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize embedding service and chatbot on startup
@app.on_event("startup")
async def startup_event():
    from app.database import SessionLocal
    from app.services.chatbot_service import ChatbotService
    logger.info("Starting application...")
    
    # Initialize embedding service
    embedding_service = get_embedding_service()
    db = SessionLocal()
    try:
        embedding_service.load_from_db(db)
        logger.info("✅ Embedding Service Ready")
        print("✅ Embedding Service Ready")
    except Exception as e:
        logger.error(f"⚠️ Warning: Could not load embeddings: {e}", exc_info=True)
        print(f"⚠️ Warning: Could not load embeddings: {e}")
    finally:
        db.close()
    
    # Initialize chatbot service (in background to not block startup)
    try:
        chatbot_service = ChatbotService.get_instance()
        # Initialize model asynchronously (non-blocking)
        import threading
        def init_chatbot():
            try:
                # Get HuggingFace token from environment or settings (for gated models)
                hf_token = (
                    os.getenv("HUGGINGFACE_TOKEN") 
                    or os.getenv("HF_TOKEN") 
                    or settings.HUGGINGFACE_TOKEN 
                    or settings.HF_TOKEN
                )
                
                # Initialize with token if available (for gated models like Gemma)
                # Otherwise it will try non-gated models automatically (TinyLlama, DialoGPT, etc.)
                chatbot_service.initialize_model(token=hf_token)
                
                if chatbot_service._initialized:
                    logger.info(f"✅ Chatbot model '{chatbot_service._model_name}' loaded successfully")
                    print(f"✅ Chatbot model '{chatbot_service._model_name}' loaded successfully")
                else:
                    logger.info("Chatbot will use enhanced fallback responses")
                    print("ℹ️ Chatbot will use enhanced fallback responses")
            except Exception as e:
                logger.warning(f"Chatbot initialization error: {e}. Continuing without chatbot.")
                print(f"⚠️ Warning: Chatbot initialization error: {e}")
        
        chatbot_thread = threading.Thread(target=init_chatbot, daemon=True)
        chatbot_thread.start()
        logger.info("🔄 Chatbot model loading in background...")
        print("🔄 Chatbot model loading in background...")
    except Exception as e:
        logger.warning(f"Could not initialize chatbot service: {e}")
        print(f"⚠️ Warning: Could not initialize chatbot service: {e}")

# Include routers
app.include_router(auth.router)
app.include_router(expenses.router)
app.include_router(gst.router)
app.include_router(search.router)
app.include_router(dashboard.router)
app.include_router(admin.router)
app.include_router(websocket.router)
app.include_router(documents.router)
app.include_router(expenses_manager.router)
app.include_router(employee_assets.router)

# Serve uploaded files
os.makedirs("uploads/gst_bills", exist_ok=True)
os.makedirs("uploads/employee_assets", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.get("/")
async def root():
    return {"message": "Infomanav Office Expense System Production Ready", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
