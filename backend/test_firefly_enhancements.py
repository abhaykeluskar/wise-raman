import unittest
import uuid
from decimal import Decimal
from datetime import date, datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.models import (
    User, Bank, Account, AccountClassification, AccountSubtype,
    Transaction, TransactionType, FinancialEvent, FinancialEventType,
    TransferLink, EnvelopeBudget, BudgetMode, BudgetPeriodRecord,
    FinancialGoal, GoalAllocationLedger, GoalAllocationDirection,
    WebhookEndpoint, WebhookDelivery, WebhookEventType
)
from app.services.transfers import (
    create_atomic_transfer, delete_atomic_transfer, get_user_transfers
)
from app.services.budget_engine import (
    get_or_create_monthly_budget_status, set_envelope_budget, delete_envelope_budget
)
from app.services.goals import (
    get_account_virtual_allocation_breakdown, allocate_funds_to_goal, release_funds_from_goal
)
from app.services.webhook_dispatcher import (
    sign_payload, register_webhook_endpoint, send_test_ping, dispatch_webhook_event_sync
)
from fastapi import HTTPException

class TestFireflyEnhancements(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Use existing app database or test database connection
        from app.database import engine
        cls.engine = engine
        cls.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

    def setUp(self):
        self.db = self.SessionLocal()
        # Create a unique test user
        self.test_user_id = uuid.uuid4()
        self.user = User(
            id=self.test_user_id,
            email=f"test_firefly_{self.test_user_id.hex[:8]}@example.com",
            name="Test User Firefly",
            password_hash="fakehash"
        )
        self.db.add(self.user)
        self.db.commit()

        self.bank = self.db.query(Bank).first()
        if not self.bank:
            self.bank = Bank(
                id=uuid.uuid4(),
                name=f"Test Bank {uuid.uuid4().hex[:6]}"
            )
            self.db.add(self.bank)
            self.db.commit()

    def tearDown(self):
        # Clean up test user and cascading data
        user = self.db.query(User).filter(User.id == self.test_user_id).first()
        if user:
            self.db.delete(user)
            self.db.commit()
        self.db.close()

    # =========================================================================
    # PHASE 1: DOUBLE-ENTRY ATOMIC TRANSFERS TESTS
    # =========================================================================
    def test_atomic_double_entry_transfer_lifecycle(self):
        """Tests paired transfer creation, balance adjustments, and clean deletion."""
        # 1. Setup Source Savings Account & Destination Credit Card Account
        acct_savings = Account(
            id=uuid.uuid4(),
            user_id=self.test_user_id,
            bank_id=self.bank.id,
            name="Salary Savings Account",
            classification=AccountClassification.ASSET,
            subtype=AccountSubtype.SAVINGS,
            balance=Decimal("50000.00")
        )
        acct_card = Account(
            id=uuid.uuid4(),
            user_id=self.test_user_id,
            bank_id=self.bank.id,
            name="Infinia Credit Card",
            classification=AccountClassification.LIABILITY,
            subtype=AccountSubtype.CREDIT_CARD,
            balance=Decimal("15000.00") # Outstanding liability
        )
        self.db.add_all([acct_savings, acct_card])
        self.db.commit()

        # 2. Execute atomic transfer of ₹10,000 from Savings to Credit Card
        transfer_link = create_atomic_transfer(
            db=self.db,
            user_id=self.test_user_id,
            from_account_id=acct_savings.id,
            to_account_id=acct_card.id,
            amount=Decimal("10000.00"),
            transfer_date=date(2026, 9, 1),
            description="Credit Card Bill Payment",
            reference_id="HDFC-PAY-999"
        )
        self.assertIsNotNone(transfer_link)
        self.assertEqual(transfer_link.amount, Decimal("10000.00"))

        # 3. Check transactions created
        outflow = self.db.query(Transaction).filter(Transaction.id == transfer_link.from_transaction_id).first()
        inflow = self.db.query(Transaction).filter(Transaction.id == transfer_link.to_transaction_id).first()

        self.assertIsNotNone(outflow)
        self.assertIsNotNone(inflow)
        self.assertEqual(outflow.amount, Decimal("-10000.00"))
        self.assertEqual(inflow.amount, Decimal("10000.00"))
        self.assertTrue(outflow.is_excluded_from_spending)
        self.assertTrue(inflow.is_excluded_from_spending)
        self.assertEqual(outflow.transaction_type, TransactionType.TRANSFER_INTERNAL)
        self.assertEqual(inflow.transaction_type, TransactionType.TRANSFER_INTERNAL)

        # 4. Check FinancialEvent (zero economic impact on net worth)
        self.assertIsNotNone(outflow.financial_event_id)
        event = self.db.query(FinancialEvent).filter(FinancialEvent.id == outflow.financial_event_id).first()
        self.assertIsNotNone(event)
        self.assertEqual(event.event_type, FinancialEventType.TRANSFER)
        self.assertEqual(event.economic_amount, Decimal("0.00"))

        # 5. Check updated account balances
        self.db.refresh(acct_savings)
        self.db.refresh(acct_card)
        self.assertEqual(acct_savings.balance, Decimal("40000.00")) # 50,000 - 10,000
        self.assertEqual(acct_card.balance, Decimal("5000.00"))    # 15,000 - 10,000 (debt reduced)

        # 6. Test list user transfers
        transfers_list = get_user_transfers(self.db, self.test_user_id)
        self.assertEqual(len(transfers_list), 1)
        self.assertEqual(transfers_list[0]["amount"], 10000.00)
        self.assertEqual(transfers_list[0]["from_account_name"], "Salary Savings Account")
        self.assertEqual(transfers_list[0]["to_account_name"], "Infinia Credit Card")

        # 7. Delete transfer pair atomically and verify balance restoration
        res = delete_atomic_transfer(self.db, self.test_user_id, transfer_link.id)
        self.assertIn("restored", res["message"])

        self.db.refresh(acct_savings)
        self.db.refresh(acct_card)
        self.assertEqual(acct_savings.balance, Decimal("50000.00"))
        self.assertEqual(acct_card.balance, Decimal("15000.00"))

        # Transactions should be deleted
        self.assertIsNone(self.db.query(Transaction).filter(Transaction.id == outflow.id).first())
        self.assertIsNone(self.db.query(Transaction).filter(Transaction.id == inflow.id).first())
        self.assertIsNone(self.db.query(TransferLink).filter(TransferLink.id == transfer_link.id).first())

    # =========================================================================
    # PHASE 2: AUTO-ROLLOVER ENVELOPE BUDGETS TESTS
    # =========================================================================
    def test_auto_rollover_budget_engine(self):
        """Tests category budgeting with positive rollover and overrun detection."""
        # 1. Setup envelope budget for Dining
        budget = set_envelope_budget(
            db=self.db,
            user_id=self.test_user_id,
            category="Dining",
            monthly_limit=Decimal("8000.00"),
            budget_mode=BudgetMode.ROLLOVER_SURPLUS_ONLY
        )
        self.assertEqual(budget.monthly_limit, Decimal("8000.00"))

        # Setup account for transactions
        acct = Account(
            id=uuid.uuid4(),
            user_id=self.test_user_id,
            bank_id=self.bank.id,
            name="Spending Account",
            classification=AccountClassification.ASSET,
            subtype=AccountSubtype.SAVINGS,
            balance=Decimal("100000.00")
        )
        self.db.add(acct)
        self.db.commit()

        # 2. Simulate Month 1 (e.g. 2026-07) with spend of ₹5,000 (leaving ₹3,000 unspent)
        tx_m1 = Transaction(
            user_id=self.test_user_id,
            account_id=acct.id,
            date=date(2026, 7, 10),
            raw_narration="ZOMATO ORDER",
            description="Zomato",
            category="Dining",
            transaction_type=TransactionType.EXPENSE,
            amount=Decimal("-5000.00"),
            is_excluded_from_spending=False
        )
        self.db.add(tx_m1)
        self.db.commit()

        status_m1 = get_or_create_monthly_budget_status(self.db, self.test_user_id, 2026, 7)
        cat_m1 = status_m1["categories"][0]
        self.assertEqual(cat_m1["base_limit"], 8000.00)
        self.assertEqual(cat_m1["spent_amount"], 5000.00)
        self.assertEqual(cat_m1["remaining_balance"], 3000.00)
        self.assertFalse(cat_m1["is_overrun"])

        # 3. Simulate Month 2 (2026-08):
        # Effective limit should be Base (₹8,000) + Rollover Surplus (₹3,000) = ₹11,000
        status_m2_initial = get_or_create_monthly_budget_status(self.db, self.test_user_id, 2026, 8)
        cat_m2 = status_m2_initial["categories"][0]
        self.assertEqual(cat_m2["base_limit"], 8000.00)
        self.assertEqual(cat_m2["rollover_in"], 3000.00)
        self.assertEqual(cat_m2["effective_limit"], 11000.00)
        self.assertEqual(cat_m2["spent_amount"], 0.00)
        self.assertEqual(cat_m2["remaining_balance"], 11000.00)

        # 4. Now simulate spend of ₹12,000 in Month 2 (exceeds ₹11,000 limit)
        tx_m2 = Transaction(
            user_id=self.test_user_id,
            account_id=acct.id,
            date=date(2026, 8, 15),
            raw_narration="FINE DINING",
            description="Restaurant",
            category="Dining",
            transaction_type=TransactionType.EXPENSE,
            amount=Decimal("-12000.00"),
            is_excluded_from_spending=False
        )
        self.db.add(tx_m2)
        self.db.commit()

        status_m2_spent = get_or_create_monthly_budget_status(self.db, self.test_user_id, 2026, 8)
        cat_m2_spent = status_m2_spent["categories"][0]
        self.assertEqual(cat_m2_spent["spent_amount"], 12000.00)
        self.assertEqual(cat_m2_spent["remaining_balance"], -1000.00)
        self.assertTrue(cat_m2_spent["is_overrun"])
        self.assertGreater(cat_m2_spent["utilization_percentage"], 100.0)

        # Clean up budget
        delete_envelope_budget(self.db, self.test_user_id, budget.id)

    # =========================================================================
    # PHASE 3: PIGGY BANK VIRTUAL ALLOCATIONS TESTS
    # =========================================================================
    def test_piggy_bank_virtual_allocations(self):
        """Tests virtual sub-goal allocation and spendable balance constraint."""
        # 1. Setup liquid account with balance ₹1,00,000
        acct = Account(
            id=uuid.uuid4(),
            user_id=self.test_user_id,
            bank_id=self.bank.id,
            name="Primary Savings",
            classification=AccountClassification.ASSET,
            subtype=AccountSubtype.SAVINGS,
            balance=Decimal("100000.00")
        )
        goal = FinancialGoal(
            id=uuid.uuid4(),
            user_id=self.test_user_id,
            name="Japan Trip 2027",
            category="VACATION",
            target_amount=Decimal("250000.00"),
            current_amount=Decimal("0.00")
        )
        self.db.add_all([acct, goal])
        self.db.commit()

        # Initial breakdown
        bd0 = get_account_virtual_allocation_breakdown(self.db, acct.id)
        self.assertEqual(bd0["total_balance"], 100000.00)
        self.assertEqual(bd0["goal_locked_amount"], 0.00)
        self.assertEqual(bd0["spendable_balance"], 100000.00)

        # 2. Allocate ₹35,000 to goal
        res_alloc = allocate_funds_to_goal(
            db=self.db,
            user_id=self.test_user_id,
            goal_id=goal.id,
            account_id=acct.id,
            amount=Decimal("35000.00"),
            notes="Initial seed allocation"
        )
        self.assertEqual(res_alloc["goal_current_amount"], 35000.00)
        self.assertEqual(res_alloc["account_breakdown"]["goal_locked_amount"], 35000.00)
        self.assertEqual(res_alloc["account_breakdown"]["spendable_balance"], 65000.00)

        # Model property check
        self.db.refresh(acct)
        self.assertEqual(acct.spendable_balance, Decimal("65000.00"))
        self.assertEqual(acct.goal_locked_amount, Decimal("35000.00"))

        # 3. Guardrail test: try allocating ₹80,000 when only ₹65,000 spendable
        with self.assertRaises(HTTPException) as ctx:
            allocate_funds_to_goal(
                db=self.db,
                user_id=self.test_user_id,
                goal_id=goal.id,
                account_id=acct.id,
                amount=Decimal("80000.00")
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Insufficient spendable balance", ctx.exception.detail)

        # 4. Release ₹10,000 back to spendable balance
        res_rel = release_funds_from_goal(
            db=self.db,
            user_id=self.test_user_id,
            goal_id=goal.id,
            amount=Decimal("10000.00")
        )
        self.assertEqual(res_rel["goal_current_amount"], 25000.00)
        self.assertEqual(res_rel["account_breakdown"]["spendable_balance"], 75000.00)
        self.assertEqual(res_rel["account_breakdown"]["goal_locked_amount"], 25000.00)

    # =========================================================================
    # PHASE 4: WEBHOOK DISPATCHER TESTS
    # =========================================================================
    def test_webhook_registration_and_signing(self):
        """Tests webhook registration, HMAC-SHA256 signing, and delivery logging."""
        # 1. Register Webhook
        endpoint = register_webhook_endpoint(
            db=self.db,
            user_id=self.test_user_id,
            url="https://mock.wiseraman.local/api/notifications",
            secret="super-secret-key-123",
            description="Home Assistant Automation",
            subscribed_events=[WebhookEventType.TRANSFER_COMPLETED.value, WebhookEventType.TEST_PING.value]
        )
        self.assertIsNotNone(endpoint.id)
        self.assertEqual(endpoint.secret, "super-secret-key-123")

        # 2. Test HMAC-SHA256 signature verification
        payload = b'{"event":"TEST_PING","data":{"message":"hello"}}'
        sig = sign_payload("super-secret-key-123", payload)
        self.assertTrue(len(sig) == 64) # SHA256 hex length

        # 3. Test send_test_ping (will record delivery failure gracefully due to mock URL)
        ping_res = send_test_ping(self.db, self.test_user_id, endpoint.id)
        self.assertEqual(ping_res["endpoint_id"], str(endpoint.id))

        # Verify delivery log was written to database
        delivery = self.db.query(WebhookDelivery).filter(WebhookDelivery.webhook_id == endpoint.id).first()
        self.assertIsNotNone(delivery)
        self.assertEqual(delivery.event_type, WebhookEventType.TEST_PING.value)
        self.assertIn("WiseRaman Webhook Ping Test", delivery.payload)

if __name__ == "__main__":
    unittest.main()
