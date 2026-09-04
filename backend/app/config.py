import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:local_secret_password@db:5432/finance_db")
    OLLAMA_URL: str = os.getenv("OLLAMA_URL", "http://finance_ollama:11434")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "qwen3:4b")
    LLM_FALLBACK_MODEL: str = os.getenv("LLM_FALLBACK_MODEL", "qwen2.5:3b")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.3"))
    LLM_NUM_CTX: int = int(os.getenv("LLM_NUM_CTX", "8192"))
    LLM_ENABLE_THINKING: bool = os.getenv("LLM_ENABLE_THINKING", "false").lower() in ("true", "1", "yes")
    THINKING_TEMPERATURE: float = float(os.getenv("THINKING_TEMPERATURE", "0.6"))
    THINKING_TOP_P: float = float(os.getenv("THINKING_TOP_P", "0.95"))
    THINKING_MIN_P: float = float(os.getenv("THINKING_MIN_P", "0.05"))
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://localhost:80,http://localhost")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

settings = Settings()
