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
    name = Column(String, unique=True, nullable=False, index=True)

    accounts = relationship("Account", back_populates="bank", cascade="all, delete-orphan")
    credit_cards = relationship("CreditCard", back_populates="bank", cascade="all, delete-orphan")

class Account(Base):
    __tablename__ = "accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
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
    name = Column(String, unique=True, nullable=False, index=True)

class CreditCard(Base):
    """
    Metadata table to store card-specific details that don't belong in the core Account table.
    Links 1:1 with Account (where subtype=CREDIT_CARD).
    """
    __tablename__ = "credit_cards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
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
