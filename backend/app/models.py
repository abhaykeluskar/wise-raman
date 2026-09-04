import uuid
import enum
from decimal import Decimal
from sqlalchemy import Column, String, Date, Boolean, ForeignKey, Numeric, Text, Enum as SQLEnum, DateTime, Integer
from sqlalchemy.orm import relationship, synonym
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class AccountVisibility(str, enum.Enum):
    PRIVATE = "PRIVATE"
    SHARED = "SHARED"
    HOUSEHOLD = "HOUSEHOLD"

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
    UNKNOWN_NEEDS_REVIEW = "UNKNOWN_NEEDS_REVIEW"

class PaymentRail(str, enum.Enum):
    UPI = "UPI"
    NEFT = "NEFT"
    IMPS = "IMPS"
    RTGS = "RTGS"
    NACH = "NACH"
    BBPS = "BBPS"
    CARD = "CARD"
    UNKNOWN_NEEDS_REVIEW = "UNKNOWN_NEEDS_REVIEW"

class Bank(Base):
    __tablename__ = "banks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
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
    visibility = Column(SQLEnum(AccountVisibility, name="account_visibility_enum"), nullable=False, default=AccountVisibility.HOUSEHOLD)
    balance = Column(Numeric(14, 2), nullable=False, default=0.00)  # mapped from current_balance in spec
    credit_limit = Column(Numeric(14, 2), nullable=True)
    available_limit = Column(Numeric(14, 2), nullable=True)
    monthly_cap = Column(Numeric(14, 2), nullable=True)
    billing_cycle_day = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bank = relationship("Bank", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account", cascade="all, delete-orphan")
    statements = relationship("CreditCardStatement", back_populates="account", cascade="all, delete-orphan")
    linked_goals = relationship("FinancialGoal", back_populates="linked_account")

    @property
    def goal_locked_amount(self) -> Decimal:
        if not hasattr(self, "linked_goals") or not self.linked_goals:
            return Decimal("0.00")
        return sum(Decimal(str(g.current_amount or 0)) for g in self.linked_goals if not g.is_completed)

    @property
    def spendable_balance(self) -> Decimal:
        bal = Decimal(str(self.balance or 0))
        return bal - self.goal_locked_amount

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

class UPITransactionType(str, enum.Enum):
    P2P = "P2P"
    P2M = "P2M"
    SELF_TRANSFER = "SELF_TRANSFER"
    COLLECT = "COLLECT"
    AUTOPAY = "AUTOPAY"
    UNKNOWN_NEEDS_REVIEW = "UNKNOWN_NEEDS_REVIEW"

class FinancialEventType(str, enum.Enum):
    EXPENSE = "EXPENSE"
    INCOME = "INCOME"
    TRANSFER = "TRANSFER"
    CARD_PAYMENT = "CARD_PAYMENT"
    PURCHASE = "PURCHASE"
    REFUND = "REFUND"
    FEE = "FEE"
    INTEREST = "INTEREST"
    TAX = "TAX"
    INVESTMENT = "INVESTMENT"
    LOAN_DISBURSEMENT = "LOAN_DISBURSEMENT"
    LOAN_REPAYMENT = "LOAN_REPAYMENT"
    UNKNOWN_NEEDS_REVIEW = "UNKNOWN_NEEDS_REVIEW"

class ReviewState(str, enum.Enum):
    UNKNOWN = "UNKNOWN"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    USER_CONFIRMED = "USER_CONFIRMED"
    VERIFIED = "VERIFIED"
    AUTO_RESOLVED = "AUTO_RESOLVED"

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    statement_id = Column(UUID(as_uuid=True), ForeignKey("credit_card_statements.id", ondelete="SET NULL"), nullable=True)
    date = Column(Date, nullable=False)  # transaction_date
    value_date = Column(Date, nullable=True)
    raw_narration = Column("raw_narration", Text, nullable=False)  # Immutable original text
    raw_text = synonym("raw_narration")
    normalized_narration = Column(String(150), nullable=True)
    description = Column(String(150), nullable=True)  # cleaned_merchant
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="SET NULL"), nullable=True)
    category = Column(String(100), nullable=True, default="UNKNOWN")
    subcategory = Column(String(100), nullable=True)
    transaction_type = Column(SQLEnum(TransactionType, name="transaction_type_enum"), nullable=False, default=TransactionType.UNKNOWN_NEEDS_REVIEW)
    payment_rail = Column(SQLEnum(PaymentRail, name="payment_rail_enum"), nullable=False, default=PaymentRail.UNKNOWN_NEEDS_REVIEW)
    review_state = Column(SQLEnum(ReviewState, name="review_state_enum"), nullable=False, default=ReviewState.UNKNOWN)
    amount = Column(Numeric(14, 2), nullable=False)  # (+) Cash in, (-) Cash out
    running_balance = Column(Numeric(14, 2), nullable=True)
    reference_id = Column(String(100), nullable=True)
    fingerprint = Column(String(64), nullable=True, index=True)
    
    # UPI First-Class Fields
    upi_type = Column(SQLEnum(UPITransactionType, name="upi_transaction_type_enum"), nullable=True)
    upi_vpa = Column(String(150), nullable=True)
    utr_number = Column(String(50), nullable=True, index=True)
    
    # Document Provenance & Data Quality Fields
    source_document_id = Column(UUID(as_uuid=True), nullable=True)
    source_type = Column(String(50), nullable=False, default="UNKNOWN") # "PDF_STATEMENT", "CSV", "USER", etc.
    source_id = Column(String(255), nullable=True)
    source_page_number = Column(Integer, nullable=True)
    source_coordinates = Column(String(100), nullable=True) # "x,y,w,h"
    extraction_method = Column(String(50), nullable=True)
    extraction_confidence = Column(Numeric(4, 3), default=1.000)
    confidence = Column(Numeric(4, 3), nullable=True)
    verified = Column(Boolean, default=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_by = Column(String(100), nullable=True)

    is_excluded_from_spending = Column(Boolean, default=False)
    embedding = Column(Vector(768), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    financial_event_id = Column(UUID(as_uuid=True), ForeignKey("financial_events.id", ondelete="SET NULL"), nullable=True)

    account = relationship("Account", back_populates="transactions")
    statement = relationship("CreditCardStatement", back_populates="transactions")
    financial_event = relationship("FinancialEvent", back_populates="transactions")

class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
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
    reward_currency = Column(String, nullable=False, default="Reward Points")  # Cashback, Reward Points, Miles
    monthly_cap = Column(Numeric(14, 2), nullable=True)
    statement_date = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)

    account = relationship("Account")
    bank = relationship("Bank", back_populates="credit_cards")

    @property
    def credit_limit(self):
        return self.account.credit_limit if self.account else None

    @property
    def balance(self):
        return self.account.balance if self.account else Decimal("0.00")

    @property
    def current_balance(self):
        return self.account.balance if self.account else Decimal("0.00")

    @property
    def account_number_mask(self):
        return self.account.account_number_masked if self.account else None

    @property
    def name(self):
        return self.card_name

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
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    from_transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    to_transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    transfer_date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    from_transaction = relationship("Transaction", foreign_keys=[from_transaction_id])
    to_transaction = relationship("Transaction", foreign_keys=[to_transaction_id])

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

# --- PHASE 5: Household Financial OS ---

class HouseholdMember(Base):
    """
    Family members in Household / Family Mode.
    """
    __tablename__ = "household_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    relationship = Column(String(50), nullable=False) # 'SPOUSE', 'PARENT', 'CHILD', 'SELF', 'OTHER'
    avatar_color = Column(String(20), nullable=True, default="#6366F1")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Loan(Base):
    """
    Loans & Mortgages with reducing balance amortization tracking.
    """
    __tablename__ = "loans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    loan_name = Column(String(150), nullable=False)
    loan_type = Column(String(50), nullable=False) # 'HOME_LOAN', 'CAR_LOAN', 'PERSONAL_LOAN', 'EDUCATION_LOAN'
    lender_name = Column(String(100), nullable=False)
    principal_amount = Column(Numeric(14, 2), nullable=False)
    outstanding_balance = Column(Numeric(14, 2), nullable=False)
    annual_interest_rate = Column(Numeric(5, 2), nullable=False)
    emi_amount = Column(Numeric(14, 2), nullable=False)
    tenure_months = Column(Integer, nullable=False)
    remaining_tenure_months = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    next_due_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    account = relationship("Account")

class FinancialGoal(Base):
    """
    Financial goals and emergency fund tracking.
    """
    __tablename__ = "financial_goals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(150), nullable=False)
    category = Column(String(50), nullable=False) # 'EMERGENCY_FUND', 'VACATION', 'CAR', 'HOUSE', 'RETIREMENT', 'EDUCATION', 'OTHER'
    target_amount = Column(Numeric(14, 2), nullable=False)
    current_amount = Column(Numeric(14, 2), nullable=False, default=0.00)
    monthly_contribution = Column(Numeric(14, 2), nullable=False, default=0.00)
    target_date = Column(Date, nullable=True)
    priority = Column(String(20), default="MEDIUM") # 'HIGH', 'MEDIUM', 'LOW'
    is_completed = Column(Boolean, default=False)
    linked_account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    linked_account = relationship("Account", back_populates="linked_goals")

class GoalAllocationDirection(str, enum.Enum):
    ALLOCATE = "ALLOCATE"
    RELEASE = "RELEASE"

class GoalAllocationLedger(Base):
    """
    Virtual sub-envelope allocation ledger tracking money assigned to or released from goals.
    """
    __tablename__ = "goal_allocation_ledgers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    goal_id = Column(UUID(as_uuid=True), ForeignKey("financial_goals.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(14, 2), nullable=False)
    direction = Column(SQLEnum(GoalAllocationDirection, name="goal_allocation_direction_enum"), nullable=False)
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    goal = relationship("FinancialGoal")
    account = relationship("Account")

