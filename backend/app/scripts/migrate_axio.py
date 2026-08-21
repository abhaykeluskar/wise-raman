import csv
import sys
import hashlib
from datetime import datetime
from decimal import Decimal
from app.database import SessionLocal
from app.models import Bank, Account, Category, Transaction, AccountSubtype, AccountClassification

def generate_fingerprint(account_id, date, amount, description):
    date_str = date.isoformat() if hasattr(date, 'isoformat') else str(date)
    amount_str = f"{amount:.2f}"
    raw = f"{account_id}|{date_str}|{amount_str}|{description}"
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()

def migrate(csv_file):
    db = SessionLocal()
    
    # Ensure Cash Bank and Account exist
    cash_bank = db.query(Bank).filter(Bank.name == "Cash/Wallet").first()
    if not cash_bank:
        cash_bank = Bank(name="Cash/Wallet")
        db.add(cash_bank)
        db.commit()
    
    cash_account = db.query(Account).filter(Account.name == "Cash Spends").first()
    if not cash_account:
        cash_account = Account(
            bank_id=cash_bank.id,
            name="Cash Spends",
            classification=AccountClassification.ASSET,
            subtype=AccountSubtype.SAVINGS,
            account_number_masked="CASH",
            balance=0
        )
        db.add(cash_account)
        db.commit()

    all_accounts = db.query(Account).all()
    all_categories = db.query(Category).all()

    def find_acct(name_hint, number_hint=None):
        for a in all_accounts:
            if name_hint.lower() in a.name.lower():
                return a
            if number_hint and a.account_number_masked and number_hint in a.account_number_masked:
                return a
        return None

    target_accounts = {
        "HDFC_SAVINGS": find_acct("50100017437788"), 
        "SBI_SAVINGS": find_acct("42084543345"),
        "FEDERAL_CC": find_acct("Federal OneCard"),
        "HDFC_CC": find_acct("HDFC Tata Neu Plus"),
        "AXIS_CC": find_acct("Airtel Axis"),
        "SBI_CC": find_acct("SBI Cashback"),
        "CASH": cash_account
    }

    ACCOUNT_MAP = {
        "HDFC  7788": target_accounts["HDFC_SAVINGS"],
        "HDFC debit 6876": target_accounts["HDFC_SAVINGS"],
        "HDFC debit 9667": target_accounts["HDFC_SAVINGS"],
        "HDFC  XXXX": target_accounts["HDFC_SAVINGS"],
        "SBI  3345": target_accounts["SBI_SAVINGS"],
        "One Card credit XXXX": target_accounts["FEDERAL_CC"],
        "One Card credit 7594": target_accounts["FEDERAL_CC"],
        "HDFC credit 1648": target_accounts["HDFC_CC"],
        "HDFC credit 48": target_accounts["HDFC_CC"],
        "Axis credit 0492": target_accounts["AXIS_CC"],
        "SBI credit 9409": target_accounts["SBI_CC"],
        "SBI credit XXXX": target_accounts["SBI_CC"],
        "CASH Spends": target_accounts["CASH"]
    }

    def find_cat(name):
        for c in all_categories:
            if c.name.lower() == name.lower():
                return c
        return None

    db_cat_map = {
        "Dining": find_cat("Dining"),
        "Utilities": find_cat("Utilities"),
        "Shopping": find_cat("Shopping"),
        "Entertainment": find_cat("Entertainment"),
        "Healthcare": find_cat("Healthcare"),
        "Fuel": find_cat("Fuel"),
        "Groceries": find_cat("Groceries"),
        "Travel": find_cat("Travel"),
        "Investment": find_cat("Investment"),
        "Salary/Income": find_cat("Salary/Income"),
        "Game": find_cat("Game"),
        "Repayments": find_cat("Repayments"),
        "Transfer": find_cat("Transfer"),
        "Others": find_cat("Others"),
    }
    
    CAT_MAPPING = {
        "FOOD & DRINKS": db_cat_map["Dining"],
        "BILLS": db_cat_map["Utilities"],
        "💡UTILITIES": db_cat_map["Utilities"],
        "SHOPPING": db_cat_map["Shopping"],
        "ITEMS": db_cat_map["Shopping"],
        "ENTERTAINMENT": db_cat_map["Entertainment"],
        "HEALTH": db_cat_map["Healthcare"],
        "FUEL": db_cat_map["Fuel"],
        "GROCERIES": db_cat_map["Groceries"],
        "TRAVEL": db_cat_map["Travel"],
        "INVESTMENT": db_cat_map["Investment"],
        "SALARY": db_cat_map["Salary/Income"],
        "🎮 GAME": db_cat_map["Game"],
        "BILL PAYMENT": db_cat_map["Repayments"],
        "TRANSFER": db_cat_map["Transfer"],
        "ACCOUNT TRANSFER": db_cat_map["Transfer"],
        "CREDIT": db_cat_map["Transfer"],
        "UNKNOWN": db_cat_map["Others"],
        "OTHER": db_cat_map["Others"],
        "REFUND": db_cat_map["Others"],
        "REWARDS": db_cat_map["Others"],
        "GOVERMENT WORK": db_cat_map["Others"],
        "": db_cat_map["Others"]
    }

    success = 0
    skipped = 0
    errors = 0

    with open(csv_file, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.reader(f)
        
        for row in reader:
            if len(row) > 0 and row[0] == "DATE":
                break
        
        for row in reader:
            if not row or len(row) < 11:
                continue
                
            date_str = row[0]
            if not date_str:
                continue
                
            time_str = row[1]
            place = row[2]
            amount_str = row[3]
            drcr = row[4]
            account_str = row[5]
            category_str = row[8]
            tags = row[9]
            note = row[10]

            try:
                dt_str = f"{date_str} {time_str}"
                dt = datetime.strptime(dt_str, "%Y-%m-%d %I:%M %p")
            except ValueError:
                try:
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                except ValueError:
                    errors += 1
                    continue

            try:
                amount_clean = amount_str.replace(',', '')
                amount_val = Decimal(amount_clean)
                if drcr.upper() == "DR":
                    amount_val = -amount_val
            except Exception:
                errors += 1
                continue

            desc = place
            if note:
                desc += f" | {note}"
            if tags:
                desc += f" | {tags}"

            target_acct = ACCOUNT_MAP.get(account_str)
            if not target_acct:
                print(f"Skipping unknown account: {account_str}")
                errors += 1
                continue

            target_cat = CAT_MAPPING.get(category_str, db_cat_map["Others"])
            cat_id = target_cat.id if target_cat else None

            fp = generate_fingerprint(
                account_id=str(target_acct.id),
                date=dt,
                amount=amount_val,
                description=desc
            )

            existing = db.query(Transaction).filter(Transaction.fingerprint == fp).first()
            if existing:
                skipped += 1
                continue

            tx = Transaction(
                account_id=target_acct.id,
                date=dt,
                amount=amount_val,
                description=desc,
                category=target_cat.name if target_cat else "Others",
                raw_text=desc,
                fingerprint=fp,
                transaction_type="EXPENSE" if amount_val < 0 else "INCOME"
            )
            db.add(tx)
            success += 1
            if success % 500 == 0:
                print(f"Inserted {success} rows...")
                db.commit()

        db.commit()

    print(f"Migration Complete: {success} inserted, {skipped} skipped duplicates, {errors} errors.")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        migrate(sys.argv[1])
    else:
        print("Provide CSV file path")
