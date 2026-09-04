import logging
from typing import Optional, List
from urllib.parse import urlparse
import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, text as sa_text

from app.config import settings
from app.dependencies import get_current_user
from app.ai import find_working_ollama_url, is_safe_ollama_url
from app.telemetry import backend_telemetry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["Settings"])

class LlmSettingsRequest(BaseModel):
    ollama_url: Optional[str] = None
    llm_model: Optional[str] = None
    fallback_model: Optional[str] = None
    embedding_model: Optional[str] = None
    temperature: Optional[float] = None
    num_ctx: Optional[int] = None
    enable_thinking: Optional[bool] = None

class TestOllamaRequest(BaseModel):
    url: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None

class TestDatabaseRequest(BaseModel):
    conn_string: str

@router.get("/llm")
def get_llm_settings():
    active_url = find_working_ollama_url()
    available_models = []
    ollama_connected = False
    try:
        res = requests.get(f"{active_url}/api/tags", timeout=3)
        if res.status_code == 200:
            ollama_connected = True
            available_models = [m.get("name") for m in res.json().get("models", [])]
    except Exception:
        pass

    return {
        "ollama_url": active_url,
        "llm_model": settings.LLM_MODEL,
        "fallback_model": settings.LLM_FALLBACK_MODEL,
        "embedding_model": settings.EMBEDDING_MODEL,
        "temperature": settings.LLM_TEMPERATURE,
        "num_ctx": settings.LLM_NUM_CTX,
        "enable_thinking": settings.LLM_ENABLE_THINKING,
        "ollama_connected": ollama_connected,
        "available_models": available_models,
        "presets": ["qwen3:4b", "qwen2.5:3b", "wiseraman-copilot"],
    }

@router.post("/llm")
def update_llm_settings(req: LlmSettingsRequest, current_user = Depends(get_current_user)):
    if req.ollama_url:
        url = req.ollama_url.strip().rstrip('/')
        if not is_safe_ollama_url(url):
            raise HTTPException(
                status_code=400,
                detail="Ollama URL must be a local endpoint (localhost, ollama, finance_ollama, or host.docker.internal on port 11434).",
            )
        settings.OLLAMA_URL = url
    if req.llm_model:
        settings.LLM_MODEL = req.llm_model.strip()
    if req.fallback_model is not None:
        settings.LLM_FALLBACK_MODEL = req.fallback_model.strip()
    if req.embedding_model:
        settings.EMBEDDING_MODEL = req.embedding_model.strip()
    if req.temperature is not None:
        settings.LLM_TEMPERATURE = float(req.temperature)
    if req.num_ctx is not None:
        settings.LLM_NUM_CTX = int(req.num_ctx)
    if req.enable_thinking is not None:
        settings.LLM_ENABLE_THINKING = bool(req.enable_thinking)

    backend_telemetry.log(
        f"Updated LLM configuration: Model={settings.LLM_MODEL} (Fallback={settings.LLM_FALLBACK_MODEL}), "
        f"Thinking={settings.LLM_ENABLE_THINKING}, Ctx={settings.LLM_NUM_CTX}, Temp={settings.LLM_TEMPERATURE}"
    )
    return get_llm_settings()

@router.post("/test-ollama")
def test_ollama_connection(request: TestOllamaRequest, current_user = Depends(get_current_user)):
    raw_url = request.url or request.base_url or ""
    url = raw_url.strip().rstrip('/')
    if not url:
        url = find_working_ollama_url()

    candidates = [url]
    active_fallback = find_working_ollama_url()
    if active_fallback and active_fallback not in candidates:
        candidates.append(active_fallback)
    for c in ["http://finance_ollama:11434", "http://ollama:11434", "http://host.docker.internal:11434", "http://localhost:11434"]:
        if c not in candidates:
            candidates.append(c)

    for candidate in candidates:
        if not is_safe_ollama_url(candidate):
            continue
        try:
            response = requests.get(f"{candidate}/api/tags", timeout=3)
            if response.status_code == 200:
                data = response.json()
                models = [m.get("name") for m in data.get("models", [])]
                settings.OLLAMA_URL = candidate
                return {
                    "status": "success",
                    "models": models,
                    "active_url": candidate,
                    "message": f"Connected successfully! Available models: {', '.join(models) or 'none'}",
                }
        except Exception:
            continue

    return {
        "status": "error",
        "message": f"Failed to connect to Ollama at {url}. Ensure Ollama is running.",
    }

@router.post("/test-db")
def test_database_connection(request: TestDatabaseRequest, current_user = Depends(get_current_user)):
    conn_str = request.conn_string.strip()
    parsed = urlparse(conn_str)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("postgresql", "postgres", "postgresql+psycopg2") or host not in {
        "localhost", "127.0.0.1", "db", "finance_db"
    }:
        return {"status": "error", "message": "Only local PostgreSQL hosts are allowed."}
    try:
        test_engine = create_engine(conn_str, pool_pre_ping=True)
        with test_engine.connect() as conn:
            conn.execute(sa_text("SELECT 1"))
        test_engine.dispose()
        return {"status": "success", "message": "Successfully established database connection."}
    except Exception as e:
        logger.error(f"Error testing DB connection: {str(e)}")
        return {"status": "error", "message": "Database connection failed."}