class InsurancePolicy(Base):
    """
    Insurance policies: Health, Term, Life, Vehicle.
    """
    __tablename__ = "insurance_policies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    policy_name = Column(String(150), nullable=False)
    policy_type = Column(String(50), nullable=False) # 'HEALTH', 'LIFE', 'TERM', 'VEHICLE'
    insurer_name = Column(String(100), nullable=False)
    policy_number = Column(String(100), nullable=True)
    sum_insured = Column(Numeric(14, 2), nullable=False)
    premium_amount = Column(Numeric(14, 2), nullable=False)
    premium_frequency = Column(String(20), nullable=False, default="ANNUAL") # 'ANNUAL', 'MONTHLY', 'QUARTERLY'
    renewal_date = Column(Date, nullable=False)
    covered_members = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SplitExpense(Base):
    """
    Split bill record across friends or household.
    """
    __tablename__ = "split_expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(150), nullable=False)
    total_amount = Column(Numeric(14, 2), nullable=False)
    paid_by_user = Column(Boolean, default=True)
    payer_name = Column(String(100), nullable=True)
    expense_date = Column(Date, nullable=False)
    category = Column(String(50), nullable=True, default="Dining")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    participants = relationship("SplitParticipant", back_populates="split_expense", cascade="all, delete-orphan")

