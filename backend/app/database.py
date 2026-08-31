from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

DATABASE_URL = settings.DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)
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
        conn.commit()
        
        # Safe idempotent column additions
        try:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(64);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_fingerprint ON transactions (fingerprint);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_account_fingerprint ON transactions (account_id, fingerprint);"))
            conn.commit()
        except Exception:
            pass
        
    # Create all tables safely if they do not already exist (preserving existing data)
    Base.metadata.create_all(bind=engine)
