import sys
from decimal import Decimal
from app.database import SessionLocal
from app.models import Bank, Account, Transaction, AccountSubtype, AccountClassification

def run():
    db = SessionLocal()
    try:
        # 1. Create or get Archive Bank
        archive_bank = db.query(Bank).filter(Bank.name == "Historical Archive").first()
        if not archive_bank:
            archive_bank = Bank(name="Historical Archive")
            db.add(archive_bank)
            db.commit()
            db.refresh(archive_bank)
            print(f"Created Bank: {archive_bank.name}")

        # 2. Create or get Archive Account
        archive_account = db.query(Account).filter(Account.name == "Axio/Walnut Archive (2016-2021)").first()
        if not archive_account:
            archive_account = Account(
                bank_id=archive_bank.id,
                name="Axio/Walnut Archive (2016-2021)",
                classification=AccountClassification.ASSET,
                subtype=AccountSubtype.SAVINGS,
                account_number_masked="ARCHIVE",
                balance=Decimal("0.00")
            )
            db.add(archive_account)
            db.commit()
            db.refresh(archive_account)
            print(f"Created Account: {archive_account.name} (ID: {archive_account.id})")

        # 3. Find all 2,289 legacy transactions
        legacy_txs = db.query(Transaction).filter(Transaction.created_at >= '2026-08-20 16:00:00').all()
        print(f"Found {len(legacy_txs)} legacy transactions to reassign...")

        # 4. Reassign account_id and mark is_excluded_from_spending = True so they don't break active metrics
        for tx in legacy_txs:
            tx.account_id = archive_account.id
            tx.is_excluded_from_spending = True

        db.commit()
        print(f"Successfully moved {len(legacy_txs)} transactions to {archive_account.name}!")

        # 5. Clean up temporary Cash Spends account if empty
        cash_acc = db.query(Account).filter(Account.name == "Cash Spends").first()
        if cash_acc:
            remaining_cash_txs = db.query(Transaction).filter(Transaction.account_id == cash_acc.id).count()
            if remaining_cash_txs == 0:
                db.delete(cash_acc)
                db.commit()
                print("Removed empty temporary 'Cash Spends' account.")

        cash_bank = db.query(Bank).filter(Bank.name == "Cash/Wallet").first()
        if cash_bank:
            acc_count = db.query(Account).filter(Account.bank_id == cash_bank.id).count()
            if acc_count == 0:
                db.delete(cash_bank)
                db.commit()
                print("Removed empty temporary 'Cash/Wallet' bank.")

        # 6. Print summary of all accounts
        print("\n--- Current Account Status ---")
        for acc in db.query(Account).all():
            tx_count = db.query(Transaction).filter(Transaction.account_id == acc.id).count()
            print(f"Account: {acc.name} ({acc.subtype}) | Balance: ₹{acc.balance} | Verified Txs: {tx_count}")

    except Exception as e:
        db.rollback()
        print(f"Error during migration: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run()
