import logging
import threading
from typing import Optional

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import settings
from app.database import init_db, SessionLocal, get_db
from app.models import Category, Bank, User
from app.ai import ensure_models_exist
from app.telemetry import backend_telemetry
from app.middleware import RequestTrackingMiddleware
from app.routers import all_routers
from app.services.tasks import get_task_status

# Re-exports for backward compatibility with external scripts/tests
from app.dependencies import (
    get_current_user,
    is_dev_user,
    get_password_hash,
    verify_password,
    create_access_token,
    generate_transaction_fingerprint,
    pwd_context,
    oauth2_scheme,
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from app.routers.auth import UserCreate

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="WiseRaman Local AI Personal Finance Analyzer",
    description="Enterprise-grade Local AI Personal Finance Platform API",
    version="1.0.0",
)

# Exception Handlers broadcasting errors to Live Backend Telemetry
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    backend_telemetry.log(f"HTTP {exc.status_code}: {exc.detail}", level="ERROR", meta={"path": request.url.path})
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = str(exc) or "Internal Server Error"
    logger.error(f"Global exception on {request.url.path}: {error_msg}", exc_info=True)
    backend_telemetry.log(f"Backend Error [{request.url.path}]: {error_msg}", level="ERROR", meta={"path": request.url.path})
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# 1. Custom Request Tracking Middleware (Correlation ID & Processing Time headers)
app.add_middleware(RequestTrackingMiddleware)

# 2. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup Lifecycle
@app.on_event("startup")
def startup_event():
    logger.info("Initializing database extensions and schema...")
    init_db()
    
    # Initialize Dev Account
    db = SessionLocal()
    try:
        dev_user = db.query(User).filter(User.email == "dev@test.com").first()
        if not dev_user:
            dev_user = User(
                email="dev@test.com",
                name="Developer",
                password_hash=pwd_context.hash("dev@2026")
            )
            db.add(dev_user)
            db.commit()
            logger.info("Dev account initialized (dev@test.com / dev@2026)")
    except Exception as e:
        logger.error(f"Error initializing dev account: {e}")
    finally:
        db.close()
    
    # Initialize default categories if database table is empty
    db = SessionLocal()
    try:
        default_categories = [
            "Groceries", "Utilities", "Dining", "Travel", "Shopping",
            "Entertainment", "Investment", "Salary/Income", "Healthcare",
            "Fuel", "Education", "Transfer", "Others"
        ]
        for cat_name in default_categories:
            stmt = pg_insert(Category).values(name=cat_name).on_conflict_do_nothing(index_elements=["name"])
            db.execute(stmt)
        db.commit()
        logger.info("Default categories initialized in DB.")

        # Initialize default banks if database table is empty
        default_banks = [
            "State Bank of India (SBI)", "HDFC Bank", "ICICI Bank", "Axis Bank",
            "Bank of Baroda (BOB)", "Kotak Mahindra Bank", "Punjab National Bank (PNB)",
            "Union Bank of India", "Canara Bank", "IndusInd Bank", "Federal Bank"
        ]
        for b_name in default_banks:
            stmt = pg_insert(Bank).values(name=b_name).on_conflict_do_nothing(index_elements=["name"])
            db.execute(stmt)
        db.commit()
        logger.info("Default Banks seeded in DB.")

    except Exception as e:
        db.rollback()
        logger.error(f"Error initializing database defaults: {str(e)}")
    finally:
        db.close()
    
    # Pull LLM/Embedding models from Ollama in a separate thread so startup is non-blocking
    threading.Thread(target=ensure_models_exist, daemon=True).start()

# Mount all Domain Routers
for router in all_routers:
    app.include_router(router)

# Root & Health Check Endpoint
@app.get("/")
def health_check():
    return {"status": "healthy", "service": "finance-analyzer-api"}

# Async Task Status Polling Endpoint
@app.get("/api/tasks/{task_id}")
def api_get_task_status(task_id: str):
    status = get_task_status(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Task not found")
    return status
