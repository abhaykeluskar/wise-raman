import unittest
import uuid
from decimal import Decimal
from datetime import date, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    Base, User, Bank, Account, Transaction, TransferLink,
    FinancialEvent, FinancialEventType, TransactionType, PaymentRail,
    ReviewState, AccountClassification, AccountSubtype, AccountVisibility
)
from app.services.transfers import (
    link_existing_transactions, edit_transfer_link, unlink_transactions,
    find_payment_match_candidates
)
from app.services.reconciliation import reconcile_transfers

class TestCreditCardPaymentLinking(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Use an in-memory SQLite database for fast unit testing
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.Session()
        # Seed test user
        self.user = User(
            id=uuid.uuid4(),
            email=f"tester_{uuid.uuid4().hex[:6]}@example.com",
            password_hash="hashed_pw"
        )
        self.db.add(self.user)
        self.db.commit()

        # Seed bank
        self.bank = Bank(id=uuid.uuid4(), name=f"HDFC Bank {uuid.uuid4().hex[:4]}")
        self.db.add(self.bank)
        self.db.commit()

        # Seed Savings Account
        self.savings = Account(
            id=uuid.uuid4(),
            user_id=self.user.id,
            bank_id=self.bank.id,
            name="HDFC Salary Account",
            classification=AccountClassification.ASSET,
            subtype=AccountSubtype.SAVINGS,
            visibility=AccountVisibility.HOUSEHOLD,
            balance=Decimal("50000.00")
        )
        # Seed Credit Card Account
        self.credit_card = Account(
            id=uuid.uuid4(),
            user_id=self.user.id,
            bank_id=self.bank.id,
            name="HDFC Regalia Credit Card",
            classification=AccountClassification.LIABILITY,
            subtype=AccountSubtype.CREDIT_CARD,
            visibility=AccountVisibility.HOUSEHOLD,
            balance=Decimal("15000.00") # Outstanding debt
        )
        self.db.add_all([self.savings, self.credit_card])
        self.db.commit()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def test_manual_link_cc_payment_success(self):
        """Test manually linking bank outflow and credit card payment inflow."""
        # 1. Bank outflow: paid 12,000 to card
        bank_tx = Transaction(
            id=uuid.uuid4(),
            user_id=self.user.id,
            account_id=self.savings.id,
            date=date(2026, 8, 10),
            amount=Decimal("-12000.00"),
            description="AUTOPAY HDFC CC PAYMENT",
            raw_narration="AUTOPAY HDFC CC PAYMENT REF12345",
            transaction_type=TransactionType.EXPENSE,
            is_excluded_from_spending=False
        )
        # 2. Credit Card inflow: payment received 12,000
        cc_tx = Transaction(
            id=uuid.uuid4(),
            user_id=self.user.id,
            account_id=self.credit_card.id,
            date=date(2026, 8, 12),
            amount=Decimal("12000.00"),
            description="PAYMENT RECEIVED - THANK YOU",
            raw_narration="PAYMENT RECEIVED VIA IMPS REF12345",
            transaction_type=TransactionType.INCOME,
            is_excluded_from_spending=False
        )
        self.db.add_all([bank_tx, cc_tx])
        self.db.commit()

        initial_savings_bal = self.savings.balance
        initial_cc_bal = self.credit_card.balance

        # Link them
        link = link_existing_transactions(
            db=self.db,
            user_id=self.user.id,
            from_transaction_id=bank_tx.id,
            to_transaction_id=cc_tx.id
        )

        self.assertIsNotNone(link)
        self.assertEqual(link.amount, Decimal("12000.00"))
        self.assertEqual(link.from_transaction_id, bank_tx.id)
        self.assertEqual(link.to_transaction_id, cc_tx.id)

        # Invariant 1: Balances must NOT be altered on linking statement transactions
        self.assertEqual(self.savings.balance, initial_savings_bal)
        self.assertEqual(self.credit_card.balance, initial_cc_bal)

        # Invariant 2: Both legs excluded from spending
        self.assertTrue(bank_tx.is_excluded_from_spending)
        self.assertTrue(cc_tx.is_excluded_from_spending)

        # Invariant 3: Transaction types set to CC_BILL_PAYMENT and CC_PAYMENT_RECEIVED
        self.assertEqual(bank_tx.transaction_type, TransactionType.CC_BILL_PAYMENT)
        self.assertEqual(cc_tx.transaction_type, TransactionType.CC_PAYMENT_RECEIVED)

        # Invariant 4: Bound to a CARD_PAYMENT FinancialEvent with economic impact 0
        fe = self.db.query(FinancialEvent).filter(FinancialEvent.id == bank_tx.financial_event_id).first()
        self.assertIsNotNone(fe)
        self.assertEqual(fe.event_type, FinancialEventType.CARD_PAYMENT)
        self.assertEqual(fe.economic_amount, Decimal("0.00"))
        self.assertEqual(cc_tx.financial_event_id, fe.id)

        # Invariant 5: Relationship helper properties work
        self.assertEqual(bank_tx.counterpart_transaction.id, cc_tx.id)
        self.assertEqual(cc_tx.counterpart_transaction.id, bank_tx.id)
        self.assertEqual(bank_tx.transfer_link_id, link.id)

    def test_unlink_restores_classification_without_deleting_tx(self):
        """Test safely deleting a link (unlinking) preserves transactions and balances."""
        bank_tx = Transaction(
            id=uuid.uuid4(),
            user_id=self.user.id,
            account_id=self.savings.id,
            date=date(2026, 8, 10),
            amount=Decimal("-5000.00"),
            description="CRED CC PAYMENT",
            raw_narration="CRED CC PAYMENT",
            transaction_type=TransactionType.EXPENSE,
            is_excluded_from_spending=False
        )
        cc_tx = Transaction(
            id=uuid.uuid4(),
            user_id=self.user.id,
            account_id=self.credit_card.id,
            date=date(2026, 8, 11),
            amount=Decimal("5000.00"),
            description="PAYMENT RECEIVED",
            raw_narration="PAYMENT RECEIVED",
            transaction_type=TransactionType.INCOME,
            is_excluded_from_spending=False
        )
        self.db.add_all([bank_tx, cc_tx])
        self.db.commit()

        link = link_existing_transactions(
            db=self.db,
            user_id=self.user.id,
            from_transaction_id=bank_tx.id,
            to_transaction_id=cc_tx.id
        )
        link_id = link.id

        # Unlink them
        res = unlink_transactions(self.db, self.user.id, link_id)
        self.assertIn("successfully unlinked", res["message"])

        # Check that TransferLink record is deleted
        deleted_link = self.db.query(TransferLink).filter(TransferLink.id == link_id).first()
        self.assertIsNone(deleted_link)

        # Invariant: Both transactions still exist
        check_bank = self.db.query(Transaction).filter(Transaction.id == bank_tx.id).first()
        check_cc = self.db.query(Transaction).filter(Transaction.id == cc_tx.id).first()
        self.assertIsNotNone(check_bank)
        self.assertIsNotNone(check_cc)

        # Invariant: Spending exclusion cleared
        self.assertFalse(check_bank.is_excluded_from_spending)
        self.assertFalse(check_cc.is_excluded_from_spending)

        # Invariant: Transaction types restored
        self.assertEqual(check_bank.transaction_type, TransactionType.EXPENSE)
        self.assertEqual(check_cc.transaction_type, TransactionType.INCOME)
        self.assertIsNone(check_bank.financial_event_id)

    def test_edit_transfer_link_counterpart_swap(self):
        """Test manually editing a link by swapping the counterpart transaction."""
        bank_tx = Transaction(
            id=uuid.uuid4(),
            user_id=self.user.id,
            account_id=self.savings.id,
            date=date(2026, 8, 10),
            amount=Decimal("-8000.00"),
            description="CC PAYMENT",
            raw_narration="CC PAYMENT",
            transaction_type=TransactionType.EXPENSE
        )
        wrong_cc_tx = Transaction(
            id=uuid.uuid4(),
            user_id=self.user.id,
            account_id=self.credit_card.id,
            date=date(2026, 8, 10),
            amount=Decimal("8000.00"),
            description="WRONG CC PAYMENT",
            raw_narration="WRONG CC PAYMENT",
            transaction_type=TransactionType.INCOME
        )
        correct_cc_tx = Transaction(
            id=uuid.uuid4(),
            user_id=self.user.id,
            account_id=self.credit_card.id,
            date=date(2026, 8, 11),
            amount=Decimal("8000.00"),
            description="CORRECT CC PAYMENT",
            raw_narration="CORRECT CC PAYMENT",
            transaction_type=TransactionType.INCOME
        )
        self.db.add_all([bank_tx, wrong_cc_tx, correct_cc_tx])
        self.db.commit()

        link = link_existing_transactions(
            db=self.db,
            user_id=self.user.id,
            from_transaction_id=bank_tx.id,
            to_transaction_id=wrong_cc_tx.id
        )

        # Edit link to point to correct_cc_tx instead of wrong_cc_tx
        edit_res = edit_transfer_link(
            db=self.db,
            user_id=self.user.id,
            transfer_link_id=link.id,
            current_transaction_id=bank_tx.id,
            new_counterpart_transaction_id=correct_cc_tx.id
        )
        self.assertIn("successfully updated", edit_res["message"])

        # Check old counterpart restored
        self.assertFalse(wrong_cc_tx.is_excluded_from_spending)
        self.assertEqual(wrong_cc_tx.transaction_type, TransactionType.INCOME)

        # Check new counterpart linked
        self.assertTrue(correct_cc_tx.is_excluded_from_spending)
        self.assertEqual(correct_cc_tx.transaction_type, TransactionType.CC_PAYMENT_RECEIVED)
        self.assertEqual(link.to_transaction_id, correct_cc_tx.id)

    def test_candidate_scoring(self):
        """Test candidate counterpart scoring based on amount, date, and keywords."""
        source_tx = Transaction(
            id=uuid.uuid4(),
            user_id=self.user.id,
            account_id=self.savings.id,
            date=date(2026, 8, 10),
            amount=Decimal("-15000.00"),
            description="HDFC CC BILL PAYMENT VIA CRED",
            raw_narration="HDFC CC BILL PAYMENT VIA CRED REF999",
            reference_id="REF999"
        )
        # Candidate 1: High match (Exact amount, CC account, 2 days apart, matching ref, keyword match)
        cand_perfect = Transaction(
            id=uuid.uuid4(),
            user_id=self.user.id,
            account_id=self.credit_card.id,
            date=date(2026, 8, 12),
            amount=Decimal("15000.00"),
            description="PAYMENT RECEIVED",
            raw_narration="PAYMENT RECEIVED REF999",
            reference_id="REF999"
        )
        # Candidate 2: Different amount and far away date
        cand_weak = Transaction(
            id=uuid.uuid4(),
            user_id=self.user.id,
            account_id=self.credit_card.id,
            date=date(2026, 8, 25),
            amount=Decimal("3000.00"),
            description="SOME REFUND",
            raw_narration="SOME REFUND"
        )
        self.db.add_all([source_tx, cand_perfect, cand_weak])
        self.db.commit()

        candidates = find_payment_match_candidates(self.db, self.user.id, source_tx.id)
        self.assertGreaterEqual(len(candidates), 1)
        top_match = candidates[0]
        self.assertEqual(top_match["transaction_id"], str(cand_perfect.id))
        self.assertEqual(top_match["confidence_tier"], "HIGH")
        self.assertGreaterEqual(top_match["score"], 80)

    def test_auto_reconciliation_credit_card(self):
        """Test auto reconciliation engine matches CC payment up to 7 days."""
        bank_tx = Transaction(
            id=uuid.uuid4(),
            user_id=self.user.id,
            account_id=self.savings.id,
            date=date(2026, 8, 5),
            amount=Decimal("-7500.00"),
            description="BILLDESK CREDIT CARD",
            raw_narration="BILLDESK CREDIT CARD",
            is_excluded_from_spending=False
        )
        cc_tx = Transaction(
            id=uuid.uuid4(),
            user_id=self.user.id,
            account_id=self.credit_card.id,
            date=date(2026, 8, 10), # 5 days later
            amount=Decimal("7500.00"),
            description="PAYMENT RECEIVED",
            raw_narration="PAYMENT RECEIVED",
            is_excluded_from_spending=False
        )
        self.db.add_all([bank_tx, cc_tx])
        self.db.commit()

        created = reconcile_transfers(self.db, str(self.user.id))
        self.assertGreaterEqual(created, 1)

        self.assertTrue(bank_tx.is_excluded_from_spending)
        self.assertTrue(cc_tx.is_excluded_from_spending)
        self.assertEqual(bank_tx.transaction_type, TransactionType.CC_BILL_PAYMENT)
        self.assertEqual(cc_tx.transaction_type, TransactionType.CC_PAYMENT_RECEIVED)

if __name__ == "__main__":
    unittest.main()
