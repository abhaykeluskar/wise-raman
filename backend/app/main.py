import uuid
import threading
import logging
from typing import List, Optional
from decimal import Decimal, ROUND_HALF_UP
from datetime import date as date_type

from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_
import json
import hashlib

from app.config import settings
from app.database import get_db, init_db, SessionLocal
from app.models import Account, Transaction, Category, CreditCard, CreditCardStatement
from app.parser import parse_statement
from app.ai import ensure_models_exist, categorize_transaction, get_embedding, query_financial_rag, is_safe_ollama_url
from app.telemetry import backend_telemetry, ai_telemetry

def generate_transaction_fingerprint(account_id: uuid.UUID, txn_date: date_type, amount: Decimal, raw_text: str) -> str:
    amt = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    key = f"{account_id}|{txn_date}|{amt}|{(raw_text or '').strip()[:60]}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Local AI Personal Finance Analyzer")

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

# Enable CORS for React frontend (Vite dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    # Initialize DB (enable pgvector, create tables)
    init_db()
    logger.info("Database initialized.")
    
    # Initialize default categories if database table is empty
    db = SessionLocal()
    try:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

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

        # Initialize default banks and credit cards if database table is empty
        from app.models import Bank, CreditCard
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

        if db.query(CreditCard).count() == 0:
            default_cards = [
                {"card_name": "SBI Cashback Visa", "bank_name": "State Bank of India (SBI)", "network": "Visa", "reward_currency": "Cashback", "monthly_cap": Decimal("5000.00"), "statement_date": 12},
                {"card_name": "Airtel Axis Mastercard", "bank_name": "Axis Bank", "network": "Mastercard", "reward_currency": "Cashback", "monthly_cap": Decimal("600.00"), "statement_date": 15},
                {"card_name": "HDFC Tata Neu Plus", "bank_name": "HDFC Bank", "network": "RuPay", "reward_currency": "NeuCoins", "monthly_cap": Decimal("10000.00"), "statement_date": 20},
                {"card_name": "Federal OneCard", "bank_name": "Federal Bank", "network": "Visa", "reward_currency": "Reward Points", "monthly_cap": None, "statement_date": 2}
            ]
            for dc in default_cards:
                bank = db.query(Bank).filter(Bank.name == dc["bank_name"]).first()
                if not bank:
                    continue
                from app.models import AccountClassification, AccountSubtype
                acc = db.query(Account).filter(Account.bank_id == bank.id, Account.subtype == AccountSubtype.CREDIT_CARD).first()
                acc_id = acc.id if acc else None
                if not acc_id:
                    new_acc = Account(
                        name=dc["card_name"],
                        bank_id=bank.id,
                        classification=AccountClassification.LIABILITY,
                        subtype=AccountSubtype.CREDIT_CARD,
                        balance=Decimal("0.00")
                    )
                    db.add(new_acc)
                    db.commit()
                    db.refresh(new_acc)
                    acc_id = new_acc.id
                
                db.add(CreditCard(
                    card_name=dc["card_name"],
                    bank_id=bank.id,
                    network=dc["network"],
                    reward_currency=dc["reward_currency"],
                    monthly_cap=dc["monthly_cap"],
                    statement_date=dc["statement_date"],
                    is_active=True,
                    account_id=acc_id
                ))
            db.commit()
            logger.info("Default credit cards seeded in DB.")
    except Exception as e:
        db.rollback()
        logger.error(f"Error initializing database defaults: {str(e)}")
    finally:
        db.close()
    
    # Pull LLM/Embedding models from Ollama in a separate thread so startup is non-blocking
    threading.Thread(target=ensure_models_exist, daemon=True).start()

# --- Pydantic Schemas ---
from pydantic import BaseModel

import uuid

class BankBase(BaseModel):
    name: str

class BankResponse(BankBase):
    id: uuid.UUID
    class Config:
        from_attributes = True

class AccountCreate(BaseModel):
    name: str
    bank_id: uuid.UUID
    account_type: str
    balance: float = 0.0

class AccountResponse(BaseModel):
    id: uuid.UUID
    name: str
    bank_id: uuid.UUID
    bank: BankResponse
    classification: str
    subtype: str
    balance: Decimal

    class Config:
        from_attributes = True

