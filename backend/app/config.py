import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:local_secret_password@db:5432/finance_db")
    OLLAMA_URL: str = os.getenv("OLLAMA_URL", "http://finance_ollama:11434")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "qwen2.5:3b")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.0"))
    LLM_NUM_CTX: int = int(os.getenv("LLM_NUM_CTX", "2048"))
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://localhost:80,http://localhost")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

settings = Settings()
