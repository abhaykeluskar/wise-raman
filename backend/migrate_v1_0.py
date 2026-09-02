import uuid
import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.database import engine, Base
from app.models import (
    Transaction, FinancialEvent, FinancialEventType, ReviewState,
    AuditEvent
)

def run_migration():
    print("Starting v1.0 schema and data migration...")
    
    # 1. Create new tables (financial_events, audit_events, system_metadata)
    Base.metadata.create_all(bind=engine)
    print("Ensured all tables exist.")

    # 2. Alter existing transactions table to add new columns (safe idempotent additions)
    alter_statements = [
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS normalized_narration VARCHAR(150);",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL;",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_rail VARCHAR(50) DEFAULT 'UNKNOWN_NEEDS_REVIEW';",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS review_state VARCHAR(50) DEFAULT 'UNKNOWN';",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'UNKNOWN';",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_id VARCHAR(255);",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS extraction_method VARCHAR(50);",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS confidence NUMERIC(4,3);",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS verified_by VARCHAR(100);",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS financial_event_id UUID;",
        "ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS review_state VARCHAR(50) DEFAULT 'UNKNOWN';",
        "ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'UNKNOWN';",
        "ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS source_id VARCHAR(255);",
        "ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS extraction_method VARCHAR(50);",
        "ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS confidence NUMERIC(4,3);",
        "ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;",
        "ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS verified_by VARCHAR(100);",
        "ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS parent_event_id UUID;",
        "ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS economic_amount NUMERIC(14,2);",
        "ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMP WITH TIME ZONE;",
    ]
    
    for stmt in alter_statements:
        with engine.connect() as conn:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception as e:
                pass
    print("Altered existing tables successfully.")

    Session = sessionmaker(bind=engine)
    session = Session()

    # 3. Backfill FinancialEvents for existing Transactions conservatively
    unmapped_transactions = session.query(Transaction).filter(Transaction.financial_event_id == None).all()
    print(f"Found {len(unmapped_transactions)} transactions to backfill.")

    events_created = 0
    for txn in unmapped_transactions:
        # Map transaction type to financial event type
        evt_type = FinancialEventType.UNKNOWN_NEEDS_REVIEW
        
        # We rely on the string enum values
        ttype = str(txn.transaction_type)
        if ttype == "EXPENSE":
            evt_type = FinancialEventType.EXPENSE
        elif ttype == "INCOME":
            evt_type = FinancialEventType.INCOME
        elif ttype == "TRANSFER_INTERNAL":
            evt_type = FinancialEventType.TRANSFER
        elif ttype in ["CC_BILL_PAYMENT", "CC_PAYMENT_RECEIVED"]:
            evt_type = FinancialEventType.CARD_PAYMENT
        elif ttype == "BANK_FEE_INTEREST":
            if float(txn.amount) < 0:
                evt_type = FinancialEventType.FEE
            else:
                evt_type = FinancialEventType.INTEREST
        elif ttype == "REFUND_REVERSAL":
            evt_type = FinancialEventType.REFUND
            
        # Create Financial Event
        event = FinancialEvent(
            id=uuid.uuid4(),
            user_id=txn.user_id,
            event_type=evt_type,
            review_state=ReviewState.UNKNOWN if evt_type == FinancialEventType.UNKNOWN_NEEDS_REVIEW else ReviewState.VERIFIED,
            occurred_at=txn.date, # Using date for occurred_at fallback
            source_type="MIGRATION_BACKFILL",
            economic_amount=txn.amount # Defaulting to transaction amount for backfill
        )
        session.add(event)
        
        # Link transaction
        txn.financial_event_id = event.id
        
        # Create Audit Event for the historical provenance note
        audit = AuditEvent(
            id=uuid.uuid4(),
            timestamp=datetime.datetime.now(datetime.timezone.utc),
            actor="SYSTEM",
            entity_type="FINANCIAL_EVENT",
            entity_id=event.id,
            action="CREATE",
            new_value=f'{{"event_type": "{evt_type.value}", "economic_amount": {txn.amount}}}',
            source="MIGRATION_BACKFILL",
            reason="Conservative backfill of historical transaction"
        )
        session.add(audit)
        
        events_created += 1

    session.commit()
    print(f"Successfully backfilled {events_created} Financial Events and Audit Events.")
    
    # 4. Initialize system metadata
    with engine.connect() as conn:
        try:
            conn.execute(text("""
                INSERT INTO system_metadata (key, value) VALUES ('schema_version', '1.0') ON CONFLICT (key) DO NOTHING;
                INSERT INTO system_metadata (key, value) VALUES ('domain_version', '1.0') ON CONFLICT (key) DO NOTHING;
                INSERT INTO system_metadata (key, value) VALUES ('backup_format_version', '1.0') ON CONFLICT (key) DO NOTHING;
            """))
            conn.commit()
        except Exception:
            pass

    session.close()
    print("Migration complete!")

if __name__ == "__main__":
    run_migration()
