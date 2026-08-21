from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

DATABASE_URL = settings.DATABASE_URL

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    # Enable the pgvector extension in Postgres
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        # Safe idempotent column additions
        try:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(64);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_fingerprint ON transactions (fingerprint);"))
        except Exception:
            pass
        conn.commit()
        
    # Create all tables safely if they do not already exist (preserving existing data)
    Base.metadata.create_all(bind=engine)
