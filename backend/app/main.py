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
from app.database import get_db, init_db, SessionLocal, Base, engine
from app.models import Account, Transaction, Category, CreditCard, CreditCardStatement
from app.parser import parse_statement
from app.ai import ensure_models_exist, categorize_transaction, get_embedding, query_financial_rag
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta



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
    logger.info("Initializing database extension and models...")
    init_db()
    
    # Initialize Dev Account
    db = SessionLocal()
    try:
        from app.models import User
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

SECRET_KEY = "your-secret-key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

class UserCreate(BaseModel):
    email: str
    password: str
    name: str

def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=401, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        from jose import jwt
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except Exception:
        raise credentials_exception
    from app.models import User
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user

def is_dev_user(current_user = Depends(get_current_user)):
    if current_user.email != "dev@test.com":
        raise HTTPException(status_code=403, detail="Not authorized for Developer Tools")
    return current_user

@app.post("/api/auth/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
    from app.models import User
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    db_user = User(
        email=user.email,
        name=user.name,
        password_hash=get_password_hash(user.password)
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return {"message": "User registered successfully"}

@app.post("/api/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    from app.models import User
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "user_id": str(user.id)}


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

class PayslipResponse(BaseModel):
    id: uuid.UUID
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    company_name: Optional[str] = None
    period_month: int
    period_year: int
    bank_account_no: Optional[str] = None
    basic_salary: Decimal
    hra: Decimal
    special_allowance: Decimal
    other_earnings: Decimal
    gross_earnings: Decimal
    provident_fund: Decimal
    professional_tax: Decimal
    income_tax_tds: Decimal
    other_deductions: Decimal
    gross_deductions: Decimal
    net_pay: Decimal
    account_id: Optional[uuid.UUID] = None
    transaction_id: Optional[uuid.UUID] = None

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
        if txs and txs[0].account:
            run_bridge_algorithm(db, txs[0].account.user_id)
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
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    account = db.query(Account).filter(Account.id == account_id, Account.bank_id == bank_id, Account.user_id == current_user.id).first()
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
            if closing_balance is not None:
                total_due_val = Decimal(str(closing_balance))
            else:
                cycle_net = sum(Decimal(str(pt["amount"])) for pt in parsed_txs)
                # TAD = previous dues − Σ(credits − debits) when spends are stored negative
                reconstructed = prev_dues_val - cycle_net
                total_due_val = reconstructed if reconstructed > 0 else Decimal("0.00")
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
        
        # Trigger reconciliation
        from app.services.reconciliation import reconcile_transfers
        background_tasks.add_task(reconcile_transfers, db, str(current_user.id))
    
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
def get_llm_settings(current_user = Depends(is_dev_user)):
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
def update_llm_settings(req: LlmSettingsRequest, current_user = Depends(is_dev_user)):
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
def test_ollama_connection(request: TestOllamaRequest, current_user = Depends(is_dev_user)):
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

@app.delete("/api/dev/purge")
def purge_database(current_user = Depends(is_dev_user), db: Session = Depends(get_db)):
    """Deletes all application data across all users except the Users table itself."""
    try:
        from app.models import Transaction, Account, CreditCardStatement, CreditCard, Bank, TransferLink, Payslip
        db.query(TransferLink).delete()
        db.query(Transaction).delete()
        db.query(Payslip).delete()
        db.query(CreditCardStatement).delete()
        db.query(CreditCard).delete()
        db.query(Account).delete()
        db.query(Bank).delete()
        db.commit()
        return {"status": "success", "message": "All database records purged"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/cards/{card_id}")
def delete_credit_card(card_id: uuid.UUID, db: Session = Depends(get_db)):
    """Delete a credit card from database."""
    card = db.query(CreditCard).filter(CreditCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Credit card not found")
    db.delete(card)
    db.commit()
    return {"status": "success", "message": f"Successfully deleted card {card_id}"}


def run_bridge_algorithm(db: Session, user_id: str):
    """Identify and link transfers and credit card payments across accounts."""
    from app.services.reconciliation import reconcile_transfers
    try:
        reconcile_transfers(db, str(user_id))
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

# ==========================================
# NEW ENDPOINTS FOR NET WORTH, SUBSCRIPTIONS, CASHFLOW
# ==========================================

@app.get("/api/net-worth")
def get_net_worth(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.models import Account, AccountClassification
    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()
    
    total_assets = 0.0
    total_liabilities = 0.0
    breakdown = {}

    for acc in accounts:
        val = float(acc.balance)
        subtype = acc.subtype.value
        
        if acc.classification == AccountClassification.ASSET:
            total_assets += val
            breakdown[subtype] = breakdown.get(subtype, 0.0) + val
        else:
            debt = abs(val)
            total_liabilities += debt
            breakdown[subtype] = breakdown.get(subtype, 0.0) + debt

    return {
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "net_worth": total_assets - total_liabilities,
        "breakdown": breakdown
    }

@app.get("/api/subscriptions")
def get_subscriptions(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from app.models import Transaction
    from collections import defaultdict
    from datetime import timedelta
    
    transactions = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.amount < 0,
        Transaction.is_excluded_from_spending == False
    ).order_by(Transaction.date).all()
    
    groups = defaultdict(list)
    for tx in transactions:
        desc = tx.description or tx.raw_text
        if desc:
            groups[desc.strip()].append(tx)
            
    subscriptions = []
    
    for desc, txs in groups.items():
        if len(txs) < 2:
            continue
            
        amounts = [abs(float(tx.amount)) for tx in txs]
        avg_amount = sum(amounts) / len(amounts)
        
        if any(abs(amt - avg_amount) > avg_amount * 0.2 for amt in amounts):
            continue
            
        txs_sorted = sorted(txs, key=lambda x: x.date)
        intervals = []
        for i in range(1, len(txs_sorted)):
            delta = (txs_sorted[i].date - txs_sorted[i-1].date).days
            intervals.append(delta)
            
        if not intervals:
            continue
            
        avg_interval = sum(intervals) / len(intervals)
        
        freq = None
        if 25 <= avg_interval <= 35:
            freq = "Monthly"
        elif 350 <= avg_interval <= 380:
            freq = "Yearly"
        elif 6 <= avg_interval <= 8:
            freq = "Weekly"
            
        if freq:
            last_date = txs_sorted[-1].date
            if freq == "Monthly":
                next_date = last_date + timedelta(days=30)
            elif freq == "Yearly":
                next_date = last_date + timedelta(days=365)
            else:
                next_date = last_date + timedelta(days=7)
                
            subscriptions.append({
                "name": desc,
                "amount": avg_amount,
                "frequency": freq,
                "next_expected_date": next_date.isoformat()
            })
            
    return subscriptions

@app.get("/api/analytics/cashflow")
def get_cashflow(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    from sqlalchemy import func, case
    from app.models import Transaction
    from datetime import date as date_type, timedelta
    
    today = date_type.today()
    twelve_months_ago = today - timedelta(days=365)
    start_date = twelve_months_ago.replace(day=1)

    query = db.query(
        func.to_char(Transaction.date, "Mon YYYY").label("month_str"),
        func.to_char(Transaction.date, "YYYY-MM").label("month_sort"),
        func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)).label("cash_in"),
        func.sum(case((Transaction.amount < 0, func.abs(Transaction.amount)), else_=0)).label("cash_out")
    ).filter(
        Transaction.user_id == current_user.id,
        Transaction.is_excluded_from_spending == False,
        Transaction.date >= start_date
    ).group_by(
        "month_str",
        "month_sort"
    ).order_by("month_sort")
    
    results = query.all()
    
    data = []
    for row in results:
        data.append({
            "month": row.month_str,
            "cash_in": float(row.cash_in) if row.cash_in else 0.0,
            "cash_out": float(row.cash_out) if row.cash_out else 0.0
        })
        
    return data

# ==========================================
# PAYSLIPS ENDPOINTS
# ==========================================

@app.post("/api/payslips/upload", response_model=PayslipResponse)
def upload_payslip(
    pdf_password: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    from app.parser import parse_payslip
    from app.models import Payslip, Transaction
    from datetime import date as date_type, timedelta
    
    contents = file.file.read()
    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")
        
    try:
        parsed_data = parse_payslip(contents, password=pdf_password.strip() if pdf_password and pdf_password.strip() else None)
    except Exception as e:
        logger.error(f"Error parsing payslip: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
        
    company_name = parsed_data.get("company_name")
    period_month = parsed_data.get("period_month")
    period_year = parsed_data.get("period_year")

    # Duplicate Detection
    if company_name and period_month and period_year:
        existing_payslip = db.query(Payslip).filter(
            Payslip.company_name == company_name,
            Payslip.period_month == period_month,
            Payslip.period_year == period_year
        ).first()
        
        if existing_payslip:
            raise HTTPException(status_code=400, detail=f"Payslip for {company_name} ({period_month}/{period_year}) already exists.")

    # Build Payslip record
    payslip = Payslip(
        employee_id=parsed_data.get("employee_id"),
        employee_name=parsed_data.get("employee_name"),
        company_name=parsed_data.get("company_name"),
        period_month=parsed_data.get("period_month"),
        period_year=parsed_data.get("period_year"),
        bank_account_no=parsed_data.get("bank_account_no"),
        basic_salary=parsed_data.get("basic_salary", 0),
        hra=parsed_data.get("hra", 0),
        special_allowance=parsed_data.get("special_allowance", 0),
        other_earnings=parsed_data.get("other_earnings", 0),
        gross_earnings=parsed_data.get("gross_earnings", 0),
        provident_fund=parsed_data.get("provident_fund", 0),
        professional_tax=parsed_data.get("professional_tax", 0),
        income_tax_tds=parsed_data.get("income_tax_tds", 0),
        other_deductions=parsed_data.get("other_deductions", 0),
        gross_deductions=parsed_data.get("gross_deductions", 0),
        net_pay=parsed_data.get("net_pay", 0)
    )
    
    # Try to link to a transaction
    # We look for a transaction with amount == net_pay around the end of period_month or start of next month
    if payslip.net_pay and payslip.period_year and payslip.period_month:
        try:
            # End of month roughly
            target_month = payslip.period_month
            target_year = payslip.period_year
            
            # Start of next month
            if target_month == 12:
                next_month = 1
                next_year = target_year + 1
            else:
                next_month = target_month + 1
                next_year = target_year
                
            start_date = date_type(target_year, target_month, 20)
            end_date = date_type(next_year, next_month, 15)
            
            # Find matching transaction (exact amount, Income)
            matching_tx = db.query(Transaction).filter(
                Transaction.amount == Decimal(str(payslip.net_pay)),
                Transaction.date >= start_date,
                Transaction.date <= end_date,
                Transaction.transaction_type == TransactionType.INCOME
            ).first()
            
            if matching_tx:
                payslip.transaction_id = matching_tx.id
                payslip.account_id = matching_tx.account_id
                
        except Exception as e:
            logger.warning(f"Failed to link payslip to transaction automatically: {e}")
            
    db.add(payslip)
    db.commit()
    db.refresh(payslip)
    
    return payslip

@app.get("/api/payslips", response_model=List[PayslipResponse])
def get_payslips(db: Session = Depends(get_db)):
    from app.models import Payslip
    payslips = db.query(Payslip).order_by(Payslip.period_year.desc(), Payslip.period_month.desc()).all()
    return payslips