class TransactionResponse(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    date: date_type
    amount: Decimal
    description: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    transaction_type: Optional[str] = None
    is_excluded_from_spending: bool = False
    verified: bool

    class Config:
        from_attributes = True

class TransactionUpdate(BaseModel):
    category: str
    subcategory: Optional[str] = None
    verified: bool = True
    date: Optional[date_type] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str

class CategoryCreate(BaseModel):
    name: str

class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str

    class Config:
        from_attributes = True

class CreditCardBase(BaseModel):
    card_name: str
    bank_id: uuid.UUID
    network: str
    reward_currency: str
    monthly_cap: Optional[Decimal] = None
    statement_date: int = 1
    is_active: bool = True
    account_id: Optional[uuid.UUID] = None

class CreditCardCreate(CreditCardBase):
    pass

class CreditCardResponse(CreditCardBase):
    id: uuid.UUID
    bank: BankResponse

    class Config:
        from_attributes = True

class CreditCardStatementResponse(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    statement_date: date_type
    due_date: date_type
    period_start_date: date_type
    period_end_date: date_type
    previous_dues: Decimal
    payments_received: Decimal
    purchases_debits: Decimal
    total_amount_due: Decimal
    minimum_amount_due: Decimal

    class Config:
        from_attributes = True

# --- Background Task for AI Enrichment ---
def enrich_transactions_task(transaction_ids: List[uuid.UUID]):
    """Background task to run Ollama categorization and vector embedding creation."""
    db = SessionLocal()
    try:
        db_categories = db.query(Category).all()
        categories_list = [c.name for c in db_categories] if db_categories else None
        txs = (
            db.query(Transaction)
            .options(joinedload(Transaction.account).joinedload(Account.bank))
            .filter(Transaction.id.in_(transaction_ids))
            .all()
        )

        for i, tx in enumerate(txs, 1):
            if not tx.category or tx.category in ["Processing...", "Parsing..."]:
                category, subcategory, clean_description = categorize_transaction(
                    tx.description, float(tx.amount), categories_list
                )
                tx.category = category
                tx.subcategory = subcategory
                tx.description = clean_description

            bank_name = tx.account.bank.name if tx.account and tx.account.bank else "Unknown"
            embed_text = (
                f"Date: {tx.date}. Bank: {bank_name}. Description: {tx.description}. "
                f"Amount: {tx.amount}. Category: {tx.category}. Subcategory: {tx.subcategory}."
            )
            embedding = get_embedding(embed_text)
            if embedding:
                tx.embedding = embedding
            if i % 8 == 0:
                db.commit()

        db.commit()
        run_bridge_algorithm(db)
        logger.info(f"Successfully processed {len(txs)} transactions in background.")
    except Exception as e:
        logger.error(f"Error in background enrichment: {str(e)}")
    finally:
        db.close()

# --- API Endpoints ---

@app.get("/")
def health_check():
    return {"status": "healthy", "service": "finance-analyzer-api"}

@app.get("/api/banks", response_model=List[BankResponse])
def list_banks(db: Session = Depends(get_db)):
    from app.models import Bank
    return db.query(Bank).all()

@app.post("/api/banks", response_model=BankResponse)
def create_bank(bank: BankBase, db: Session = Depends(get_db)):
    from app.models import Bank
    db_bank = Bank(name=bank.name)
    db.add(db_bank)
    db.commit()
    db.refresh(db_bank)
    return db_bank

@app.post("/api/accounts", response_model=AccountResponse)
def create_account(account: AccountCreate, db: Session = Depends(get_db)):
    from app.models import AccountClassification, AccountSubtype
    
    classification = AccountClassification.LIABILITY if "credit" in account.account_type.lower() or "loan" in account.account_type.lower() else AccountClassification.ASSET
    
    if "savings" in account.account_type.lower():
        subtype = AccountSubtype.SAVINGS
    elif "current" in account.account_type.lower():
        subtype = AccountSubtype.CURRENT
    elif "credit" in account.account_type.lower():
        subtype = AccountSubtype.CREDIT_CARD
    elif "loan" in account.account_type.lower():
        subtype = AccountSubtype.LOAN
    else:
        subtype = AccountSubtype.SAVINGS

    db_account = Account(
        name=account.name,
        bank_id=account.bank_id,
        classification=classification,
        subtype=subtype,
        balance=Decimal(str(account.balance))
    )
    db.add(db_account)
    db.commit()
    # Re-query to ensure relationships are loaded
    return db.query(Account).options(joinedload(Account.bank)).filter(Account.id == db_account.id).first()

@app.get("/api/accounts", response_model=List[AccountResponse])
def list_accounts(db: Session = Depends(get_db)):
    return db.query(Account).options(joinedload(Account.bank)).all()

@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: uuid.UUID, db: Session = Depends(get_db)):
    """Delete an account and all its associated transactions."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        db.delete(account)
        db.commit()
        return {"message": f"Account '{account.name}' and all associated transactions have been deleted."}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting account: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {str(e)}")

@app.post("/api/upload")
def upload_bank_statement(
    bank_id: uuid.UUID = Form(...),
    account_id: uuid.UUID = Form(...),
    file_type: str = Form(...),
    processing_engine: str = Form(...),
    pdf_password: Optional[str] = Form(None),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    account = db.query(Account).filter(Account.id == account_id, Account.bank_id == bank_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
        
    try:
        from app.models import AccountSubtype
        account_type_str = "Credit Card" if account.subtype == AccountSubtype.CREDIT_CARD else "Savings"
        contents = file.file.read()
        if len(contents) > 15 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Statement file is too large (max 15 MB).")
        parsed_result = parse_statement(
            contents, 
            file.filename, 
            account_type=account_type_str,
            bank_name=account.bank.name,
            processing_engine=processing_engine,
            password=pdf_password.strip() if pdf_password and pdf_password.strip() else None
        )
        
        if isinstance(parsed_result, list):
            parsed_txs = parsed_result
            statement_verified = False
            opening_balance = None
            closing_balance = None
            statement_summary = {}
        else:
            parsed_txs = parsed_result.get("transactions", [])
            statement_summary = parsed_result.get("statement_summary") or {}
            opening_balance = statement_summary.get("opening_balance") or parsed_result.get("opening_balance")
            closing_balance = statement_summary.get("total_amount_due") or parsed_result.get("closing_balance")
            
            # Mathematical validation
            statement_verified = False
            if opening_balance is not None and closing_balance is not None:
                sum_transactions = sum(Decimal(str(t['amount'])) for t in parsed_txs)
                
                from app.models import AccountSubtype
                if account.subtype == AccountSubtype.CREDIT_CARD:
                    # For CC: Total Due = Opening Dues + Debits - Credits
                    # sum_transactions is (Credits - Debits), so Opening - sum_transactions
                    calculated_close = Decimal(str(opening_balance)) - sum_transactions
                else:
                    calculated_close = Decimal(str(opening_balance)) + sum_transactions
                    
                if abs(calculated_close - Decimal(str(closing_balance))) < Decimal("1.00"):
                    statement_verified = True
                else:
                    logger.warning(f"Mathematical proof check: Expected {closing_balance}, got {calculated_close}")
                    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error parsing statement: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error parsing statement file: {str(e)}")
        
    if not parsed_txs:
        raise HTTPException(status_code=400, detail="No transactions could be extracted from this statement.")

    # Auto-update Card Credit Limit if parsed from official bank statement header
    parsed_credit_limit = statement_summary.get("credit_limit")
    if parsed_credit_limit and Decimal(str(parsed_credit_limit)) > 0:
        card_obj = db.query(CreditCard).filter(CreditCard.account_id == account.id).first()
        if card_obj:
            card_obj.monthly_cap = Decimal(str(parsed_credit_limit))
            logger.info(f"Auto-synced verified credit limit for {card_obj.card_name} to ₹{parsed_credit_limit}")

    # Auto-create Loan Accounts parsed from the statement
    from app.models import AccountClassification
    loans = statement_summary.get("loans", [])
    for loan in loans:
        product_name = loan.get("product_name")
        outstanding = loan.get("outstanding_principal")
        current_emi = loan.get("current_emi")
        
        if not product_name or outstanding is None: continue
        
        existing_loan = db.query(Account).filter(Account.bank_id == bank_id, Account.name == product_name).first()
        if existing_loan:
            existing_loan.balance = -Decimal(str(outstanding))
            existing_loan.monthly_cap = Decimal(str(current_emi)) if current_emi else Decimal("0.00")
        else:
            new_loan = Account(
                bank_id=bank_id,
                name=product_name,
                classification=AccountClassification.LIABILITY,
                subtype=AccountSubtype.LOAN,
                balance=-Decimal(str(outstanding)),
                monthly_cap=Decimal(str(current_emi)) if current_emi else Decimal("0.00")
            )
            db.add(new_loan)
    db.flush()

    # Persist CreditCardStatement record if uploading a credit card statement
    statement_record = None
    from datetime import timedelta
    if account.subtype == AccountSubtype.CREDIT_CARD:
        try:
            stmt_dt = statement_summary.get("statement_date")
            if not stmt_dt and parsed_txs:
                stmt_dt = max(pt["date"] for pt in parsed_txs if pt.get("date"))
            if not stmt_dt:
                stmt_dt = datetime.now().date()

            due_dt = statement_summary.get("due_date") or (stmt_dt + timedelta(days=20))
            p_start = statement_summary.get("period_start_date") or (stmt_dt - timedelta(days=30))
            p_end = statement_summary.get("period_end_date") or stmt_dt

            prev_dues_val = Decimal(str(opening_balance)) if opening_balance is not None else Decimal("0.00")
            total_due_val = Decimal(str(closing_balance)) if closing_balance is not None else sum(abs(Decimal(str(pt["amount"]))) for pt in parsed_txs if Decimal(str(pt["amount"])) < 0)
            min_due_val = Decimal(str(statement_summary.get("minimum_amount_due") or 0))

            statement_record = CreditCardStatement(
                account_id=account.id,
                statement_date=stmt_dt,
                due_date=due_dt,
                period_start_date=p_start,
                period_end_date=p_end,
                previous_dues=prev_dues_val,
                total_amount_due=total_due_val,
                minimum_amount_due=min_due_val,
                purchases_debits=sum(abs(Decimal(str(pt["amount"]))) for pt in parsed_txs if Decimal(str(pt["amount"])) < 0),
                payments_received=sum(Decimal(str(pt["amount"])) for pt in parsed_txs if Decimal(str(pt["amount"])) > 0)
            )
            db.add(statement_record)
            db.flush()
        except Exception as stmt_err:
            logger.warning(f"Could not persist CreditCardStatement: {stmt_err}")
        
    saved_tx_ids = []
    skipped_duplicates = 0
    total_amount_change = Decimal("0.00")
    
    # 1. Precompute fingerprints for all parsed transactions
    fps = [
        generate_transaction_fingerprint(account_id, pt["date"], Decimal(str(pt["amount"])), pt["raw_text"])
        for pt in parsed_txs
    ]
    
    # 2. Batch lookup existing fingerprints in a single fast query
    existing_rows = db.query(Transaction.fingerprint).filter(
        Transaction.account_id == account_id,
        Transaction.fingerprint.in_(fps)
    ).all()
    existing_fps_set = {r[0] for r in existing_rows}
    
    # 3. Save non-duplicate transactions to DB
    for pt, fp in zip(parsed_txs, fps):
        if fp in existing_fps_set:
            skipped_duplicates += 1
            continue

        raw_desc = pt.get("description") or ""
        clean_desc = (raw_desc[:147] + "...") if len(raw_desc) > 150 else raw_desc

        db_tx = Transaction(
            account_id=account_id,
            statement_id=statement_record.id if statement_record else None,
            date=pt["date"],
            amount=pt["amount"],
            description=clean_desc,
            raw_text=pt["raw_text"],
            category=pt.get("category") or "Processing...",
            subcategory=pt.get("subcategory") or "Parsing...",
            reference_id=pt.get("reference_id"),
            fingerprint=fp,
            verified=statement_verified
        )
        db.add(db_tx)
        db.flush()  # Populate id
        saved_tx_ids.append(db_tx.id)
        # Update running total for newly inserted transactions only
        total_amount_change += Decimal(str(pt["amount"]))
        
    # Update account balance
    if account.subtype != AccountSubtype.CREDIT_CARD and closing_balance is not None:
        account.balance = Decimal(str(closing_balance))
    elif saved_tx_ids:
        account.balance += total_amount_change
    db.commit()
    
    # Trigger background worker for AI categorization & embeddings if new transactions were inserted
    if saved_tx_ids:
        background_tasks.add_task(enrich_transactions_task, saved_tx_ids)
    
    msg = f"Successfully imported {len(saved_tx_ids)} new transactions."
    if skipped_duplicates > 0:
        msg += f" {skipped_duplicates} duplicate transactions skipped."
    if statement_verified:
        msg += " (Math balance verified ✓)"

    return {
        "message": msg,
        "transaction_count": len(saved_tx_ids),
        "skipped_duplicates": skipped_duplicates,
        "total_parsed": len(parsed_txs),
        "verified": statement_verified,
        "statement_summary": {
            "opening_balance": float(opening_balance) if opening_balance is not None else None,
            "total_amount_due": float(closing_balance) if closing_balance is not None else None,
            "credit_limit": float(parsed_credit_limit) if parsed_credit_limit is not None else None
        }
    }

@app.get("/api/transactions", response_model=List[TransactionResponse])
def get_transactions(
    account_id: Optional[uuid.UUID] = None,
    category: Optional[str] = None,
    verified: Optional[bool] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    query = db.query(Transaction)
    if account_id is not None:
        query = query.filter(Transaction.account_id == account_id)
    if category is not None:
        query = query.filter(Transaction.category == category)
    if verified is not None:
        query = query.filter(Transaction.verified == verified)
        
    # Order by date descending
    return query.order_by(Transaction.date.desc()).offset(offset).limit(limit).all()

@app.put("/api/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: uuid.UUID,
    update: TransactionUpdate,
    db: Session = Depends(get_db)
):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    # Handle manual updates for date, description, and amount
    if update.date is not None:
        tx.date = update.date
    if update.description is not None:
        tx.description = update.description
    if update.amount is not None:
        # Calculate diff to update account balance
        old_amount = tx.amount
        new_amount = update.amount
        diff = new_amount - old_amount
        
        account = tx.account
        from app.models import AccountSubtype
        if account.subtype in [AccountSubtype.SAVINGS, AccountSubtype.CURRENT]:
            account.balance += diff
        else:
            account.balance -= diff
        tx.amount = new_amount

    tx.category = update.category
    if update.subcategory is not None:
        tx.subcategory = update.subcategory
    tx.verified = update.verified
    
    # If category, description, or amount changes, update the semantic embedding
    embed_text = f"Date: {tx.date}. Bank: {tx.account.bank.name if tx.account.bank else 'Unknown'}. Description: {tx.description}. Amount: {tx.amount}. Category: {tx.category}. Subcategory: {tx.subcategory}."
    embedding = get_embedding(embed_text)
    if embedding:
        tx.embedding = embedding
        
    db.commit()
    db.refresh(tx)
    return tx

@app.delete("/api/transactions/purge")
def purge_all_transactions(db: Session = Depends(get_db)):
    """Delete all transactions from database and reset all account balances to 0."""
    try:
        db.query(Transaction).delete()
        db.query(Account).update({Account.balance: Decimal("0.00")})
        db.commit()
        return {"message": "All transactions have been purged and account balances reset."}
    except Exception as e:
        db.rollback()
        logger.error(f"Error purging transactions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to purge data: {str(e)}")

@app.delete("/api/transactions/{transaction_id}")
def delete_transaction(transaction_id: uuid.UUID, db: Session = Depends(get_db)):
    """Delete a single transaction by ID and adjust the account balance."""
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    try:
        # Revert account balance
        account = tx.account
        from app.models import AccountSubtype
        if account.subtype in [AccountSubtype.SAVINGS, AccountSubtype.CURRENT]:
            account.balance -= tx.amount
        else:
            account.balance += tx.amount
            
        db.delete(tx)
        db.commit()
        return {"message": "Transaction deleted successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting transaction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete transaction: {str(e)}")

@app.get("/api/categories", response_model=List[CategoryResponse])
def get_categories(db: Session = Depends(get_db)):
    """List all categories ordered by name."""
    return db.query(Category).order_by(Category.name).all()

@app.post("/api/categories", response_model=CategoryResponse)
def create_category(category: CategoryCreate, db: Session = Depends(get_db)):
    """Create a new transaction category."""
    name_clean = category.name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")
        
    existing = db.query(Category).filter(Category.name.ilike(name_clean)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    
    db_category = Category(name=name_clean)
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

def reembed_transactions_for_category(category_name: str):
    """Background task to recalculate vector embeddings for transactions when category changes."""
    db = SessionLocal()
    try:
        txs = db.query(Transaction).options(joinedload(Transaction.account).joinedload(Account.bank)).filter(Transaction.category == category_name).all()
        for tx in txs:
            bank_name = tx.account.bank.name if tx.account and tx.account.bank else "Unknown"
            embed_text = f"Date: {tx.date}. Bank: {bank_name}. Description: {tx.description}. Amount: {tx.amount}. Category: {tx.category}. Subcategory: {tx.subcategory}."
            embedding = get_embedding(embed_text)
            if embedding:
                tx.embedding = embedding
        db.commit()
    except Exception as e:
        logger.error(f"Error re-embedding transactions for category {category_name}: {e}")
    finally:
        db.close()

@app.put("/api/categories/{category_id}", response_model=CategoryResponse)
def update_category(category_id: uuid.UUID, category_data: CategoryCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Update/rename a category, update associated transactions, and refresh vector embeddings."""
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    
    new_name = category_data.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")
    
    old_name = cat.name
    if old_name == "Others" and new_name != "Others":
        raise HTTPException(status_code=400, detail="Cannot rename the default 'Others' category")
    
    # Check if new name is already taken by another category
    existing = db.query(Category).filter(Category.name.ilike(new_name), Category.id != category_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Category '{new_name}' already exists")
    
    try:
        cat.name = new_name
        # Reassign all transactions with old_name to new_name
        db.query(Transaction).filter(Transaction.category == old_name).update({Transaction.category: new_name})
        db.commit()
        db.refresh(cat)
        
        # Trigger background re-embedding for updated category
        background_tasks.add_task(reembed_transactions_for_category, new_name)
        return cat
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update category: {str(e)}")

@app.delete("/api/categories/{identifier}")
def delete_category(identifier: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Delete a category by UUID or name, reassign transactions to 'Others', and refresh embeddings."""
    cat = None
    try:
        cat_uuid = uuid.UUID(identifier)
        cat = db.query(Category).filter(Category.id == cat_uuid).first()
    except ValueError:
        cat = db.query(Category).filter(Category.name.ilike(identifier)).first()
        
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    
    if cat.name.lower() == "others":
        raise HTTPException(status_code=400, detail="Cannot delete the default 'Others' category")
        
    try:
        # Reassign transactions of this category to "Others"
        db.query(Transaction).filter(Transaction.category == cat.name).update({Transaction.category: "Others"})
        db.delete(cat)
        db.commit()
        
        background_tasks.add_task(reembed_transactions_for_category, "Others")
        return {"message": f"Category '{cat.name}' deleted, transactions reassigned to 'Others'"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete category: {str(e)}")

@app.post("/api/chat", response_model=ChatResponse)
def chat_with_history(request: ChatRequest, db: Session = Depends(get_db)):
    """Conversational interface using RAG across transaction history."""
    response_text = query_financial_rag(db, request.message)
    return ChatResponse(response=response_text)

@app.get("/api/ai/logs")
async def stream_ai_logs():
    """Stream real-time AI telemetry logs via Server-Sent Events (SSE)."""
    async def log_generator():
        async for item in ai_telemetry.subscribe():
            yield f"data: {json.dumps(item)}\n\n"
    return StreamingResponse(log_generator(), media_type="text/event-stream")

@app.get("/api/backend/logs")
async def stream_backend_logs():
    """Stream real-time Backend telemetry logs via Server-Sent Events (SSE)."""
    async def log_generator():
        async for item in backend_telemetry.subscribe():
            yield f"data: {json.dumps(item)}\n\n"
    return StreamingResponse(log_generator(), media_type="text/event-stream")

@app.get("/api/reports/spending")
def get_spending_report(db: Session = Depends(get_db)):
    """Aggregate spending by month and category, respecting exclusion flags."""
    
    # Group by month (YYYY-MM) and category
    # Exclude income, excluded transfers, and processing placeholders
    query = db.query(
        func.to_char(Transaction.date, "YYYY-MM").label("month"),
        Transaction.category,
        func.sum(func.abs(Transaction.amount)).label("total")
    ).join(Account).filter(
        Transaction.amount < 0,
        Transaction.is_excluded_from_spending == False,
        Transaction.category != "Salary/Income",
        Transaction.category != "Processing...",
        Transaction.category != "Transfer"
    )
    
    transfer_keywords = ['NEFT', 'RTGS', 'IMPS', 'TRANSFER', 'ATM', 'CASH WITHDRAWAL', 'EMI', 'AUTO DEBIT']
    transfer_conditions = [~Transaction.description.ilike(f'%{kw}%') for kw in transfer_keywords]
    
    from app.models import AccountSubtype
    query = query.filter(
        or_(
            Account.subtype == AccountSubtype.CREDIT_CARD,
            and_(
                Account.subtype.in_([AccountSubtype.SAVINGS, AccountSubtype.CURRENT]),
                *transfer_conditions
            )
        )
    ).group_by(
        "month",
        Transaction.category
    ).order_by(
        "month"
    )
    
    results = query.all()
    
    # Format for charts
    # Output structure: [{ "month": "2026-08", "Groceries": 500, "Dining": 120 }, ...]
    data_map = {}
    categories_found = set()
    
    for month, category, total in results:
        if month not in data_map:
            data_map[month] = {"month": month}
        data_map[month][category] = float(total)
        categories_found.add(category)
        
    # Fill in zeros for missing categories in months
    formatted_data = []
    for m in sorted(data_map.keys()):
        row = data_map[m]
        for cat in categories_found:
            if cat not in row:
                row[cat] = 0.0
        formatted_data.append(row)
        
    return {
        "categories": list(categories_found),
        "data": formatted_data
    }

class LlmSettingsRequest(BaseModel):
    ollama_url: Optional[str] = None
    llm_model: Optional[str] = None
    embedding_model: Optional[str] = None
    temperature: Optional[float] = None
    num_ctx: Optional[int] = None

@app.get("/api/settings/llm")
def get_llm_settings():
    """Retrieve active LLM and Ollama configuration with detected local models."""
    import requests
    available_models = []
    ollama_connected = False
    try:
        res = requests.get(f"{settings.OLLAMA_URL}/api/tags", timeout=3)
        if res.status_code == 200:
            ollama_connected = True
            available_models = [m.get("name") for m in res.json().get("models", [])]
    except Exception:
        pass

    return {
        "ollama_url": settings.OLLAMA_URL,
        "llm_model": settings.LLM_MODEL,
        "embedding_model": settings.EMBEDDING_MODEL,
        "temperature": settings.LLM_TEMPERATURE,
        "num_ctx": settings.LLM_NUM_CTX,
        "ollama_connected": ollama_connected,
        "available_models": available_models
    }

@app.post("/api/settings/llm")
def update_llm_settings(req: LlmSettingsRequest):
    """Update active LLM configuration in runtime."""
    if req.ollama_url:
        url = req.ollama_url.strip().rstrip('/')
        if not is_safe_ollama_url(url):
            raise HTTPException(
                status_code=400,
                detail="Ollama URL must be a local endpoint (localhost, ollama, or host.docker.internal on port 11434).",
            )
        settings.OLLAMA_URL = url
    if req.llm_model:
        settings.LLM_MODEL = req.llm_model.strip()
    if req.embedding_model:
        settings.EMBEDDING_MODEL = req.embedding_model.strip()
    if req.temperature is not None:
        settings.LLM_TEMPERATURE = float(req.temperature)
    if req.num_ctx is not None:
        settings.LLM_NUM_CTX = int(req.num_ctx)

    telemetry.log(f"Updated LLM configuration: Model={settings.LLM_MODEL}, URL={settings.OLLAMA_URL}, Temp={settings.LLM_TEMPERATURE}")
    return get_llm_settings()

class TestOllamaRequest(BaseModel):
    url: str

class TestDatabaseRequest(BaseModel):
    conn_string: str

@app.post("/api/settings/test-ollama")
def test_ollama_connection(request: TestOllamaRequest):
    """Test if we can connect to the local Ollama endpoint and check active models."""
    import requests
    url = request.url.strip().rstrip('/')
    if not is_safe_ollama_url(url):
        return {
            "status": "error",
            "message": "Only local Ollama hosts are allowed (localhost, ollama, finance_ollama, host.docker.internal).",
        }
    try:
        response = requests.get(f"{url}/api/tags", timeout=3)
        if response.status_code == 200:
            data = response.json()
            models = [m.get("name") for m in data.get("models", [])]
            return {
                "status": "success",
                "models": models,
                "message": f"Connected successfully! Available models: {', '.join(models) or 'none'}",
            }
        return {"status": "error", "message": f"Server responded with status code: {response.status_code}"}
    except Exception as e:
        logger.error(f"Error testing Ollama connection: {str(e)}")
        return {"status": "error", "message": "Failed to connect to Ollama."}

@app.post("/api/settings/test-db")
def test_database_connection(request: TestDatabaseRequest):
    """Test if we can establish a connection with the PostgreSQL connection string."""
    from urllib.parse import urlparse
    from sqlalchemy import create_engine, text as sa_text
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

@app.get("/api/cards", response_model=List[CreditCardResponse])
def get_credit_cards(db: Session = Depends(get_db)):
    """Retrieve all credit cards from the database."""
    return db.query(CreditCard).options(joinedload(CreditCard.bank)).all()

@app.get("/api/statements", response_model=List[CreditCardStatementResponse])
def get_statements(account_id: Optional[uuid.UUID] = None, db: Session = Depends(get_db)):
    """Retrieve credit card statements with official bank totals and due dates."""
    query = db.query(CreditCardStatement)
    if account_id:
        query = query.filter(CreditCardStatement.account_id == account_id)
    return query.order_by(CreditCardStatement.statement_date.desc()).all()

@app.post("/api/cards", response_model=CreditCardResponse)
def create_credit_card(card_data: CreditCardCreate, db: Session = Depends(get_db)):
    """Create a new credit card. Automatically registers an account if not linked."""
    from app.models import AccountClassification, AccountSubtype
    try:
        account_id = card_data.account_id
        if not account_id:
            new_acc = Account(
                name=card_data.card_name,
                bank_id=card_data.bank_id,
                classification=AccountClassification.LIABILITY,
                subtype=AccountSubtype.CREDIT_CARD,
                balance=Decimal("0.00")
            )
            db.add(new_acc)
            db.flush()
            account_id = new_acc.id

        new_card = CreditCard(
            card_name=card_data.card_name,
            bank_id=card_data.bank_id,
            network=card_data.network,
            reward_currency=card_data.reward_currency,
            monthly_cap=card_data.monthly_cap,
            statement_date=card_data.statement_date,
            is_active=card_data.is_active,
            account_id=account_id
        )
        db.add(new_card)
        db.commit()
        # Re-query to load relationships
        return db.query(CreditCard).options(joinedload(CreditCard.bank)).filter(CreditCard.id == new_card.id).first()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to create card: {str(e)}")

@app.put("/api/cards/{card_id}", response_model=CreditCardResponse)
def update_credit_card(card_id: uuid.UUID, card_data: CreditCardCreate, db: Session = Depends(get_db)):
    """Update details for an existing credit card."""
    card = db.query(CreditCard).filter(CreditCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Credit card not found")
    
    card.card_name = card_data.card_name
    card.bank_id = card_data.bank_id
    card.network = card_data.network
    card.reward_currency = card_data.reward_currency
    card.monthly_cap = card_data.monthly_cap
    card.statement_date = card_data.statement_date
    card.is_active = card_data.is_active
    card.account_id = card_data.account_id

    db.commit()
    return db.query(CreditCard).options(joinedload(CreditCard.bank)).filter(CreditCard.id == card_id).first()

@app.delete("/api/cards/{card_id}")
def delete_credit_card(card_id: uuid.UUID, db: Session = Depends(get_db)):
    """Delete a credit card from database."""
    card = db.query(CreditCard).filter(CreditCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Credit card not found")
    db.delete(card)
    db.commit()
    return {"status": "success", "message": f"Successfully deleted card {card_id}"}


def run_bridge_algorithm(db: Session):
    """Identify and link transfers and credit card payments across accounts."""
    from app.models import Transaction, TransactionType, AccountSubtype
    
    # Eager load account to eliminate N+1 queries during bridge traversal
    txs = db.query(Transaction).options(joinedload(Transaction.account)).filter(Transaction.is_excluded_from_spending == False).all()
    
    for tx in txs:
        if not tx.account:
            continue
        desc_lower = tx.description.lower() if tx.description else ""
        
        # CC Payment Received (Cash In to CC)
        if tx.account.subtype == AccountSubtype.CREDIT_CARD and tx.amount > 0:
            tx.transaction_type = TransactionType.CC_PAYMENT_RECEIVED
            tx.is_excluded_from_spending = True
            tx.category = "Transfer"
            
        # CC Bill Payment from Savings (Cash Out from Savings)
        elif tx.account.subtype in [AccountSubtype.SAVINGS, AccountSubtype.CURRENT] and tx.amount < 0 and (
            "credit card" in desc_lower
            or "cc payment" in desc_lower
            or "billdesk" in desc_lower
            or "mb/ib payment" in desc_lower
        ):
            tx.transaction_type = TransactionType.CC_BILL_PAYMENT
            tx.is_excluded_from_spending = True
            tx.category = "Transfer"
            
        elif any(k in desc_lower for k in ("neft", "rtgs", "imps", "internal fund", "own account", "self transfer", "to self")):
            tx.transaction_type = TransactionType.TRANSFER_INTERNAL
            tx.is_excluded_from_spending = True
            tx.category = "Transfer"
                
    try:
        db.commit()
    except Exception as e:
        logger.error(f"Error in bridge algorithm: {e}")
        db.rollback()

@app.get("/api/analytics/savings/cashflow")
def get_savings_cashflow(db: Session = Depends(get_db)):
    """Calculate Cash In vs Cash Out over time for savings accounts."""
    from app.models import AccountSubtype
    from sqlalchemy import func, case
    
    query = db.query(
        func.to_char(Transaction.date, "YYYY-MM").label("month"),
        func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)).label("cash_in"),
        func.sum(case((Transaction.amount < 0, Transaction.amount), else_=0)).label("cash_out")
    ).join(Account).filter(
        Account.subtype.in_([AccountSubtype.SAVINGS, AccountSubtype.CURRENT]),
        Transaction.is_excluded_from_spending == False
    ).group_by(
        "month"
    ).order_by("month")
    
    results = query.all()
    
    data = []
    for month, cash_in, cash_out in results:
        data.append({
            "month": month,
            "cash_in": float(cash_in) if cash_in else 0.0,
            "cash_out": float(cash_out) if cash_out else 0.0
        })
        
    return data

@app.get("/api/analytics/credit-cards/summary")
def get_credit_cards_summary(db: Session = Depends(get_db)):
    """Summary of all credit cards for analytics."""
    from app.models import AccountSubtype, CreditCardStatement
    from sqlalchemy import func
    
    # Current Outstanding
    outstanding = db.query(func.sum(Account.balance)).filter(
        Account.subtype == AccountSubtype.CREDIT_CARD
    ).scalar() or Decimal("0.00")
    
    # Upcoming Bills from statements
    upcoming_bills_total = db.query(func.sum(CreditCardStatement.total_amount_due)).filter(
        CreditCardStatement.due_date >= date_type.today()
    ).scalar() or Decimal("0.00")
    
    return {
        "current_outstanding": float(outstanding),
        "upcoming_bills": float(upcoming_bills_total)
    }
