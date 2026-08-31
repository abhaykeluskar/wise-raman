import uuid
import enum
from sqlalchemy import Column, String, Date, Boolean, ForeignKey, Numeric, Text, Enum as SQLEnum, DateTime, Integer
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class AccountClassification(str, enum.Enum):
    ASSET = "ASSET"
    LIABILITY = "LIABILITY"

class AccountSubtype(str, enum.Enum):
    SAVINGS = "SAVINGS"
    CURRENT = "CURRENT"
    CREDIT_CARD = "CREDIT_CARD"
    LOAN = "LOAN"
    INVESTMENT = "INVESTMENT"
    TAX = "TAX"

class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class TransactionType(str, enum.Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    TRANSFER_INTERNAL = "TRANSFER_INTERNAL"
    CC_BILL_PAYMENT = "CC_BILL_PAYMENT"
    CC_PAYMENT_RECEIVED = "CC_PAYMENT_RECEIVED"
    REFUND_REVERSAL = "REFUND_REVERSAL"
    BANK_FEE_INTEREST = "BANK_FEE_INTEREST"

class Bank(Base):
    __tablename__ = "banks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, unique=True, nullable=False, index=True)

    accounts = relationship("Account", back_populates="bank", cascade="all, delete-orphan")
    credit_cards = relationship("CreditCard", back_populates="bank", cascade="all, delete-orphan")

class Account(Base):
    __tablename__ = "accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    bank_id = Column(UUID(as_uuid=True), ForeignKey("banks.id", ondelete="CASCADE"), nullable=False)
    account_number_masked = Column(String(32), nullable=False, default="XXXX")
    name = Column(String(100), nullable=False)  # mapped from account_name in spec
    classification = Column(SQLEnum(AccountClassification, name="account_classification_enum"), nullable=False)
    subtype = Column(SQLEnum(AccountSubtype, name="account_subtype_enum"), nullable=False)
    balance = Column(Numeric(14, 2), nullable=False, default=0.00)  # mapped from current_balance in spec
    credit_limit = Column(Numeric(14, 2), nullable=True)
    available_limit = Column(Numeric(14, 2), nullable=True)
    monthly_cap = Column(Numeric(14, 2), nullable=True)
    billing_cycle_day = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bank = relationship("Bank", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account", cascade="all, delete-orphan")
    statements = relationship("CreditCardStatement", back_populates="account", cascade="all, delete-orphan")

class CreditCardStatement(Base):
    __tablename__ = "credit_card_statements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    statement_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    period_start_date = Column(Date, nullable=False)
    period_end_date = Column(Date, nullable=False)
    previous_dues = Column(Numeric(14, 2), nullable=False, default=0.00)
    payments_received = Column(Numeric(14, 2), nullable=False, default=0.00)
    purchases_debits = Column(Numeric(14, 2), nullable=False, default=0.00)
    finance_charges = Column(Numeric(14, 2), nullable=False, default=0.00)
    total_amount_due = Column(Numeric(14, 2), nullable=False)
    minimum_amount_due = Column(Numeric(14, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    account = relationship("Account", back_populates="statements")
    transactions = relationship("Transaction", back_populates="statement")

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    statement_id = Column(UUID(as_uuid=True), ForeignKey("credit_card_statements.id", ondelete="SET NULL"), nullable=True)
    date = Column(Date, nullable=False)  # transaction_date
    value_date = Column(Date, nullable=True)
    raw_text = Column(Text, nullable=False)  # raw_narration
    description = Column(String(150), nullable=True)  # cleaned_merchant
    category = Column(String(100), nullable=True)
    subcategory = Column(String(100), nullable=True)
    transaction_type = Column(SQLEnum(TransactionType, name="transaction_type_enum"), nullable=False, default=TransactionType.EXPENSE)
    amount = Column(Numeric(14, 2), nullable=False)  # (+) Cash in, (-) Cash out
    running_balance = Column(Numeric(14, 2), nullable=True)
    reference_id = Column(String(100), nullable=True)
    fingerprint = Column(String(64), nullable=True, index=True)
    is_excluded_from_spending = Column(Boolean, default=False)
    verified = Column(Boolean, default=False)
    embedding = Column(Vector(768), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    account = relationship("Account", back_populates="transactions")
    statement = relationship("CreditCardStatement", back_populates="transactions")

class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, unique=True, nullable=False, index=True)

class CreditCard(Base):
    """
    Metadata table to store card-specific details that don't belong in the core Account table.
    Links 1:1 with Account (where subtype=CREDIT_CARD).
    """
    __tablename__ = "credit_cards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), unique=True, nullable=True)
    bank_id = Column(UUID(as_uuid=True), ForeignKey("banks.id", ondelete="CASCADE"), nullable=False)
    card_name = Column(String, nullable=False)
    network = Column(String, nullable=False)  # Visa, Mastercard, RuPay, Amex
    reward_currency = Column(String, nullable=False)  # Cashback, Reward Points, Miles
    monthly_cap = Column(Numeric(14, 2), nullable=True)
    statement_date = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)

    account = relationship("Account")
    bank = relationship("Bank", back_populates="credit_cards")

class Payslip(Base):
    __tablename__ = "payslips"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    employee_id = Column(String(50), nullable=True)
    employee_name = Column(String(100), nullable=True)
    company_name = Column(String(100), nullable=True)
    period_month = Column(Integer, nullable=False) # 1-12
    period_year = Column(Integer, nullable=False)
    bank_account_no = Column(String(32), nullable=True)

    # Earnings
    basic_salary = Column(Numeric(14, 2), nullable=False, default=0.00)
    hra = Column(Numeric(14, 2), nullable=False, default=0.00)
    special_allowance = Column(Numeric(14, 2), nullable=False, default=0.00)
    other_earnings = Column(Numeric(14, 2), nullable=False, default=0.00)
    gross_earnings = Column(Numeric(14, 2), nullable=False)

    # Deductions
    provident_fund = Column(Numeric(14, 2), nullable=False, default=0.00)
    professional_tax = Column(Numeric(14, 2), nullable=False, default=0.00)
    income_tax_tds = Column(Numeric(14, 2), nullable=False, default=0.00)
    other_deductions = Column(Numeric(14, 2), nullable=False, default=0.00)
    gross_deductions = Column(Numeric(14, 2), nullable=False)

    net_pay = Column(Numeric(14, 2), nullable=False)
    
    # Linked bank account and transaction
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    account = relationship("Account")
    transaction = relationship("Transaction")

class Merchant(Base):
    __tablename__ = "merchants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(150), nullable=False)
    category = Column(String(100), nullable=True)
    subcategory = Column(String(100), nullable=True)

class TransferLink(Base):
    __tablename__ = "transfer_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    from_transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    to_transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    transfer_date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# --- PHASE 3: Indian Tax & Wealth ---

class InvestmentAccount(Base):
    """
    Metadata for investment accounts like Brokerages, NPS, PPF, Mutual Fund AMCs.
    Links 1:1 with Account (where subtype=INVESTMENT).
    """
    __tablename__ = "investment_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), unique=True, nullable=True)
    broker_name = Column(String(150), nullable=False)
    investment_type = Column(String(50), nullable=False) # e.g., 'STOCKS', 'MUTUAL_FUNDS', 'NPS', 'PPF'
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    account = relationship("Account")

class InvestmentHolding(Base):
    """
    Individual holdings (stocks, mutual funds) within an Investment Account.
    """
    __tablename__ = "investment_holdings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    investment_account_id = Column(UUID(as_uuid=True), ForeignKey("investment_accounts.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(150), nullable=False)
    ticker = Column(String(50), nullable=True)
    isin = Column(String(20), nullable=True)
    asset_class = Column(String(50), nullable=True) # Equity, Debt, Gold
    units = Column(Numeric(18, 4), nullable=False, default=0.00)
    average_price = Column(Numeric(14, 2), nullable=False, default=0.00)
    current_price = Column(Numeric(14, 2), nullable=False, default=0.00)
    invested_value = Column(Numeric(14, 2), nullable=False, default=0.00)
    current_value = Column(Numeric(14, 2), nullable=False, default=0.00)
    as_of_date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    investment_account = relationship("InvestmentAccount")

class FixedDeposit(Base):
    """
    Fixed Deposits and Recurring Deposits.
    """
    __tablename__ = "fixed_deposits"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    bank_id = Column(UUID(as_uuid=True), ForeignKey("banks.id", ondelete="CASCADE"), nullable=False)
    deposit_type = Column(String(20), nullable=False) # FD, RD
    principal_amount = Column(Numeric(14, 2), nullable=False)
    interest_rate = Column(Numeric(5, 2), nullable=False)
    start_date = Column(Date, nullable=False)
    maturity_date = Column(Date, nullable=False)
    maturity_amount = Column(Numeric(14, 2), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bank = relationship("Bank")

class TaxRecord(Base):
    """
    Tax records extracted from Form 16, AIS, or TIS.
    """
    __tablename__ = "tax_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    financial_year = Column(String(10), nullable=False) # e.g., '2025-26'
    record_type = Column(String(50), nullable=False) # 'FORM_16', 'AIS', 'TIS', 'ADVANCE_TAX'
    gross_income = Column(Numeric(14, 2), nullable=False, default=0.00)
    exemptions = Column(Numeric(14, 2), nullable=False, default=0.00)
    deductions = Column(Numeric(14, 2), nullable=False, default=0.00)
    taxable_income = Column(Numeric(14, 2), nullable=False, default=0.00)
    tax_paid = Column(Numeric(14, 2), nullable=False, default=0.00) # TDS + Advance Tax
    data_source = Column(Text, nullable=True) # JSON payload or specific source file reference
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# --- PHASE 4: AI Financial Copilot ---

class FinancialEvent(Base):
    """
    Semantic financial memory for the AI.
    """
    __tablename__ = "financial_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(50), nullable=False) # 'SALARY_INCREASE', 'LARGE_PURCHASE', 'LOAN_CLOSED'
    event_date = Column(Date, nullable=False)
    description = Column(Text, nullable=False)
    amount_impact = Column(Numeric(14, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AIChatSession(Base):
    """
    A single conversation thread with the AI Copilot.
    """
    __tablename__ = "ai_chat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(150), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    messages = relationship("AIChatMessage", back_populates="session", cascade="all, delete-orphan", order_by="AIChatMessage.created_at")

class AIChatMessage(Base):
    """
    Individual messages within an AI Chat Session, along with the deterministic evidence used.
    """
    __tablename__ = "ai_chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("ai_chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False) # 'user', 'assistant', 'system'
    content = Column(Text, nullable=False)
    evidence_payload = Column(Text, nullable=True) # JSON payload containing the deterministic facts
    tokens_used = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("AIChatSession", back_populates="messages")
