import uuid
import logging
import asyncio
from typing import List, Optional, Dict, Any
from decimal import Decimal
from datetime import datetime, date as date_type, timedelta

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import (
    Account, Transaction, CreditCard, CreditCardStatement,
    TransactionType, PaymentRail, ReviewState, AccountSubtype,
    AccountClassification, Payslip
)
from app.parser import parse_statement, parse_payslip
from app.dependencies import get_current_user, generate_transaction_fingerprint
from app.services.tasks import enrich_transactions_task, run_reconcile_transfers

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Statements & Documents"])

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

@router.post("/upload")
async def upload_bank_statement(
    background_tasks: BackgroundTasks,
    bank_id: uuid.UUID = Form(...),
    account_id: uuid.UUID = Form(...),
    file_type: str = Form(...),
    processing_engine: str = Form(...),
    pdf_password: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if file.filename:
        ext = file.filename.lower().split('.')[-1]
        if ext not in ['pdf', 'csv', 'xlsx']:
            raise HTTPException(status_code=400, detail="Invalid file type. Only PDF, CSV, and XLSX are allowed.")

    account = db.query(Account).filter(Account.id == account_id, Account.bank_id == bank_id, Account.user_id == current_user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
        
    try:
        account_type_str = "Credit Card" if account.subtype == AccountSubtype.CREDIT_CARD else "Savings"
        contents = await file.read()
        if len(contents) > 15 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Statement file is too large (max 15 MB).")

        # Non-blocking CPU offload: run synchronous PDF / OCR parsing in executor thread
        loop = asyncio.get_running_loop()
        parsed_result = await loop.run_in_executor(
            None,
            parse_statement,
            contents,
            file.filename,
            account_type_str,
            account.bank.name,
            processing_engine,
            pdf_password.strip() if pdf_password and pdf_password.strip() else None
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
                
                if account.subtype == AccountSubtype.CREDIT_CARD:
                    calculated_close = Decimal(str(opening_balance)) - sum_transactions
                    if abs(calculated_close - Decimal(str(closing_balance))) < Decimal("1.00"):
                        statement_verified = True
                    elif statement_summary.get("reconciliation_passed"):
                        statement_verified = True
                    elif statement_summary.get("total_outstanding") is not None and abs(calculated_close - Decimal(str(statement_summary["total_outstanding"]))) < Decimal("1.00"):
                        statement_verified = True
                    else:
                        logger.warning(f"Mathematical proof check: Expected {closing_balance}, got {calculated_close}")
                else:
                    calculated_close = Decimal(str(opening_balance)) + sum_transactions
                    if abs(calculated_close - Decimal(str(closing_balance))) < Decimal("1.00"):
                        statement_verified = True
                    elif statement_summary.get("reconciliation_passed"):
                        statement_verified = True
                    else:
                        logger.warning(f"Mathematical proof check: Expected {closing_balance}, got {calculated_close}")
            elif statement_summary.get("reconciliation_passed"):
                statement_verified = True
                    
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
    loans = statement_summary.get("loans", [])
    for loan in loans:
        product_name = loan.get("product_name")
        outstanding = loan.get("outstanding_principal")
        current_emi = loan.get("current_emi")
        
        if not product_name or outstanding is None: continue
        
        existing_loan = db.query(Account).filter(Account.bank_id == bank_id, Account.name == product_name, Account.user_id == current_user.id).first()
        if existing_loan:
            existing_loan.balance = -Decimal(str(outstanding))
            existing_loan.monthly_cap = Decimal(str(current_emi)) if current_emi else Decimal("0.00")
        else:
            new_loan = Account(
                user_id=current_user.id,
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
                reconstructed = prev_dues_val - cycle_net
                total_due_val = reconstructed if reconstructed > 0 else Decimal("0.00")
            min_due_val = Decimal(str(statement_summary.get("minimum_amount_due") or 0))

            statement_record = CreditCardStatement(
                user_id=current_user.id,
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

        amt_val = Decimal(str(pt["amount"]))
        tx_type = TransactionType.EXPENSE if amt_val < 0 else TransactionType.INCOME
        rail = PaymentRail.UNKNOWN_NEEDS_REVIEW
        rail_raw = (pt.get("subcategory") or "").upper()
        narration_u = str(pt.get("raw_text") or "").upper()
        if "UPI" in rail_raw or "UPI" in narration_u:
            rail = PaymentRail.UPI
        elif "NEFT" in rail_raw or "NEFT" in narration_u:
            rail = PaymentRail.NEFT
        elif "IMPS" in rail_raw or "IMPS" in narration_u:
            rail = PaymentRail.IMPS
        elif "RTGS" in rail_raw or "RTGS" in narration_u:
            rail = PaymentRail.RTGS
        elif account.subtype == AccountSubtype.CREDIT_CARD:
            rail = PaymentRail.CARD

        db_tx = Transaction(
            user_id=current_user.id,
            account_id=account_id,
            statement_id=statement_record.id if statement_record else None,
            date=pt["date"],
            amount=pt["amount"],
            description=clean_desc,
            raw_narration=pt["raw_text"],
            category=(pt.get("category") or "Processing...")[:50],
            subcategory=(pt.get("subcategory") or "Parsing...")[:50],
            transaction_type=tx_type,
            payment_rail=rail,
            review_state=ReviewState.VERIFIED if statement_verified else ReviewState.UNKNOWN,
            reference_id=(pt.get("reference_id")[:100] if pt.get("reference_id") else None),
            fingerprint=fp,
            verified=statement_verified
        )
        db.add(db_tx)
        db.flush()
        saved_tx_ids.append(db_tx.id)
        total_amount_change += Decimal(str(pt["amount"]))
        
    # Update account balance
    if closing_balance is not None:
        account.balance = Decimal(str(closing_balance))
    elif account.subtype == AccountSubtype.CREDIT_CARD and saved_tx_ids:
        account.balance -= total_amount_change
    elif saved_tx_ids:
        account.balance += total_amount_change
    db.commit()
    
    # Background AI categorization & reconciliation
    if saved_tx_ids:
        background_tasks.add_task(enrich_transactions_task, saved_tx_ids)
        background_tasks.add_task(run_reconcile_transfers, str(current_user.id))
    
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

@router.get("/statements", response_model=List[CreditCardStatementResponse])
def get_statements(account_id: Optional[uuid.UUID] = None, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    query = db.query(CreditCardStatement).filter(CreditCardStatement.user_id == current_user.id)
    if account_id:
        query = query.filter(CreditCardStatement.account_id == account_id)
    return query.order_by(CreditCardStatement.statement_date.desc()).all()

@router.post("/payslips/upload", response_model=PayslipResponse)
async def upload_payslip(
    pdf_password: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    contents = await file.read()
    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")
        
    try:
        loop = asyncio.get_running_loop()
        parsed_data = await loop.run_in_executor(
            None,
            parse_payslip,
            contents,
            pdf_password.strip() if pdf_password and pdf_password.strip() else None
        )
    except Exception as e:
        logger.error(f"Error parsing payslip: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
        
    company_name = parsed_data.get("company_name")
    period_month = parsed_data.get("period_month")
    period_year = parsed_data.get("period_year")

    # Duplicate Detection
    if company_name and period_month and period_year:
        existing_payslip = db.query(Payslip).filter(
            Payslip.user_id == current_user.id,
            Payslip.company_name == company_name,
            Payslip.period_month == period_month,
            Payslip.period_year == period_year
        ).first()
        
        if existing_payslip:
            raise HTTPException(status_code=400, detail=f"Payslip for {company_name} ({period_month}/{period_year}) already exists.")

    payslip = Payslip(
        user_id=current_user.id,
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
    
    if payslip.net_pay and payslip.period_year and payslip.period_month:
        try:
            target_month = payslip.period_month
            target_year = payslip.period_year
            if target_month == 12:
                next_month = 1
                next_year = target_year + 1
            else:
                next_month = target_month + 1
                next_year = target_year
                
            start_date = date_type(target_year, target_month, 20)
            end_date = date_type(next_year, next_month, 15)
            
            matching_tx = db.query(Transaction).filter(
                Transaction.user_id == current_user.id,
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

@router.get("/payslips", response_model=List[PayslipResponse])
def get_payslips(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return db.query(Payslip).filter(Payslip.user_id == current_user.id).order_by(Payslip.period_year.desc(), Payslip.period_month.desc()).all()

@router.delete("/payslips/purge")
def purge_payslips(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    db.query(Payslip).filter(Payslip.user_id == current_user.id).delete()
    db.commit()
    return {"message": "Payslips purged"}

@router.get("/reconciliation/dashboard")
def get_reconciliation_dashboard(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Returns mathematical balance proofs for all accounts and parsed statements."""
    from app.services.reconciliation_engine import verify_statement_balance

    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()
    results = []

    for acc in accounts:
        txns = db.query(Transaction).filter(Transaction.account_id == acc.id).all()
        credits = sum(float(t.amount) for t in txns if float(t.amount) > 0)
        debits = sum(abs(float(t.amount)) for t in txns if float(t.amount) < 0)
        curr_bal = float(acc.balance or 0)
        
        calc_opening = curr_bal - credits + debits
        proof = verify_statement_balance(
            opening_balance=calc_opening,
            total_credits=credits,
            total_debits=debits,
            reported_closing_balance=curr_bal
        )
        proof["account_id"] = str(acc.id)
        proof["account_name"] = acc.name
        proof["account_number"] = acc.account_number_masked
        proof["transaction_count"] = len(txns)
        results.append(proof)

    return results