class SplitParticipant(Base):
    """
    Individual person's share in a split expense.
    """
    __tablename__ = "split_participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    split_expense_id = Column(UUID(as_uuid=True), ForeignKey("split_expenses.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    share_amount = Column(Numeric(14, 2), nullable=False)
    is_settled = Column(Boolean, default=False)
    settled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    split_expense = relationship("SplitExpense", back_populates="participants")

class Vehicle(Base):
    """
    Vehicle profile for tracking ownership costs.
    """
    __tablename__ = "vehicles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    vehicle_name = Column(String(100), nullable=False)
    vehicle_type = Column(String(50), nullable=False, default="CAR") # 'CAR', 'MOTORCYCLE', 'SCOOTER'
    registration_number = Column(String(30), nullable=True)
    fuel_type = Column(String(30), nullable=False, default="PETROL") # 'PETROL', 'DIESEL', 'CNG', 'ELECTRIC'
    odometer_reading = Column(Numeric(10, 1), nullable=True, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    expenses = relationship("VehicleExpense", back_populates="vehicle", cascade="all, delete-orphan")

class VehicleExpense(Base):
    """
    Vehicle running and maintenance expenses.
    """
    __tablename__ = "vehicle_expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    vehicle_id = Column(UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False)
    expense_type = Column(String(50), nullable=False) # 'FUEL', 'FASTAG', 'SERVICE', 'INSURANCE', 'TOLL', 'PARKING', 'EMI'
    amount = Column(Numeric(14, 2), nullable=False)
    expense_date = Column(Date, nullable=False)
    odometer = Column(Numeric(10, 1), nullable=True)
    fuel_liters = Column(Numeric(8, 2), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    vehicle = relationship("Vehicle", back_populates="expenses")

class TravelTrip(Base):
    """
    Group travel trips (e.g. 'Goa Vacation 2026').
    """
    __tablename__ = "travel_trips"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    trip_name = Column(String(150), nullable=False)
    destination = Column(String(150), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    budget = Column(Numeric(14, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    expenses = relationship("TripExpense", back_populates="trip", cascade="all, delete-orphan")

class TripExpense(Base):
    """
    Expense line item tied to a specific trip.
    """
    __tablename__ = "trip_expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    trip_id = Column(UUID(as_uuid=True), ForeignKey("travel_trips.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(50), nullable=False) # 'FLIGHT', 'HOTEL', 'FOOD', 'TRANSPORT', 'ACTIVITIES', 'SHOPPING', 'OTHER'
    amount = Column(Numeric(14, 2), nullable=False)
    expense_date = Column(Date, nullable=False)
    description = Column(String(200), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    trip = relationship("TravelTrip", back_populates="expenses")


# ==========================================
# PHASE 6 & 7: DATA INTEGRITY & AUDITABILITY MODELS
# ==========================================

class DocumentSource(Base):
    """
    Provenance tracking for ingested statements and documents.
    """
    __tablename__ = "document_sources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_hash_sha256 = Column(String(64), nullable=False, index=True)
    file_type = Column(String(20), nullable=False) # 'PDF', 'CSV', 'EXCEL'
    parser_name = Column(String(100), nullable=False)
    parser_version = Column(String(20), nullable=False)
    total_pages = Column(Integer, default=1)
    extracted_rows_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class StatementReconciliation(Base):
    """
    Mathematical balance proof: Opening + Credits - Debits = Closing
    """
    __tablename__ = "statement_reconciliations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    document_source_id = Column(UUID(as_uuid=True), ForeignKey("document_sources.id", ondelete="CASCADE"), nullable=True)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    opening_balance = Column(Numeric(14, 2), nullable=False)
    total_credits = Column(Numeric(14, 2), nullable=False)
    total_debits = Column(Numeric(14, 2), nullable=False)
    closing_balance = Column(Numeric(14, 2), nullable=False)
    expected_closing_balance = Column(Numeric(14, 2), nullable=False)
    discrepancy_amount = Column(Numeric(14, 2), nullable=False, default=0.00)
    status = Column(String(30), nullable=False, default="VERIFIED") # 'VERIFIED', 'MISMATCH_FLAGGED', 'ADJUSTED'
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserClassificationRule(Base):
    """
    Deterministic user classification override rules with priority hierarchy.
    """
    __tablename__ = "user_classification_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    match_pattern = Column(String(200), nullable=False) # regex or substring
    match_field = Column(String(50), default="raw_text") # 'raw_text', 'description', 'vpa'
    target_category = Column(String(100), nullable=False)
    target_subcategory = Column(String(100), nullable=True)
    is_excluded_from_spending = Column(Boolean, default=False)
    priority = Column(Integer, default=100) # Higher number = evaluated first
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class MandateRecord(Base):
    """
    UPI AutoPay, NACH, ECS, and Standing Instruction commitments.
    """
    __tablename__ = "mandate_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    biller_name = Column(String(150), nullable=False)
    mandate_type = Column(String(50), nullable=False) # 'UPI_AUTOPAY', 'NACH', 'ECS', 'STANDING_INSTRUCTION'
    amount = Column(Numeric(14, 2), nullable=True)
    frequency = Column(String(30), default="MONTHLY") # 'MONTHLY', 'QUARTERLY', 'ANNUAL'
    next_debit_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class BankFeeRecord(Base):
    """
    Detected bank fees (ATM fees, SMS charges, non-maintenance, IMPS/NEFT, card annual fees).
    """
    __tablename__ = "bank_fee_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    fee_type = Column(String(50), nullable=False) # 'ATM_FEE', 'SMS_CHARGE', 'MIN_BALANCE_PENALTY', 'CARD_ANNUAL_FEE', 'IMPS_CHARGE', 'OTHER_FEE'
    amount = Column(Numeric(14, 2), nullable=False)
    fee_date = Column(Date, nullable=False)
    raw_narration = Column(Text, nullable=False)
    is_avoidable = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())



class FinancialEvent(Base):
    __tablename__ = "financial_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(SQLEnum(FinancialEventType, name="financial_event_type_enum"), nullable=False, default=FinancialEventType.UNKNOWN_NEEDS_REVIEW)
    review_state = Column(SQLEnum(ReviewState, name="review_state_enum"), nullable=False, default=ReviewState.UNKNOWN)
    occurred_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    parent_event_id = Column(UUID(as_uuid=True), ForeignKey("financial_events.id", ondelete="SET NULL"), nullable=True)
    economic_amount = Column(Numeric(14, 2), nullable=True) # Explicit semantic amount
    
    # Data Quality & Provenance Fields
    source_type = Column(String(50), nullable=False, default="UNKNOWN")
    source_id = Column(String(255), nullable=True)
    extraction_method = Column(String(50), nullable=True)
    confidence = Column(Numeric(4, 3), nullable=True)
    verified = Column(Boolean, default=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_by = Column(String(100), nullable=True)
    
    transactions = relationship("Transaction", back_populates="financial_event")
    parent_event = relationship("FinancialEvent", remote_side=[id])

class AuditEvent(Base):
    __tablename__ = "audit_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    actor = Column(String(100), nullable=False) # "USER", "SYSTEM", "AI", "PARSER"
    entity_type = Column(String(50), nullable=False) # "TRANSACTION", "FINANCIAL_EVENT", "ACCOUNT"
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    action = Column(String(50), nullable=False) # "CREATE", "UPDATE", "DELETE", "STATE_CHANGE"
    old_value = Column(Text, nullable=True) # JSON string
    new_value = Column(Text, nullable=True) # JSON string
    source = Column(String(150), nullable=True)
    reason = Column(String(255), nullable=True)

class SystemMetadata(Base):
    """
    Migration & Versioning Infrastructure tracking.
    """
    __tablename__ = "system_metadata"
    
    key = Column(String(50), primary_key=True)
    value = Column(String(255), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CustomSubscription(Base):
    """
    User-managed, offline, or custom recurring subscriptions.
    """
    __tablename__ = "custom_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(150), nullable=False)
    category = Column(String(50), default="Digital & Streaming") # 'OTT & Video', 'Music & Audio', 'AI & Dev Tools', 'Fitness & Wellness', 'Cloud & Storage', 'Utilities', 'Other'
    amount = Column(Numeric(14, 2), nullable=False)
    frequency = Column(String(30), default="MONTHLY") # 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'
    billing_day = Column(Integer, default=1)
    next_renewal_date = Column(Date, nullable=True)
    payment_method = Column(String(100), nullable=True) # e.g. "HDFC Infinia", "UPI AutoPay", "Direct Debit"
    cancellation_url = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# --- PHASE 8: Firefly III-Inspired Financial Architecture Enhancements ---

class BudgetMode(str, enum.Enum):
    STRICT_RESET = "STRICT_RESET"
    ROLLOVER_SURPLUS_ONLY = "ROLLOVER_SURPLUS_ONLY"
    ROLLOVER_NET = "ROLLOVER_NET"
    SAVINGS_SWEEP = "SAVINGS_SWEEP"

class EnvelopeBudget(Base):
    """
    Category-based envelope budget supporting Firefly III style AutoBudget & Rollover modes.
    """
    __tablename__ = "envelope_budgets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String(100), nullable=False)
    monthly_limit = Column(Numeric(14, 2), nullable=False)
    budget_mode = Column(SQLEnum(BudgetMode, name="budget_mode_enum"), nullable=False, default=BudgetMode.ROLLOVER_SURPLUS_ONLY)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")
    period_records = relationship("BudgetPeriodRecord", back_populates="budget", cascade="all, delete-orphan")

class BudgetPeriodRecord(Base):
    """
    Historical monthly snapshot tracking allocated limits, rollovers, and spent amounts.
    """
    __tablename__ = "budget_period_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    budget_id = Column(UUID(as_uuid=True), ForeignKey("envelope_budgets.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    base_limit = Column(Numeric(14, 2), nullable=False)
    rollover_in = Column(Numeric(14, 2), nullable=False, default=0.00)
    effective_limit = Column(Numeric(14, 2), nullable=False)
    spent_amount = Column(Numeric(14, 2), nullable=False, default=0.00)
    closing_balance = Column(Numeric(14, 2), nullable=False, default=0.00)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    budget = relationship("EnvelopeBudget", back_populates="period_records")

class WebhookEventType(str, enum.Enum):
    ANOMALY_DETECTED = "ANOMALY_DETECTED"
    BUDGET_OVERRUN = "BUDGET_OVERRUN"
    MANDATE_DUE = "MANDATE_DUE"
    TRANSFER_COMPLETED = "TRANSFER_COMPLETED"
    HEALTH_SCORE_UPDATED = "HEALTH_SCORE_UPDATED"
    TEST_PING = "TEST_PING"

class WebhookEndpoint(Base):
    """
    Registered external webhook endpoints with HMAC-SHA256 signing secret.
    """
    __tablename__ = "webhook_endpoints"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    url = Column(String(500), nullable=False)
    secret = Column(String(100), nullable=False)
    description = Column(String(200), nullable=True)
    subscribed_events = Column(Text, nullable=False, default="[]") # JSON array of event names
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")
    deliveries = relationship("WebhookDelivery", back_populates="endpoint", cascade="all, delete-orphan")

class WebhookDelivery(Base):
    """
    Log of webhook delivery attempts, responses, and status codes.
    """
    __tablename__ = "webhook_deliveries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    webhook_id = Column(UUID(as_uuid=True), ForeignKey("webhook_endpoints.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(50), nullable=False)
    payload = Column(Text, nullable=False)
    status_code = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    success = Column(Boolean, default=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    endpoint = relationship("WebhookEndpoint", back_populates="deliveries")


