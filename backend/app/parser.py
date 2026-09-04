import io
import re
import json
import os
from typing import List, Literal, Optional, Dict, Any
import pandas as pd
import pdfplumber
import requests
from datetime import datetime, date
from decimal import Decimal
import logging
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Regex patterns for date parsing
DATE_PATTERNS = [
    (r"\d{2}-\d{2}-\d{4}", "%d-%m-%Y"),
    (r"\d{2}/\d{2}/\d{4}", "%d/%m/%Y"),
    (r"\d{2}-\d{2}-\d{2}", "%d-%m-%y"),
    (r"\d{2}/\d{2}/\d{2}", "%d/%m/%y"),
    (r"\d{4}-\d{2}-\d{2}", "%Y-%m-%d"),
    (r"\d{4}/\d{2}/\d{2}", "%Y/%m/%d"),
    (r"\d{2}\s+[A-Za-z]{3}\s+\d{4}", "%d %b %Y"),
    (r"\d{1,2}\s+[A-Za-z]{3}\s+\d{4}", "%d %b %Y"),
    (r"\d{2}\s+[A-Za-z]{3}\s*'\d{2}", "%d %b '%y"),
    (r"\d{1,2}\s+[A-Za-z]{3}\s*'\d{2}", "%d %b '%y"),
    (r"\d{2}\s+[A-Za-z]{3}\s+\d{2}", "%d %b %y"),
    (r"\d{1,2}\s+[A-Za-z]{3}\s+\d{2}", "%d %b %y"),
    (r"\d{1,2}\s+[A-Za-z]{3,9}\s*,\s*\d{4}", "%d %B, %Y"),
    (r"\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}", "%d %B %Y"),
]

def extract_pdf_pages_text(file_bytes: bytes, password: Optional[str] = None) -> List[str]:
    """
    Extracts text from each PDF page. Supports password-protected PDFs.
    If a page has no selectable font glyphs (vector curves/scanned),
    falls back to rendering and OCR via Tesseract.
    
    Enforces Phase D Sandboxing Limits:
    - Max Size: 15MB
    - Max Pages: 50
    - OCR Timeout: 30s per page
    """
    MAX_FILE_SIZE = 15 * 1024 * 1024
    if len(file_bytes) > MAX_FILE_SIZE:
        raise ValueError("PDF file exceeds 15MB sandboxing limit.")
        
    pages_text = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes), password=password) as pdf:
            if len(pdf.pages) > 50:
                raise ValueError(f"PDF exceeds 50-page sandboxing limit (found {len(pdf.pages)}).")
                
            raw_pages_text = [p.extract_text() or "" for p in pdf.pages]
            total_chars = sum(len(t.strip()) for t in raw_pages_text)
            is_scanned_doc = total_chars < 50 * len(pdf.pages)

            pdf_doc = None
            for idx, t in enumerate(raw_pages_text):
                # Trigger OCR if page is blank AND document as a whole is scanned or mostly image-based
                if len(t.strip()) < 15 and is_scanned_doc:
                    logger.info(f"Page {idx+1} has no embedded font text ({len(t.strip())} chars) in scanned document. Using OCR fallback...")
                    try:
                        import pypdfium2
                        import pytesseract
                        from PIL import ImageEnhance
                        
                        if pdf_doc is None:
                            pdf_doc = pypdfium2.PdfDocument(file_bytes, password=password)
                        pdfium_page = pdf_doc[idx]
                        img = pdfium_page.render(scale=3).to_pil()
                        gray = img.convert('L')
                        enhanced = ImageEnhance.Contrast(gray).enhance(2.0)
                        
                        ocr_t = pytesseract.image_to_string(enhanced, timeout=30)
                        logger.info(f"OCR successfully extracted {len(ocr_t)} characters from page {idx+1}")
                        pages_text.append(ocr_t)
                    except pytesseract.TesseractError as e:
                        logger.error(f"OCR fallback failed on page {idx+1}: {e}")
                        pages_text.append(t)
                    except RuntimeError as e:
                        logger.error(f"OCR fallback timed out after 30s on page {idx+1}: {e}")
                        pages_text.append(t)
                    except Exception as ocr_err:
                        logger.error(f"OCR fallback failed on page {idx+1}: {ocr_err}")
                        pages_text.append(t)
                else:
                    pages_text.append(t)
    except ValueError:
        raise
    except pdfplumber.pdfminer.pdfdocument.PDFPasswordIncorrect:
        raise ValueError("PDF is password-protected. Please provide the correct password.")
    except Exception as e:
        logger.error(f"Error extracting PDF pages: {e}")
        if "password" in str(e).lower():
            raise ValueError("PDF is password-protected or password was incorrect. Please provide the password.")
        raise
    return pages_text

def extract_pdf_tables_safely(file_bytes: bytes, password: Optional[str] = None) -> List[List[List[str]]]:
    """Extracts tables from all pages of a PDF safely using pdfplumber."""
    all_tables = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes), password=password) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                if tables:
                    all_tables.extend(tables)
    except Exception as e:
        logger.warning(f"Could not extract vector tables from PDF: {e}")
    return all_tables

# --- Structured Pydantic Schemas for Lightweight LLM Extraction ---

SpendCategory = Literal[
    "Dining_and_Delivery",
    "Quick_Commerce_and_Grocery",
    "Utilities_and_Telecom",
    "UPI_Partner_Brands",
    "Tech_and_Hardware",
    "Pet_Care",
    "Lifestyle_and_Events",
    "Online_Shopping",
    "Travel_and_Transport",
    "Bank_Charges_and_Interest",
    "Transfers_and_Ignored",
    "Income_and_Refunds"
]

class ExtractedTransaction(BaseModel):
    transaction_date: str = Field(
        description="The transaction date in YYYY-MM-DD format"
    )
    merchant_name: str = Field(
        description="Cleaned, standardized merchant or counterparty name (e.g., 'Swiggy', 'Zomato', 'Airtel')"
    )
    amount: float = Field(
        description="Transaction value. POSITIVE for inflows (credits/refunds), NEGATIVE for outflows (debits/purchases)"
    )
    category: SpendCategory = Field(
        description="Strictly mapped category from the allowed list"
    )
    payment_rail: Literal["UPI", "NEFT", "RTGS", "IMPS", "POS", "BBPS", "UNKNOWN"] = Field(
        default="UNKNOWN",
        description="Underlying Indian payment mechanism"
    )
    is_subscription_or_mandate: bool = Field(
        default=False,
        description="True if transaction is a recurring NACH/BBPS mandate, telecom bill, or subscription"
    )
    raw_reference: Optional[str] = Field(
        default=None, 
        description="UPI Reference / UTR / Cheque number if identifiable"
    )

class StatementExtractionResponse(BaseModel):
    transactions: List[ExtractedTransaction]

def clean_amount(val):
    if pd.isna(val) or val is None:
        return None
    val_str = str(val).strip().replace(",", "").replace("C ", "").replace("c ", "")
    if not val_str:
        return None
    val_clean = re.sub(r"[^\d\.\-]", "", val_str)
    try:
        return Decimal(val_clean)
    except Exception:
        return None

def parse_date_string(date_str):
    if not date_str:
        return None
    date_str = str(date_str).strip().replace("’", "'").replace(",", "")
    for pattern, date_format in DATE_PATTERNS:
        match = re.search(pattern, date_str)
        if match:
            try:
                return datetime.strptime(match.group(), date_format).date()
            except ValueError:
                continue
    return None

TABULAR_EXTS = {"csv", "xls", "xlsx"}

def detect_bank_and_format(filename: str, first_few_lines: List[str]) -> str:
    combined_text = f"{filename or ''}\n" + "\n".join(first_few_lines or [])
    combined_text = combined_text.lower()
    if "hdfc" in combined_text: return "HDFC"
    elif "state bank of india" in combined_text or "sbi" in combined_text: return "SBI"
    elif "axis" in combined_text: return "AXIS"
    elif "federal" in combined_text or "onecard" in combined_text or "one credit card" in combined_text: return "FEDERAL"
    elif "icici" in combined_text: return "ICICI"
    elif "kotak" in combined_text: return "KOTAK"
    elif "baroda" in combined_text or "bob" in combined_text: return "BOB"
    elif "indusind" in combined_text: return "INDUSIND"
    elif "punjab national" in combined_text or "pnb" in combined_text: return "PNB"
    elif "canara" in combined_text: return "CANARA"
    elif "union bank" in combined_text: return "UNION"
    return "GENERIC"

def _norm_col(name) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(name or "").strip().lower()).strip()

def _pick_column(columns, keywords):
    for col in columns:
        n = _norm_col(col)
        if any(k == n or k in n for k in keywords):
            return col
    return None

def _looks_like_txn_table(df) -> bool:
    if df is None or df.empty or len(df.columns) < 2:
        return False
    cols = [_norm_col(c) for c in df.columns]
    has_date = any("date" in c or c in ("txn dt", "tran date") for c in cols)
    has_amt = any(any(k in c for k in ("amount", "debit", "credit", "withdrawal", "deposit", "narration", "particular")) for c in cols)
    return has_date and has_amt

def read_tabular_dataframe(file_bytes: bytes, ext: str):
    ext = (ext or "").lower().lstrip(".")
    if ext in ("xlsx", "xls"):
        engine = "openpyxl" if ext == "xlsx" else "xlrd"
        for header in range(0, 18):
            try:
                df = pd.read_excel(io.BytesIO(file_bytes), engine=engine, header=header)
                df = df.dropna(how="all").dropna(axis=1, how="all")
                if _looks_like_txn_table(df):
                    return df
            except Exception:
                continue
        return None
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        for skip in range(0, 22):
            try:
                df = pd.read_csv(io.BytesIO(file_bytes), encoding=enc, skiprows=skip)
                df = df.dropna(how="all").dropna(axis=1, how="all")
                if _looks_like_txn_table(df):
                    return df
            except Exception:
                continue
    return None

def parse_tabular_statement(file_bytes: bytes, ext: str, account_type="Savings") -> Dict[str, Any]:
    """Parse Indian bank CSV / Excel exports (savings and credit cards)."""
    df = read_tabular_dataframe(file_bytes, ext)
    if df is None:
        return {"transactions": [], "opening_balance": None, "closing_balance": None, "statement_summary": {}}

    cols = list(df.columns)
    date_col = _pick_column(cols, ["transaction date", "txn date", "tran date", "value date", "posting date", "date"])
    desc_col = _pick_column(cols, ["narration", "particulars", "description", "details", "remarks", "merchant", "transaction details", "narration/description"])
    debit_col = _pick_column(cols, ["withdrawal amt", "withdrawal", "debit amount", "debit amt", "withdrawals", "debit"])
    credit_col = _pick_column(cols, ["deposit amt", "deposit", "credit amount", "credit amt", "deposits", "credit"])
    amount_col = _pick_column(cols, ["amount (inr)", "transaction amount", "txn amount", "amount"])
    type_col = _pick_column(cols, ["dr cr", "debit credit", "type", "txn type", "transaction type", "cr/dr"])
    bal_col = _pick_column(cols, ["closing balance", "running balance", "balance"])

    if date_col is None:
        return {"transactions": [], "opening_balance": None, "closing_balance": None, "statement_summary": {}}

    is_cc = account_type == "Credit Card"
    transactions = []
    opening_balance = None
    prev_bal = None

    for _, row in df.iterrows():
        parsed_date = parse_date_string(row.get(date_col))
        if not parsed_date:
            continue

        desc = ""
        if desc_col is not None and not pd.isna(row.get(desc_col)):
            desc = str(row.get(desc_col)).strip()
        if not desc or desc.lower() == "nan":
            desc = "Transaction"

        debit = clean_amount(row.get(debit_col)) if debit_col is not None else None
        credit = clean_amount(row.get(credit_col)) if credit_col is not None else None
        raw_amt = clean_amount(row.get(amount_col)) if amount_col is not None else None
        indicator = str(row.get(type_col) or "").strip().upper() if type_col is not None else ""
        bal = clean_amount(row.get(bal_col)) if bal_col is not None else None

        amt = None
        if debit not in (None, Decimal("0.00")) and credit in (None, Decimal("0.00")):
            amt = -abs(debit)
        elif credit not in (None, Decimal("0.00")) and debit in (None, Decimal("0.00")):
            amt = abs(credit)
        elif debit not in (None, Decimal("0.00")) and credit not in (None, Decimal("0.00")):
            amt = abs(credit) - abs(debit)
        elif raw_amt is not None:
            amt = raw_amt
            if indicator in ("DR", "DEBIT", "D"):
                amt = -abs(amt)
            elif indicator in ("CR", "CREDIT", "C"):
                amt = abs(amt)
            elif is_cc and amt > 0 and not any(k in desc.lower() for k in ("payment", "refund", "reversal", "cashback", "repayment")):
                amt = -abs(amt)
        elif prev_bal is not None and bal is not None:
            amt = bal - prev_bal if not is_cc else prev_bal - bal

        if amt is None or amt == Decimal("0.00"):
            continue

        if opening_balance is None and bal is not None:
            opening_balance = bal - amt if not is_cc else bal + amt
        prev_bal = bal if bal is not None else prev_bal

        transactions.append({
            "date": parsed_date,
            "amount": amt,
            "description": desc,
            "raw_text": " | ".join(str(v) for v in row.tolist() if not pd.isna(v)),
            "balance": bal,
        })

    closing_balance = prev_bal
    return {
        "transactions": transactions,
        "opening_balance": opening_balance,
        "closing_balance": closing_balance,
        "statement_summary": {
            "opening_balance": opening_balance,
            "total_amount_due": closing_balance if is_cc else closing_balance,
        },
    }

def parse_sbi_statement(file_bytes: bytes, ext: str, account_type: str, password: Optional[str] = None) -> Dict[str, Any]:
    transactions = []
    is_credit_card = account_type == "Credit Card"
    is_savings = account_type in ["Savings", "Current"]
    opening_balance = None
    closing_balance = None
    ext = (ext or "").lower().lstrip(".")

    if ext in TABULAR_EXTS:
        return parse_tabular_statement(file_bytes, ext, account_type)

    if ext == "pdf":
        pages = extract_pdf_pages_text(file_bytes, password=password)
        if not pages:
            return {"transactions": [], "opening_balance": None, "closing_balance": None, "statement_summary": {}}

        if is_savings:
            full_sbi_text = "\n".join(pages)
            m_clear = re.search(r"Clear Balance\s*:\s*([0-9,]+\.\d{2})\s*(CR|DR)?", full_sbi_text, re.IGNORECASE)
            if m_clear:
                closing_balance = clean_amount(m_clear.group(1))

            # Strategy 1: Vector Table extraction (cleanest multi-line cell extraction)
            tables = extract_pdf_tables_safely(file_bytes, password=password)
            for table in tables:
                for row in table:
                    if not row or len(row) < 5:
                        continue
                    d_parsed = parse_date_string(row[0])
                    if not d_parsed:
                        continue

                    # SBI Savings Columns: Txn Date, Value Date, Description, Ref No, Debit, Credit, Balance
                    desc_cell = str(row[2] or "").strip()
                    narration = " ".join(desc_cell.split())
                    ref_cell = str(row[3] or "").strip() if len(row) > 3 and str(row[3]).strip() != "-" else ""
                    wdl = clean_amount(row[4]) if len(row) > 4 else None
                    dep = clean_amount(row[5]) if len(row) > 5 else None
                    bal = clean_amount(row[6]) if len(row) > 6 else None

                    amt = None
                    if wdl and wdl > 0 and (not dep or dep == 0): amt = -wdl
                    elif dep and dep > 0 and (not wdl or wdl == 0): amt = dep
                    elif dep and wdl: amt = dep - wdl

                    if amt is not None and amt != Decimal("0.00"):
                        transactions.append({
                            "date": d_parsed,
                            "amount": amt,
                            "description": narration or "SBI Txn",
                            "raw_text": " | ".join(str(c) for c in row if c),
                            "balance": bal,
                            "reference_id": ref_cell if ref_cell else None,
                            "event_type": "INCOME" if amt > 0 else "EXPENSE"
                        })

            # Strategy 2: Text Line parser fallback if vector table extraction yielded no transactions
            if not transactions:
                lines_all = []
                for page in pages:
                    lines_all.extend(page.splitlines())

                pattern = re.compile(
                    r"^(\d{2}[-/]\d{2}[-/]\d{2,4})\s+(\d{2}[-/]\d{2}[-/]\d{2,4})\s+(.*?)\s+(-|[0-9,]+\.\d{2})\s+(-|[0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})(?:\s*(?:CR|DR))?$",
                    re.IGNORECASE
                )
                for line in lines_all:
                    line = line.strip()
                    m = pattern.match(line)
                    if m:
                        d_str, v_str, desc, wdl_str, dep_str, bal_str = m.groups()
                        wdl = Decimal(wdl_str.replace(",", "")) if wdl_str != "-" else Decimal("0.00")
                        dep = Decimal(dep_str.replace(",", "")) if dep_str != "-" else Decimal("0.00")
                        bal = Decimal(bal_str.replace(",", ""))
                        amt = dep if dep > Decimal("0.00") else -wdl

                        parsed_date = parse_date_string(d_str)
                        if parsed_date:
                            clean_desc = desc.strip().rstrip("-").strip()
                            transactions.append({
                                "date": parsed_date,
                                "amount": amt,
                                "description": clean_desc or "SBI Txn",
                                "raw_text": line,
                                "balance": bal,
                                "event_type": "INCOME" if amt > 0 else "EXPENSE"
                            })

            if transactions:
                if opening_balance is None:
                    opening_balance = transactions[0]["balance"] - transactions[0]["amount"]
                if not closing_balance:
                    closing_balance = transactions[-1]["balance"]

            # Statement Summary & Reconciliation Check
            summary_info = {
                "opening_balance": opening_balance,
                "closing_balance": closing_balance,
                "total_amount_due": closing_balance
            }
            if opening_balance is not None and closing_balance is not None and transactions:
                calc_closing = opening_balance + sum(t["amount"] for t in transactions)
                summary_info["reconciliation_passed"] = abs(calc_closing - closing_balance) <= Decimal("0.05")
                summary_info["reconciliation_status"] = "PASS" if summary_info["reconciliation_passed"] else "NEEDS_REVIEW"

            return {
                "transactions": transactions,
                "opening_balance": opening_balance,
                "closing_balance": closing_balance,
                "statement_summary": summary_info
            }

        elif is_credit_card:
            sbi_cc_pattern = re.compile(
                r"^(\d{1,2}\s+[A-Za-z]{3}\s*\'?\s*\d{2,4}|\d{2}[-/]\d{2}[-/]\d{2,4})\s+(.+?)\s+([0-9,]+(?:\.\d{1,2})?)\s*([CDMT]|CR|DR)?\s*$",
                re.IGNORECASE
            )
            sbi_cc_tax_pattern = re.compile(
                r"^(IGST|CGST|SGST|INTEREST ON EMI)\s+.*?([0-9,]+(?:\.\d{1,2})?)\s*([CDMT]|CR|DR)?\s*$",
                re.IGNORECASE
            )
            sbi_cc_transfer_pattern = re.compile(
                r"^(\d{1,2}\s+[A-Za-z]{3}\s*\'?\s*\d{2,4})\s+(TRANSFER TO MERCHANT EMI)\s+([0-9,]+(?:\.\d{1,2})?)\s*$",
                re.IGNORECASE
            )

            last_date = None
            for page_text in pages:
                lines = page_text.splitlines()
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue

                    # Check for transfer to merchant EMI row
                    m_transfer = sbi_cc_transfer_pattern.match(line)
                    if m_transfer:
                        d_str, desc, amt_str = m_transfer.groups()
                        parsed_date = parse_date_string(d_str)
                        amt = clean_amount(amt_str)
                        if parsed_date and amt is not None:
                            last_date = parsed_date
                            # EMI conversion is an accounting offset reversing the purchase
                            transactions.append({
                                "date": parsed_date,
                                "amount": amt,
                                "description": desc.strip(),
                                "raw_text": line,
                                "event_type": "CARD_EMI_CONVERSION"
                            })
                        continue

                    match = sbi_cc_pattern.match(line)
                    tax_match = sbi_cc_tax_pattern.match(line)

                    if match:
                        date_str, desc, amt_str, indicator = match.groups()
                        # Avoid noise headers
                        if any(h in desc.lower() for h in ["statement period", "transaction details", "important message"]):
                            continue
                        parsed_date = parse_date_string(date_str)
                        if not parsed_date:
                            continue
                        last_date = parsed_date
                        amt = clean_amount(amt_str)
                        if amt is None:
                            continue

                        ind = (indicator or "").upper()
                        is_credit = False
                        event_type = "PURCHASE"
                        if ind in ("C", "CR"):
                            is_credit = True
                            if "cashback" in desc.lower():
                                event_type = "CASHBACK"
                            else:
                                event_type = "CARD_PAYMENT"
                        elif any(kw in desc.lower() for kw in ["payment received", "cashback credit", "refund", "reversal"]):
                            is_credit = True
                            event_type = "CARD_PAYMENT" if "payment" in desc.lower() else "REFUND"
                        elif ind == "M" or "emi" in desc.lower():
                            event_type = "EMI_INSTALLMENT"
                        
                        final_amt = amt if is_credit else -amt
                        transactions.append({
                            "date": parsed_date,
                            "amount": final_amt,
                            "description": desc.strip(),
                            "raw_text": line,
                            "event_type": event_type
                        })
                    elif tax_match and last_date:
                        desc, amt_str, indicator = tax_match.groups()
                        amt = clean_amount(amt_str)
                        if amt is not None:
                            ind = (indicator or "").upper()
                            is_credit = ind in ("C", "CR")
                            final_amt = amt if is_credit else -amt
                            event_type = "INTEREST" if "interest" in desc.lower() else "TAX"
                            transactions.append({
                                "date": last_date,
                                "amount": final_amt,
                                "description": desc.strip(),
                                "raw_text": line,
                                "event_type": event_type
                            })

            meta = extract_statement_metadata(file_bytes, ext, bank_name="SBI", password=password)
            opening_balance = meta.get("opening_balance")
            closing_balance = meta.get("total_amount_due")
            if opening_balance is not None and closing_balance is not None and transactions:
                calc_due = opening_balance - sum(t["amount"] for t in transactions)
                reconciled = abs(calc_due - closing_balance) <= Decimal("0.50")
                if not reconciled and meta.get("total_outstanding") is not None:
                    credits = meta.get("total_credits") or Decimal("0.00")
                    debits = meta.get("total_debits") or Decimal("0.00")
                    fees = meta.get("total_fees") or Decimal("0.00")
                    expected_out = opening_balance - credits + debits + fees
                    if abs(expected_out - meta["total_outstanding"]) <= Decimal("0.50"):
                        reconciled = True
                meta["reconciliation_passed"] = reconciled
                meta["reconciliation_status"] = "PASS" if reconciled else "NEEDS_REVIEW"

            return {
                "transactions": transactions,
                "opening_balance": opening_balance,
                "closing_balance": closing_balance,
                "statement_summary": meta
            }

    return {"transactions": [], "opening_balance": None, "closing_balance": None, "statement_summary": {}}

def parse_hdfc_statement(file_bytes: bytes, ext: str, account_type: str, password: Optional[str] = None) -> Dict[str, Any]:
    transactions = []
    is_credit_card = account_type == "Credit Card"
    is_savings = account_type in ["Savings", "Current"]
    opening_balance = None
    closing_balance = None
    ext = (ext or "").lower().lstrip(".")

    if ext in TABULAR_EXTS:
        return parse_tabular_statement(file_bytes, ext, account_type)

    if ext == "pdf":
        pages = extract_pdf_pages_text(file_bytes, password=password)
        if not pages:
            return {"transactions": [], "opening_balance": None, "closing_balance": None, "statement_summary": {}}

        if is_savings:
            statement_summary = {}
            try:
                with pdfplumber.open(io.BytesIO(file_bytes), password=password) as pdf:
                    # 1. Extract Statement Summary metadata from text
                    full_text = "\n".join(p.extract_text() or "" for p in pdf.pages)
                    sum_m = re.search(
                        r"STATEMENT\s*SUMMARY\s*:?-?\s*\n\s*Opening\s*Balance\s+Dr\s*Count\s+Cr\s*Count\s+Debits\s+Credits\s+Closing\s*Bal(?:ance)?\s*\n\s*([0-9,]+\.\d{2})\s+(\d+)\s+(\d+)\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})",
                        full_text, re.IGNORECASE
                    )
                    if sum_m:
                        statement_summary = {
                            "opening_balance": clean_amount(sum_m.group(1)),
                            "debit_count": int(sum_m.group(2)),
                            "credit_count": int(sum_m.group(3)),
                            "total_debits": clean_amount(sum_m.group(4)),
                            "total_credits": clean_amount(sum_m.group(5)),
                            "total_amount_due": clean_amount(sum_m.group(6)),
                            "closing_balance": clean_amount(sum_m.group(6))
                        }
                        opening_balance = statement_summary.get("opening_balance")
                        closing_balance = statement_summary.get("closing_balance")

                    prev_balance = opening_balance

                    # Dynamic Column Boundaries Detection from Table Header
                    wdl_split = 478.0
                    dep_split = 550.0
                    bal_max = 650.0

                    for p in pdf.pages:
                        words = p.extract_words()
                        wdl_hdr = [w for w in words if "withdrawal" in w["text"].lower() and w["top"] < 350]
                        dep_hdr = [w for w in words if "deposit" in w["text"].lower() and w["top"] < 350]
                        bal_hdr = [w for w in words if "closing" in w["text"].lower() and w["top"] < 350]
                        if wdl_hdr and dep_hdr and bal_hdr:
                            wdl_split = (wdl_hdr[0]["x1"] + dep_hdr[0]["x0"]) / 2.0
                            dep_split = (dep_hdr[0]["x1"] + bal_hdr[0]["x0"]) / 2.0
                            bal_max = max(bal_hdr[0]["x1"] + 35.0, p.width)
                            break

                    # 2. Coordinate-Aware Word Extraction Across All Pages
                    for page_num, page in enumerate(pdf.pages):
                        words = page.extract_words(x_tolerance=2, y_tolerance=2)
                        if not words:
                            continue

                        # Header detection
                        header_y = 225
                        header_words = [w for w in words if 210 < w["top"] < 260 and any(kw in w["text"].lower() for kw in ["narration", "withdrawal", "deposit", "closing", "statementof"])]
                        if header_words:
                            header_y = max(w["bottom"] for w in header_words)

                        # Footer detection (disclaimers, summary block, bottom markers)
                        footer_y = page.height
                        for w in words:
                            w_u = w["text"].upper()
                            if w["top"] > 700 and any(kw in w_u for kw in ["*CLOSING", "HDFCBANKLIMITED", "CONTENTSOFTHISSTATEMENT", "EARMARKED"]):
                                footer_y = min(footer_y, w["top"] - 2)
                            elif "STATEMENTSUMMARY" in w_u and w["top"] > header_y:
                                footer_y = min(footer_y, w["top"] - 2)

                        table_words = [w for w in words if header_y + 1 <= w["top"] < footer_y]

                        # Detect Date Anchors (X < 65)
                        date_anchors = []
                        for w in table_words:
                            if w["x0"] < 65:
                                d = parse_date_string(w["text"])
                                if d:
                                    date_anchors.append({"date": d, "top": w["top"], "bottom": w["bottom"]})

                        # Group words into transaction bands based on date anchors
                        for i, anchor in enumerate(date_anchors):
                            y_start = anchor["top"] - 4
                            if i > 0:
                                y_start = max(y_start, date_anchors[i-1]["bottom"])
                            y_end = date_anchors[i+1]["top"] - 2 if i + 1 < len(date_anchors) else footer_y

                            band_words = [w for w in table_words if y_start <= w["top"] < y_end]

                            narration_words = []
                            ref_words = []
                            wdl_words = []
                            dep_words = []
                            bal_words = []

                            for w in band_words:
                                x_center = (w["x0"] + w["x1"]) / 2.0
                                if x_center < 65:
                                    pass
                                elif 65 <= x_center < 280:
                                    narration_words.append(w["text"])
                                elif 280 <= x_center < 400:
                                    ref_words.append(w["text"])
                                elif 400 <= x_center < wdl_split:
                                    wdl_words.append(w["text"])
                                elif wdl_split <= x_center < dep_split:
                                    dep_words.append(w["text"])
                                elif dep_split <= x_center <= bal_max:
                                    bal_words.append(w["text"])

                            raw_narration = " ".join(narration_words).strip()
                            ref_id = ref_words[0][:100] if ref_words else None
                            wdl = clean_amount(" ".join(wdl_words))
                            dep = clean_amount(" ".join(dep_words))
                            bal = clean_amount(" ".join(bal_words))

                            # Deterministic Amount and Direction
                            amt = None
                            if wdl is not None and wdl > Decimal("0.00"):
                                amt = -abs(wdl)
                            elif dep is not None and dep > Decimal("0.00"):
                                amt = abs(dep)
                            elif bal is not None and prev_balance is not None:
                                amt = bal - prev_balance

                            # Running balance verification / correction
                            if bal is not None and prev_balance is not None and amt is not None:
                                expected_bal = prev_balance + amt
                                if abs(expected_bal - bal) > Decimal("0.05"):
                                    # Correction via balance delta if column was ambiguous
                                    amt = bal - prev_balance

                            # Clean description without destroying raw text
                            clean_merchant = raw_narration
                            if clean_merchant.startswith("UPI-") or clean_merchant.startswith("REV-UPI-"):
                                parts = clean_merchant.split("-")
                                if len(parts) >= 2 and len(parts[1].strip()) > 2 and "@" not in parts[1]:
                                    clean_merchant = parts[1].strip()
                            elif clean_merchant.startswith("NEFT CR-") or clean_merchant.startswith("NEFT DR-"):
                                parts = clean_merchant.split("-")
                                if len(parts) >= 3:
                                    clean_merchant = parts[2].strip()
                            elif clean_merchant.startswith("ACH D-"):
                                clean_merchant = clean_merchant[6:].strip()
                            elif clean_merchant.startswith("IB BILLPAY"):
                                clean_merchant = "HDFC BillPay"

                            if amt is not None and amt != Decimal("0.00"):
                                transactions.append({
                                    "date": anchor["date"],
                                    "amount": amt,
                                    "description": clean_merchant or "HDFC Transaction",
                                    "raw_text": f"{anchor['date']} | {raw_narration} | {ref_id} | wdl:{wdl} | dep:{dep} | bal:{bal}",
                                    "balance": bal,
                                    "reference_id": ref_id
                                })
                                if bal is not None:
                                    prev_balance = bal
                                elif prev_balance is not None:
                                    prev_balance += amt

            except Exception as e:
                logger.error(f"Coordinate extraction failed on HDFC savings: {e}")

            # 3. Reconciliation Validation Gate
            if transactions:
                if opening_balance is None and transactions[0].get("balance") is not None:
                    opening_balance = transactions[0]["balance"] - transactions[0]["amount"]
                if closing_balance is None and transactions[-1].get("balance") is not None:
                    closing_balance = transactions[-1]["balance"]

                if statement_summary:
                    calc_debits = sum(abs(t["amount"]) for t in transactions if t["amount"] < 0)
                    calc_credits = sum(t["amount"] for t in transactions if t["amount"] > 0)
                    calc_dr_count = sum(1 for t in transactions if t["amount"] < 0)
                    calc_cr_count = sum(1 for t in transactions if t["amount"] > 0)

                    dr_match = statement_summary.get("debit_count") is None or calc_dr_count == statement_summary["debit_count"]
                    cr_match = statement_summary.get("credit_count") is None or calc_cr_count == statement_summary["credit_count"]
                    dr_amt_match = statement_summary.get("total_debits") is None or abs(calc_debits - statement_summary["total_debits"]) <= Decimal("0.05")
                    cr_amt_match = statement_summary.get("total_credits") is None or abs(calc_credits - statement_summary["total_credits"]) <= Decimal("0.05")

                    reconciliation_passed = bool(dr_match and cr_match and dr_amt_match and cr_amt_match)
                    statement_summary["reconciliation_passed"] = reconciliation_passed
                    statement_summary["reconciliation_status"] = "PASS" if reconciliation_passed else "NEEDS_REVIEW"

            return {
                "transactions": transactions,
                "opening_balance": opening_balance,
                "closing_balance": closing_balance,
                "statement_summary": statement_summary or {
                    "opening_balance": opening_balance,
                    "total_amount_due": closing_balance
                }
            }

        elif is_credit_card:
            hdfc_cc_pattern = re.compile(
                r"^(\d{2}/\d{2}/\d{2,4})(?:\|\s*\d{2}:\d{2})?\s+(.+?)\s+(?:\+\s*)?(?:C\s+)?([0-9,]+(?:\.\d{1,2})?)\s*(Cr|Dr|[A-Za-z•l]+)?\s*$",
                re.IGNORECASE
            )
            for page in pages:
                lines = page.splitlines()
                for line in lines:
                    line = line.strip()
                    match = hdfc_cc_pattern.match(line)
                    if match:
                        groups = match.groups()
                        date_str, desc, amt_str = groups[0], groups[1], groups[2]
                        indicator = groups[3] if len(groups) > 3 else None
                        parsed_date = parse_date_string(date_str)
                        if not parsed_date:
                            continue
                        amt = clean_amount(amt_str)
                        if amt is None:
                            continue

                        is_credit = False
                        if indicator and indicator.upper() in ["CR", "C"]:
                            is_credit = True
                        elif any(kw in desc.lower() for kw in ["cc payment", "payzapp", "payment received", "refund", "reversal", "cashback", "cr."]):
                            is_credit = True

                        amt = amt if is_credit else -amt
                        transactions.append({
                            "date": parsed_date,
                            "amount": amt,
                            "description": desc.strip(),
                            "raw_text": line
                        })

            return {
                "transactions": transactions,
                "opening_balance": opening_balance,
                "closing_balance": closing_balance,
                "statement_summary": {}
            }

    return {"transactions": [], "opening_balance": None, "closing_balance": None, "statement_summary": {}}

def parse_federal_statement(file_bytes: bytes, ext: str, account_type: str, password: Optional[str] = None) -> Dict[str, Any]:
    transactions = []
    ext = (ext or "").lower().lstrip(".")
    if ext in TABULAR_EXTS:
        return parse_tabular_statement(file_bytes, ext, account_type)

    if ext == "pdf":
        pages = extract_pdf_pages_text(file_bytes, password=password)
        if not pages:
            return {"transactions": [], "opening_balance": None, "closing_balance": None, "statement_summary": {}}

        full_text = "\n".join(pages)

        if account_type in ["Savings", "Current"]:
            # Strategy 1: Vector Table extraction
            tables = extract_pdf_tables_safely(file_bytes, password=password)
            for table in tables:
                for row in table:
                    if not row or len(row) < 4:
                        continue
                    d_parsed = parse_date_string(row[0])
                    if not d_parsed:
                        continue
                    desc = str(row[1] or "").strip()
                    wdl = clean_amount(row[2]) if len(row) > 2 else None
                    dep = clean_amount(row[3]) if len(row) > 3 else None
                    bal = clean_amount(row[4]) if len(row) > 4 else None
                    amt = dep if (dep and dep > 0) else (-wdl if wdl else None)
                    if amt is not None:
                        transactions.append({
                            "date": d_parsed,
                            "amount": amt,
                            "description": desc,
                            "raw_text": " | ".join(str(c) for c in row if c),
                            "balance": bal
                        })

            if not transactions:
                sav_pattern = re.compile(
                    r"^(\d{2}[-/]\d{2}[-/]\d{2,4})\s+(.+?)\s+([0-9,]+\.\d{2}|-)\s+([0-9,]+\.\d{2}|-)\s+([0-9,]+\.\d{2})$"
                )
                for line in full_text.splitlines():
                    m = sav_pattern.match(line.strip())
                    if not m:
                        continue
                    d_str, desc, wdl_str, dep_str, bal_str = m.groups()
                    parsed_date = parse_date_string(d_str)
                    if not parsed_date:
                        continue
                    wdl = Decimal(wdl_str.replace(",", "")) if wdl_str != "-" else Decimal("0.00")
                    dep = Decimal(dep_str.replace(",", "")) if dep_str != "-" else Decimal("0.00")
                    amt = dep if dep > 0 else -wdl
                    transactions.append({
                        "date": parsed_date,
                        "amount": amt,
                        "description": desc.strip(),
                        "raw_text": line.strip(),
                        "balance": Decimal(bal_str.replace(",", "")),
                    })

            if transactions:
                return {
                    "transactions": transactions,
                    "opening_balance": transactions[0]["balance"] - transactions[0]["amount"],
                    "closing_balance": transactions[-1]["balance"],
                    "statement_summary": {
                        "opening_balance": transactions[0]["balance"] - transactions[0]["amount"],
                        "total_amount_due": transactions[-1]["balance"],
                    },
                }

        # Credit Card (OneCard / Federal Bank)
        statement_year = str(datetime.now().year)
        year_match = re.search(r"Statement Date\s*\n*(\d{1,2}\s+[A-Za-z]{3}\s+(\d{4}))", full_text, re.IGNORECASE)
        if year_match:
            statement_year = year_match.group(2)
        else:
            period_m = re.search(r"\((\d{1,2}\s+[A-Za-z]{3}\s+(\d{4}))\s*-\s*(\d{1,2}\s+[A-Za-z]{3}\s+(\d{4}))\)", full_text)
            if period_m:
                statement_year = period_m.group(4)

        fed_spend_pattern = re.compile(
            r"^(\d{1,2}\s+[A-Za-z]{3})\s+(.+?)\s+([A-Z_]+)\s+([0-9,]+(?:\.\d{1,2})?)\s+([0-9,]+(?:\.\d{1,2})?)$",
            re.IGNORECASE
        )
        fed_repayment_pattern = re.compile(
            r"^(\d{1,2}\s+[A-Za-z]{3})\s+(.+?)\s+([0-9,]+(?:\.\d{1,2})?)$",
            re.IGNORECASE
        )

        in_txn_history = False
        for page in pages:
            lines = page.splitlines()
            for line in lines:
                line = line.strip()
                if "TRANSACTION HISTORY" in line:
                    in_txn_history = True
                    continue
                if any(k in line for k in ["IMPORTANT INFORMATION", "Grievance Contact Number", "Sample Illustration of Interest"]):
                    in_txn_history = False
                    continue

                if not in_txn_history:
                    continue

                # Skip header rows
                if any(h in line.lower() for h in ["merchant name", "reward points", "transaction type", "amount (rs.)"]):
                    continue

                # Match spends
                match_debit = fed_spend_pattern.match(line)
                if match_debit:
                    date_str, desc, txn_type, reward_pts, amt_str = match_debit.groups()
                    parsed_date = parse_date_string(f"{date_str} {statement_year}")
                    amt = clean_amount(amt_str)
                    if parsed_date and amt is not None and amt > 0:
                        transactions.append({
                            "date": parsed_date,
                            "amount": -amt,
                            "description": desc.strip(),
                            "raw_text": line,
                            "event_type": "PURCHASE"
                        })
                    continue

                # Match repayments
                match_credit = fed_repayment_pattern.match(line)
                if match_credit:
                    date_str, desc, amt_str = match_credit.groups()
                    amt = clean_amount(amt_str)
                    if amt is None or amt <= 0:
                        continue
                    desc_lower = desc.lower()
                    if any(h in desc_lower for h in ["payment due date", "total amount due", "minimum amount due", "statement date", "opening balance"]):
                        continue
                    parsed_date = parse_date_string(f"{date_str} {statement_year}")
                    if not parsed_date:
                        continue
                    is_credit = any(k in desc_lower for k in ["repayment", "paid via", "refund", "cashback", "reversal"])
                    final_amt = amt if is_credit else -amt
                    event_type = "CARD_PAYMENT" if is_credit else "PURCHASE"
                    transactions.append({
                        "date": parsed_date,
                        "amount": final_amt,
                        "description": desc.strip(),
                        "raw_text": line,
                        "event_type": event_type
                    })

        meta = extract_statement_metadata(file_bytes, ext, bank_name="FEDERAL", password=password)
        opening_balance = meta.get("opening_balance") or Decimal("0.00")
        closing_balance = meta.get("total_amount_due")
        if opening_balance is not None and closing_balance is not None and transactions:
            calc_due = opening_balance - sum(t["amount"] for t in transactions)
            meta["reconciliation_passed"] = abs(calc_due - closing_balance) <= Decimal("0.05")
            meta["reconciliation_status"] = "PASS" if meta["reconciliation_passed"] else "NEEDS_REVIEW"

        return {
            "transactions": transactions,
            "opening_balance": opening_balance,
            "closing_balance": closing_balance,
            "statement_summary": meta
        }

    return {"transactions": [], "opening_balance": None, "closing_balance": None, "statement_summary": {}}

def parse_axis_statement(file_bytes: bytes, ext: str, account_type: str, password: Optional[str] = None) -> Dict[str, Any]:
    transactions = []
    ext = (ext or "").lower().lstrip(".")
    if ext in TABULAR_EXTS:
        return parse_tabular_statement(file_bytes, ext, account_type)

    if ext == "pdf":
        pages = extract_pdf_pages_text(file_bytes, password=password)
        if not pages:
            return {"transactions": [], "opening_balance": None, "closing_balance": None, "statement_summary": {}}

        if account_type in ["Savings", "Current"]:
            # Strategy 1: Vector Table extraction
            tables = extract_pdf_tables_safely(file_bytes, password=password)
            for table in tables:
                for row in table:
                    if not row or len(row) < 4:
                        continue
                    d_parsed = parse_date_string(row[0])
                    if not d_parsed:
                        continue
                    desc = str(row[1] or "").strip()
                    wdl = clean_amount(row[2]) if len(row) > 2 else None
                    dep = clean_amount(row[3]) if len(row) > 3 else None
                    bal = clean_amount(row[4]) if len(row) > 4 else None
                    amt = dep if (dep and dep > 0) else (-wdl if wdl else None)
                    if amt is not None:
                        transactions.append({
                            "date": d_parsed,
                            "amount": amt,
                            "description": desc,
                            "raw_text": " | ".join(str(c) for c in row if c),
                            "balance": bal
                        })

            if not transactions:
                sav_pattern = re.compile(
                    r"^(\d{2}[-/]\d{2}[-/]\d{2,4})\s+(.+?)\s+([0-9,]+\.\d{2}|-)\s+([0-9,]+\.\d{2}|-)\s+([0-9,]+\.\d{2})$"
                )
                opening_balance = None
                for text in pages:
                    for line in text.splitlines():
                        m = sav_pattern.match(line.strip())
                        if not m:
                            continue
                        d_str, desc, wdl_str, dep_str, bal_str = m.groups()
                        parsed_date = parse_date_string(d_str)
                        if not parsed_date:
                            continue
                        wdl = Decimal(wdl_str.replace(",", "")) if wdl_str != "-" else Decimal("0.00")
                        dep = Decimal(dep_str.replace(",", "")) if dep_str != "-" else Decimal("0.00")
                        bal = Decimal(bal_str.replace(",", ""))
                        amt = dep if dep > 0 else -wdl
                        if opening_balance is None:
                            opening_balance = bal - amt
                        transactions.append({
                            "date": parsed_date,
                            "amount": amt,
                            "description": desc.strip(),
                            "raw_text": line.strip(),
                            "balance": bal,
                        })

            if transactions:
                return {
                    "transactions": transactions,
                    "opening_balance": transactions[0]["balance"] - transactions[0]["amount"],
                    "closing_balance": transactions[-1]["balance"],
                    "statement_summary": {
                        "opening_balance": transactions[0]["balance"] - transactions[0]["amount"],
                        "total_amount_due": transactions[-1]["balance"],
                    },
                }

        # Axis Credit Card
        axis_pattern = re.compile(
            r"^(\d{1,2}\s+[A-Za-z]{3}\s*['’]?\s*\d{2,4}|\d{2}[-/]\d{2}[-/]\d{2,4})\s+(.+?)\s+(?:[₹%¥RsINR\.\s]+)?([0-9,]+(?:\.\d{1,2})?)\s*(Credit|Debit|Cr|Dr)?\s*$",
            re.IGNORECASE
        )

        pending_desc = ""
        for text in pages:
            if not text:
                continue
            for line in text.splitlines():
                line = line.strip()
                if not line:
                    continue

                # Skip noise headers
                if any(h in line.lower() for h in [
                    "transaction summary", "payment summary", "page 1 of", "credit card number",
                    "building a8", "selected statement", "debit/credit", "**end of transaction summary**",
                    "monthly statement"
                ]):
                    continue

                # Detect standalone cashback note lines (e.g. 'Cashback credit Jun26-')
                if any(kw in line.lower() for kw in ["cashback credit", "telecom:", "others:"]):
                    if "cashback credit" in line.lower():
                        pending_desc = line
                    elif "telecom:" in line.lower() or "others:" in line.lower():
                        if transactions and "cashback" in transactions[-1]["description"].lower():
                            transactions[-1]["description"] += f" ({line})"
                        pending_desc = ""
                    continue

                match = axis_pattern.match(line)
                if match:
                    date_str, desc, amt_str, indicator = match.groups()
                    parsed_date = parse_date_string(date_str)
                    amt = clean_amount(amt_str)
                    if parsed_date and amt is not None:
                        # Clean OCR currency characters from description without stripping standard English letters
                        cleaned_desc = re.sub(r"(\bINR\b|\bRs\.?\b|[¥%₹])", "", desc).strip()
                        if pending_desc:
                            full_desc = f"{pending_desc} {cleaned_desc}".strip()
                            pending_desc = ""
                        else:
                            full_desc = cleaned_desc

                        # Clean any trailing or leading punctuation
                        full_desc = re.sub(r"^[,\-\s]+|[,\-\s]+$", "", full_desc)

                        is_credit = False
                        if indicator:
                            if indicator.upper() in ["CR", "CREDIT"]:
                                is_credit = True
                            elif indicator.upper() in ["DR", "DEBIT"]:
                                is_credit = False
                        else:
                            desc_l = full_desc.lower()
                            if any(kw in desc_l for kw in ["payment received", "auto debit payment", "mb/ib payment", "cashback credit", "refund", "reversal", "cr."]):
                                is_credit = True
                            elif any(kw in desc_l for kw in ["payment to", "payment for", "upi payment"]):
                                is_credit = False
                            elif any(kw in desc_l for kw in ["cashback", "refund", "reversal"]):
                                is_credit = True

                        amt_final = amt if is_credit else -amt
                        transactions.append({
                            "date": parsed_date,
                            "amount": amt_final,
                            "description": full_desc or "Axis Txn",
                            "raw_text": line
                        })

        meta = extract_statement_metadata(file_bytes, ext, bank_name="AXIS", password=password)
        opening_balance = meta.get("opening_balance")
        closing_balance = meta.get("total_amount_due")
        if opening_balance is not None and closing_balance is not None and transactions:
            calc_due = opening_balance - sum(t["amount"] for t in transactions)
            meta["reconciliation_passed"] = abs(calc_due - closing_balance) <= Decimal("0.05")
            meta["reconciliation_status"] = "PASS" if meta["reconciliation_passed"] else "NEEDS_REVIEW"

        return {
            "transactions": transactions,
            "opening_balance": opening_balance,
            "closing_balance": closing_balance,
            "statement_summary": meta
        }

    return {"transactions": [], "opening_balance": None, "closing_balance": None, "statement_summary": {}}

def parse_generic_statement(file_bytes: bytes, ext: str, account_type: str, password: Optional[str] = None) -> Dict[str, Any]:
    """
    Universal heuristic parser for Indian banks (ICICI, Kotak, BOB, IndusInd, PNB, Canara, YES, etc.).
    Uses vector tables if available, and falls back to regex column detection.
    """
    ext = (ext or "").lower().lstrip(".")
    if ext in TABULAR_EXTS:
        return parse_tabular_statement(file_bytes, ext, account_type)

    if ext == "pdf":
        is_cc = account_type == "Credit Card"
        # Strategy 1: Vector Table extraction
        tables = extract_pdf_tables_safely(file_bytes, password=password)
        transactions = []
        opening_balance = None
        closing_balance = None

        for table in tables:
            if not table or len(table) < 2:
                continue
            header = [_norm_col(c) for c in table[0]]
            # Find column indices
            date_idx = None
            desc_idx = None
            wdl_idx = None
            dep_idx = None
            amt_idx = None
            bal_idx = None

            for i, col in enumerate(header):
                if not col: continue
                if any(k in col for k in ["date", "txn dt", "tran dt", "value dt"]):
                    if date_idx is None: date_idx = i
                elif any(k in col for k in ["narration", "particular", "description", "details", "remarks"]):
                    if desc_idx is None: desc_idx = i
                elif any(k in col for k in ["withdrawal", "debit", "dr amt"]):
                    if wdl_idx is None: wdl_idx = i
                elif any(k in col for k in ["deposit", "credit", "cr amt"]):
                    if dep_idx is None: dep_idx = i
                elif any(k in col for k in ["amount", "txn amt"]):
                    if amt_idx is None: amt_idx = i
                elif any(k in col for k in ["balance", "bal"]):
                    if bal_idx is None: bal_idx = i

            for row in table[1:]:
                if not row or len(row) < 2:
                    continue
                d_val = row[date_idx] if date_idx is not None and date_idx < len(row) else row[0]
                d_parsed = parse_date_string(d_val)
                if not d_parsed:
                    continue

                desc_val = str(row[desc_idx] or "").strip() if desc_idx is not None and desc_idx < len(row) else (str(row[1] or "").strip() if len(row) > 1 else "Transaction")
                desc_val = " ".join(desc_val.split())

                wdl = clean_amount(row[wdl_idx]) if wdl_idx is not None and wdl_idx < len(row) else None
                dep = clean_amount(row[dep_idx]) if dep_idx is not None and dep_idx < len(row) else None
                raw_amt = clean_amount(row[amt_idx]) if amt_idx is not None and amt_idx < len(row) else None
                bal = clean_amount(row[bal_idx]) if bal_idx is not None and bal_idx < len(row) else None

                amt = None
                if wdl and wdl > 0 and (not dep or dep == 0): amt = -wdl
                elif dep and dep > 0 and (not wdl or wdl == 0): amt = dep
                elif dep and wdl: amt = dep - wdl
                elif raw_amt is not None:
                    amt = raw_amt
                    if is_cc and not any(k in desc_val.lower() for k in ["payment", "refund", "cashback", "reversal"]):
                        amt = -abs(amt)

                if amt is not None and amt != Decimal("0.00"):
                    transactions.append({
                        "date": d_parsed,
                        "amount": amt,
                        "description": desc_val or "Transaction",
                        "raw_text": " | ".join(str(c) for c in row if c),
                        "balance": bal
                    })

        if transactions:
            opening_balance = transactions[0]["balance"] - transactions[0]["amount"] if transactions[0].get("balance") else None
            closing_balance = transactions[-1]["balance"] if transactions[-1].get("balance") else None
            return {
                "transactions": transactions,
                "opening_balance": opening_balance,
                "closing_balance": closing_balance,
                "statement_summary": {
                    "opening_balance": opening_balance,
                    "total_amount_due": closing_balance
                }
            }

    return {"transactions": [], "opening_balance": None, "closing_balance": None, "statement_summary": {}}

# ==============================================================================
# LLM STRUCTURED INFERENCE ENGINE
# ==============================================================================

def extract_and_categorize_with_light_llm(
    text_chunk: str, 
    ollama_url: Optional[str] = None, 
    model: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Sends raw statement text to a lightweight Ollama model with strict schema constraints.
    """
    from app.ai import find_working_ollama_url
    from app.config import settings
    from app.telemetry import telemetry

    url = (ollama_url or find_working_ollama_url()).rstrip("/")
    llm = model or settings.LLM_MODEL
    schema = StatementExtractionResponse.model_json_schema()

    system_prompt = (
        "You are an Indian banking data extraction and spend categorization engine. "
        "Extract every transaction from the provided raw bank statement text. "
        "Clean all noisy merchant strings (e.g. 'UPI-SWIGGY-1234@OKAXIS' -> 'Swiggy', 'RAZ*Zomato' -> 'Zomato'). "
        "Identify transaction debit or credit amounts. "
        "Use POSITIVE amounts for payments/deposits/refunds/cashback (e.g. 'MB/IB PAYMENT', 'Cashback credit') "
        "and NEGATIVE amounts for purchases/debits/expenses (e.g. 'NETFLIX', 'ZOMATO', 'AIRTEL'). "
        "Provide dates in YYYY-MM-DD or DD/MM/YYYY format."
    )

    payload = {
        "model": llm,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Statement Text:\n{text_chunk}"}
        ],
        "format": schema,
        "stream": False,
        "options": {
            "temperature": settings.LLM_TEMPERATURE,
            "num_predict": 1024,
            "num_ctx": settings.LLM_NUM_CTX,
            "num_gpu": -1,
        },
        "keep_alive": "30m",
    }

    try:
        response = requests.post(f"{url}/api/chat", json=payload, timeout=300)
        response.raise_for_status()
        
        result_data = response.json()
        raw_json_output = result_data.get("message", {}).get("content", "{}")
        
        parsed_response = StatementExtractionResponse.model_validate_json(raw_json_output)
        return [txn.model_dump() for txn in parsed_response.transactions]
        
    except Exception as e:
        logger.error(f"Error during structured inference: {e}")
        telemetry.log(f"Structured inference error: {str(e)}", level="ERROR")
        return []

def process_statement_with_lightweight_llm(
    file_bytes: bytes, 
    filename: str, 
    ollama_url: Optional[str] = None, 
    model: Optional[str] = None,
    password: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Reads PDF text, breaks it into lightweight chunks, and extracts structured transactions.
    """
    from app.ai import find_working_ollama_url
    from app.config import settings
    from app.telemetry import telemetry

    url = (ollama_url or find_working_ollama_url()).rstrip("/")
    llm = model or settings.LLM_MODEL
    ext = filename.lower().split('.')[-1]
    full_text = ""
    if ext == 'pdf':
        pages = extract_pdf_pages_text(file_bytes, password=password)
        full_text = "\n".join(pages)
    elif ext in TABULAR_EXTS:
        df = read_tabular_dataframe(file_bytes, ext)
        full_text = df.to_csv(index=False) if df is not None else ""
    else:
        full_text = file_bytes.decode("utf-8", errors="ignore")

    if not full_text.strip():
        logger.warning("No text content found in statement for LLM extraction.")
        telemetry.log("No extractable text found in statement file", level="WARNING")
        return []

    lines = [l for l in full_text.splitlines() if l.strip()]
    chunks = []
    current_chunk = []
    current_word_count = 0
    
    for line in lines:
        words_in_line = len(line.split())
        if current_word_count + words_in_line > 600 and current_chunk:
            chunks.append("\n".join(current_chunk))
            current_chunk = [line]
            current_word_count = words_in_line
        else:
            current_chunk.append(line)
            current_word_count += words_in_line
            
    if current_chunk:
        chunks.append("\n".join(current_chunk))
        
    telemetry.log(f"[AI Ingestion] Statement split into {len(chunks)} line-aligned chunk(s) for {llm}")
    
    all_extracted_records = []
    for idx, chunk in enumerate(chunks):
        telemetry.log(f"[AI Ingestion] Processing Chunk {idx+1}/{len(chunks)} via {llm} (JSON Schema constrained)...")
        chunk_transactions = extract_and_categorize_with_light_llm(
            text_chunk=chunk,
            ollama_url=url,
            model=llm
        )
        telemetry.log(f"[AI Ingestion] Chunk {idx+1}/{len(chunks)} complete: {len(chunk_transactions)} txns extracted")
        all_extracted_records.extend(chunk_transactions)
        
    telemetry.log(f"[AI Ingestion] Total {len(all_extracted_records)} raw transactions extracted across all chunks")
        
    transactions = []
    for tx in all_extracted_records:
        date_val = parse_date_string(tx.get("transaction_date"))
        if not date_val:
            continue
        try:
            amt = Decimal(str(tx.get("amount", 0)))
        except Exception:
            continue
            
        category_formatted = tx.get("category", "").replace("_", " ") if tx.get("category") else "Others"
        merchant = tx.get("merchant_name", "").strip() or "Transaction"
        rail = tx.get("payment_rail", "UNKNOWN")
        ref = tx.get("raw_reference") or ""
        
        raw_text_line = f"Date: {tx.get('transaction_date')} | Merchant: {merchant} | Amount: {amt} | Rail: {rail} | Ref: {ref}"
        
        transactions.append({
            "date": date_val,
            "amount": amt,
            "description": merchant,
            "raw_text": raw_text_line,
            "category": category_formatted,
            "subcategory": rail,
            "reference_id": ref if ref else None
        })
        
    return transactions

# ==============================================================================
# STATEMENT METADATA EXTRACTION
# ==============================================================================

def extract_statement_metadata(
    file_bytes: bytes, 
    ext: str, 
    bank_name: str = "", 
    password: Optional[str] = None
) -> Dict[str, Any]:
    """
    Extracts summary header metadata from credit card and bank statements including:
    - Opening Balance / Previous Dues
    - Total Amount Due
    - Minimum Amount Due
    - Credit Limit
    - Available Credit Limit
    - Statement Date & Due Date
    - Period Start & End Dates
    - EMI / Loan Details
    """
    full_text = ""
    ext = (ext or "").lower().lstrip(".")
    if ext == 'pdf':
        try:
            pages = extract_pdf_pages_text(file_bytes, password=password)
            full_text = "\n".join(pages)
        except Exception as e:
            logger.warning(f"Could not extract text for statement metadata: {e}")
            return {}
    elif ext in TABULAR_EXTS:
        df = read_tabular_dataframe(file_bytes, ext)
        full_text = df.to_csv(index=False) if df is not None else ""
    else:
        full_text = file_bytes.decode('utf-8', errors='ignore')

    if not full_text.strip():
        return {}

    lines = [l.strip() for l in full_text.splitlines() if l.strip()]
    meta = {
        "opening_balance": None,
        "total_amount_due": None,
        "minimum_amount_due": None,
        "credit_limit": None,
        "available_credit_limit": None,
        "due_date": None,
        "statement_date": None,
        "period_start_date": None,
        "period_end_date": None,
        "total_outstanding": None,
        "total_credits": None,
        "total_debits": None,
        "total_fees": None,
        "loans": []
    }

    # 1. Structural multi-line table scanner for Axis, SBI, HDFC, OneCard
    for i, line in enumerate(lines):
        line_u = line.upper()

        # Axis: Total Payment Due | Minimum Payment Due | Payment Due Date
        if "TOTAL PAYMENT DUE" in line_u and i + 1 < len(lines):
            val_line = lines[i+1]
            amounts = re.findall(r'[\d,]+\.\d{2}', val_line)
            dates = re.findall(r'\d{1,2}\s+[A-Za-z]{3,}\s+\'?\d{2,4}', val_line)
            if len(amounts) >= 1 and meta["total_amount_due"] is None:
                meta["total_amount_due"] = clean_amount(amounts[0])
            if len(amounts) >= 2 and meta["minimum_amount_due"] is None:
                meta["minimum_amount_due"] = clean_amount(amounts[1])
            if dates and meta["due_date"] is None:
                meta["due_date"] = parse_date_string(dates[0])

        # Axis: Selected Statement Month | Credit Limit | Opening Balance
        if "SELECTED STATEMENT" in line_u or ("CREDIT LIMIT" in line_u and "OPENING BALANCE" in line_u):
            for offset in [1, 2]:
                if i + offset < len(lines):
                    v_line = lines[i+offset]
                    amounts = re.findall(r'[\d,]+\.\d{2}', v_line)
                    month_m = re.search(r'([A-Za-z]{3,9}\s+\d{4})', v_line)
                    if month_m and meta["statement_date"] is None:
                        meta["statement_date"] = parse_date_string(f"01 {month_m.group(1)}")
                    if len(amounts) >= 2:
                        if meta["credit_limit"] is None: meta["credit_limit"] = clean_amount(amounts[0])
                        if meta["opening_balance"] is None: meta["opening_balance"] = clean_amount(amounts[1])
                    elif len(amounts) == 1 and meta["opening_balance"] is None:
                        meta["opening_balance"] = clean_amount(amounts[0])

        # SBI: Credit Limit | Cash Limit | Statement Date
        if "CREDIT LIMIT" in line_u and "STATEMENT DATE" in line_u and i + 1 < len(lines):
            val_line = lines[i+1]
            amounts = re.findall(r'[\d,]+\.\d{2}', val_line)
            dates = re.findall(r'\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}', val_line)
            if len(amounts) >= 1 and meta["credit_limit"] is None:
                meta["credit_limit"] = clean_amount(amounts[0])
            if dates and meta["statement_date"] is None:
                meta["statement_date"] = parse_date_string(dates[0])

        # SBI: Available Credit Limit | Available Cash Limit | Payment Due Date
        if "AVAILABLE CREDIT LIMIT" in line_u and "PAYMENT DUE DATE" in line_u and i + 1 < len(lines):
            val_line = lines[i+1]
            amounts = re.findall(r'[\d,]+\.\d{2}', val_line)
            dates = re.findall(r'\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}', val_line)
            if len(amounts) >= 1 and meta["available_credit_limit"] is None:
                meta["available_credit_limit"] = clean_amount(amounts[0])
            if dates and meta["due_date"] is None:
                meta["due_date"] = parse_date_string(dates[0])

        # SBI: *Total Amount Due
        if "*TOTAL AMOUNT DUE" in line_u and i + 1 < len(lines):
            m = re.search(r'[\d,]+\.\d{2}', lines[i+1])
            if m and meta["total_amount_due"] is None:
                meta["total_amount_due"] = clean_amount(m.group())

        # SBI: **Minimum Amount Due
        if "**MINIMUM AMOUNT DUE" in line_u:
            for offset in [1, 2]:
                if i + offset < len(lines):
                    m = re.search(r'[\d,]+\.\d{2}', lines[i+offset])
                    if m and meta["minimum_amount_due"] is None:
                        meta["minimum_amount_due"] = clean_amount(m.group())
                        break

        # SBI: Previous Balance (check up to 2 lines down)
        if "PREVIOUS BALANCE" in line_u and "TOTAL OUTSTANDING" in line_u:
            for offset in [1, 2]:
                if i + offset < len(lines):
                    amounts = re.findall(r'[\d,]+\.\d{2}', lines[i+offset])
                    if len(amounts) >= 1 and meta["opening_balance"] is None:
                        meta["opening_balance"] = clean_amount(amounts[0])
                        if len(amounts) >= 5:
                            meta["total_credits"] = clean_amount(amounts[1])
                            meta["total_debits"] = clean_amount(amounts[2])
                            meta["total_fees"] = clean_amount(amounts[3])
                            meta["total_outstanding"] = clean_amount(amounts[4])
                        break

        # HDFC: PREVIOUS STATEMENT DUES | TOTAL AMOUNT DUE
        if "PREVIOUS STATEMENT DUES" in line_u and "TOTAL AMOUNT DUE" in line_u:
            for offset in [1, 2, 3]:
                if i + offset < len(lines):
                    l_val = lines[i+offset]
                    amounts = re.findall(r'[\d,]+\.\d{2}', l_val)
                    if "_" in l_val and len(amounts) >= 1 and meta["total_amount_due"] is None:
                        meta["total_amount_due"] = clean_amount(amounts[-1])
                    if ("+" in l_val or len(amounts) >= 2) and meta["opening_balance"] is None:
                        meta["opening_balance"] = clean_amount(amounts[0])

        # HDFC: TOTAL CREDIT LIMIT | AVAILABLE CREDIT LIMIT | MINIMUM DUE | DUE DATE
        if "TOTAL CREDIT LIMIT" in line_u:
            for offset in [1, 2, 3, 4]:
                if i + offset < len(lines):
                    l_val = lines[i+offset]
                    dates = re.findall(r'\d{1,2}\s+[A-Za-z]{3,},?\s+\d{4}', l_val)
                    if dates and meta["due_date"] is None:
                        meta["due_date"] = parse_date_string(dates[0])
                    
                    c_amounts = re.findall(r'C\s*([\d,]+(?:\.\d{2})?)', l_val)
                    if len(c_amounts) >= 2:
                        if meta["credit_limit"] is None: meta["credit_limit"] = clean_amount(c_amounts[0])
                        if meta["available_credit_limit"] is None: meta["available_credit_limit"] = clean_amount(c_amounts[1])
                    for ca in c_amounts:
                        num = clean_amount(ca)
                        if num and num >= 10000 and meta["credit_limit"] is None:
                            meta["credit_limit"] = num
                        elif num and num < 10000 and meta["minimum_amount_due"] is None:
                            meta["minimum_amount_due"] = num

    # 2. Targeted Fallback Patterns
    # OneCard Specific Extractor
    if "Federal Bank One" in full_text or "One Credit Card" in full_text:
        m_oc_all = re.findall(r'Total Amount Due\s*[:=]?\s*([\d,]+\.\d{2})', full_text, re.IGNORECASE)
        valid_tads = [clean_amount(x) for x in m_oc_all if clean_amount(x) and clean_amount(x) > 0]
        if valid_tads and meta["total_amount_due"] is None:
            meta["total_amount_due"] = valid_tads[0]
        m_oc_stmt = re.search(r'Statement Date[\s\S]{1,80}?(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})', full_text, re.IGNORECASE)
        if m_oc_stmt and meta["statement_date"] is None:
            meta["statement_date"] = parse_date_string(m_oc_stmt.group(1))
        if meta["opening_balance"] is None:
            m_oc_op = re.search(r'Opening Balance\s*\n?\s*\(as on [^\)]+\)\s*\n?\s*([0-9,]+\.\d{2})', full_text, re.IGNORECASE)
            if m_oc_op:
                meta["opening_balance"] = clean_amount(m_oc_op.group(1))
            else:
                meta["opening_balance"] = clean_amount("0.00")

    # Generic Total Amount Due
    if meta["total_amount_due"] is None:
        m_tad = re.search(r'Total Amount Due\s*[:=]?\s*([\d,]+\.\d{2})', full_text, re.IGNORECASE)
        if m_tad: meta["total_amount_due"] = clean_amount(m_tad.group(1))

    # Minimum Amount Due
    if meta["minimum_amount_due"] is None:
        m = re.search(r'Minimum Amount Due\s*[:=]?\s*([\d,]+\.\d{2})', full_text, re.IGNORECASE)
        if m: meta["minimum_amount_due"] = clean_amount(m.group(1))

    # Opening Balance
    if meta["opening_balance"] is None:
        if "Opening Balance" in full_text:
            m = re.search(r'Opening Balance\s*(?:\(as on [^\)]+\)\s*)?([0-9,]+\.\d{2})', full_text, re.IGNORECASE)
            if m: meta["opening_balance"] = clean_amount(m.group(1))

    # SBI/HDFC Savings Accounts Summaries
    if meta["opening_balance"] is None or meta["total_amount_due"] is None:
        # SBI Savings
        m_sbi_sum = re.search(r'Brought Forward.*?Closing Balance\s*\n\s*([\d,]+\.\d{2})CR?\s+\d+\s+\d+\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})CR?', full_text, re.IGNORECASE | re.DOTALL)
        if m_sbi_sum:
            if meta["opening_balance"] is None: meta["opening_balance"] = clean_amount(m_sbi_sum.group(1))
            if meta["total_amount_due"] is None: meta["total_amount_due"] = clean_amount(m_sbi_sum.group(2))
        
        # HDFC Savings
        m_hdfc_sum = re.search(r'STATEMENT\s*SUMMARY.*?\n\s*Opening\s*Balance.*?Closing\s*Bal(?:ance)?\s*\n\s*([\d,]+\.\d{2})\s+\d+\s+\d+\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})', full_text, re.IGNORECASE | re.DOTALL)
        if m_hdfc_sum:
            if meta["opening_balance"] is None: meta["opening_balance"] = clean_amount(m_hdfc_sum.group(1))
            if meta["total_amount_due"] is None: meta["total_amount_due"] = clean_amount(m_hdfc_sum.group(2))

    # Due Date
    if meta["due_date"] is None:
        m = re.search(r'(?:Payment Due Date|DUE DATE)\s*[:=]?\s*(\d{1,2}\s+[A-Za-z]{3,},?\s+\'?\d{2,4})', full_text, re.IGNORECASE)
        if m: meta["due_date"] = parse_date_string(m.group(1))

    # Statement Date
    if meta["statement_date"] is None:
        m = re.search(r'Statement Date\s*[:=]?\s*(\d{1,2}\s+[A-Za-z]{3,},?\s+\'?\d{2,4})', full_text, re.IGNORECASE)
        if m: meta["statement_date"] = parse_date_string(m.group(1))

    # Billing Period Range (e.g. 08 Jul, 2026 - 07 Aug, 2026 or (20 Mar 2026 - 19 Apr 2026))
    m_period = re.search(r'(?:BILLING PERIOD|Statement Period:\s*|\()\s*(\d{1,2}\s+[A-Za-z]{3,},?\s+\'?\d{2,4})\s*(?:TO|-)\s*(\d{1,2}\s+[A-Za-z]{3,},?\s+\'?\d{2,4})', full_text, re.IGNORECASE)
    if m_period:
        meta["period_start_date"] = parse_date_string(m_period.group(1))
        meta["period_end_date"] = parse_date_string(m_period.group(2))

    # SBI Loan Details (VALUE ADDED SERVICES)
    for line in lines:
        m_loan = re.match(r'(.*?(?:EMI|FLEXIPAY).*?)\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})', line, re.IGNORECASE)
        if m_loan:
            meta["loans"].append({
                "product_name": m_loan.group(1).strip(),
                "expiry_date": m_loan.group(2).strip(),
                "outstanding_principal": clean_amount(m_loan.group(3)),
                "current_emi": clean_amount(m_loan.group(4))
            })

    return meta

# ==============================================================================
# MAIN DISPATCHER
# ==============================================================================

def parse_statement(
    file_bytes: bytes, 
    filename: str, 
    account_type: str = 'Credit Card', 
    bank_name: Optional[str] = None, 
    processing_engine: str = "Standard Algo Parser",
    password: Optional[str] = None
) -> Dict[str, Any]:
    from app.config import settings
    ext = filename.lower().split('.')[-1]
    bank = bank_name or ""

    if not bank:
        if ext == "pdf":
            pages = extract_pdf_pages_text(file_bytes, password=password)
            sample_text = pages[0] if pages else ""
            bank = detect_bank_and_format(filename, sample_text.splitlines()[:20])
        else:
            sample_lines = []
            if ext in TABULAR_EXTS:
                df = read_tabular_dataframe(file_bytes, ext)
                if df is not None:
                    sample_lines = [str(c) for c in df.columns]
                    sample_lines.extend(df.head(4).astype(str).agg(" ".join, axis=1).tolist())
            if not sample_lines:
                sample_lines = file_bytes[:4000].decode("utf-8", errors="ignore").splitlines()[:20]
            bank = detect_bank_and_format(filename, sample_lines)

    # Extract Statement Summary Metadata (Opening Balance, Total Due, Limit, Due Date, Loans)
    statement_summary = extract_statement_metadata(file_bytes, ext, bank_name=bank or "", password=password)
    
    if processing_engine == "Local AI LLM (Fallback)":
        logger.info(f"Routing to Local AI LLM (Fallback) Parser with model {settings.LLM_MODEL}")
        transactions = process_statement_with_lightweight_llm(
            file_bytes=file_bytes,
            filename=filename,
            ollama_url=settings.OLLAMA_URL,
            model=settings.LLM_MODEL,
            password=password
        )
        return {
            "transactions": transactions,
            "statement_summary": statement_summary,
            "opening_balance": statement_summary.get("opening_balance"),
            "closing_balance": statement_summary.get("total_amount_due")
        }

    logger.info(f"Parsing statement for bank: {bank}, account_type: {account_type}")
    
    bank_upper = bank.upper()
    if "SBI" in bank_upper or "STATE BANK" in bank_upper:
        raw_res = parse_sbi_statement(file_bytes, ext, account_type, password=password)
    elif "HDFC" in bank_upper:
        raw_res = parse_hdfc_statement(file_bytes, ext, account_type, password=password)
    elif "AXIS" in bank_upper:
        raw_res = parse_axis_statement(file_bytes, ext, account_type, password=password)
    elif "FEDERAL" in bank_upper or "ONECARD" in bank_upper or "ONE CREDIT" in bank_upper:
        raw_res = parse_federal_statement(file_bytes, ext, account_type, password=password)
    else:
        raw_res = parse_generic_statement(file_bytes, ext, account_type, password=password)
        if not raw_res.get("transactions"):
            # Fallback to Axis parser which has versatile multi-date regex support
            raw_res = parse_axis_statement(file_bytes, ext, account_type, password=password)

    transactions = raw_res.get("transactions", []) if isinstance(raw_res, dict) else (raw_res or [])
    
    # Merge parsed summary fields
    if isinstance(raw_res, dict):
        parsed_summary = raw_res.get("statement_summary") or {}
        for k, v in parsed_summary.items():
            if v is not None and statement_summary.get(k) is None:
                statement_summary[k] = v
        if raw_res.get("opening_balance") is not None and statement_summary.get("opening_balance") is None:
            statement_summary["opening_balance"] = raw_res.get("opening_balance")
        if raw_res.get("closing_balance") is not None and statement_summary.get("total_amount_due") is None:
            statement_summary["total_amount_due"] = raw_res.get("closing_balance")

    # If still no transactions and file is tabular, try tabular parser
    if not transactions and ext in TABULAR_EXTS:
        fallback = parse_tabular_statement(file_bytes, ext, account_type)
        transactions = fallback.get("transactions", [])
        if fallback.get("opening_balance") is not None and statement_summary.get("opening_balance") is None:
            statement_summary["opening_balance"] = fallback.get("opening_balance")
        if fallback.get("closing_balance") is not None and statement_summary.get("total_amount_due") is None:
            statement_summary["total_amount_due"] = fallback.get("closing_balance")

    # UPI Intelligence & Clean Merchant Parsing
    def enhance_upi_transaction(txn):
        raw_text = txn.get("raw_text", "").upper()
        desc = txn.get("description", "")
        desc_u = desc.upper()
        
        if "UPI" in raw_text or "UPI" in desc_u:
            txn["subcategory"] = "UPI"
            
            # Extract UPI ID (VPA)
            upi_match = re.search(r'([a-zA-Z0-9\.\-_]+@[a-zA-Z0-9A-Z]+)', f"{raw_text} {desc}")
            if upi_match:
                upi_id = upi_match.group(1).lower()
                txn["reference_id"] = txn.get("reference_id") or upi_id

            # Clean narration to extract human-readable merchant
            if desc.startswith("UPI-") or desc.startswith("REV-UPI-") or desc.startswith("UPI/"):
                # Handle HDFC style: UPI-NAME-HANDLE-REF-DETAILS
                parts = desc.split("-")
                if len(parts) >= 2 and len(parts[1].strip()) > 2 and "@" not in parts[1]:
                    txn["description"] = parts[1].strip()
                elif "/" in desc:
                    # Handle SBI style: UPI/DR/REF/MERCHANT/BANK/...
                    slash_parts = [p.strip() for p in desc.split("/") if p.strip()]
                    for p in slash_parts:
                        if len(p) > 2 and not p.isdigit() and p not in ("UPI", "DR", "CR", "TFR", "DEP", "WDL", "REV") and "@" not in p:
                            txn["description"] = p.title()
                            break

        return txn

    transactions = [enhance_upi_transaction(tx) for tx in transactions]
        
    return {
        "transactions": transactions,
        "statement_summary": statement_summary,
        "opening_balance": statement_summary.get("opening_balance"),
        "closing_balance": statement_summary.get("total_amount_due")
    }

class PayslipExtractionSchema(BaseModel):
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    company_name: Optional[str] = None
    period_month: Optional[int] = None
    period_year: Optional[int] = None
    bank_account_no: Optional[str] = None
    basic_salary: float = 0.0
    hra: float = 0.0
    special_allowance: float = 0.0
    other_earnings: float = 0.0
    gross_earnings: float = 0.0
    provident_fund: float = 0.0
    professional_tax: float = 0.0
    income_tax_tds: float = 0.0
    other_deductions: float = 0.0
    gross_deductions: float = 0.0
    net_pay: float = 0.0


def parse_payslip(file_bytes: bytes, password: Optional[str] = None) -> Dict[str, Any]:
    """Parse Payslip PDF using Ollama LLM with schema-constrained JSON output."""
    from app.config import settings
    from app.ai import find_working_ollama_url
    pages = extract_pdf_pages_text(file_bytes, password=password)
    text = "\n".join(pages)
    
    prompt = f"""You are an expert payslip parser. Extract employee earnings and deductions from this Indian payslip.
Return strictly the extracted fields matching the schema.

Payslip Text:
{text[:4000]}
"""
    try:
        active_url = find_working_ollama_url()
        schema = PayslipExtractionSchema.model_json_schema()
        response = requests.post(
            f"{active_url}/api/generate",
            json={
                "model": settings.LLM_MODEL,
                "prompt": prompt,
                "stream": False,
                "format": schema,
                "options": {
                    "temperature": 0.0,
                    "num_predict": 512,
                    "num_ctx": 4096,
                }
            },
            timeout=120
        )
        response.raise_for_status()
        data = response.json()
        
        resp_text = data.get("response", "{}").strip()
        if resp_text.startswith("```json"):
            resp_text = resp_text[7:]
        if resp_text.startswith("```"):
            resp_text = resp_text[3:]
        if resp_text.endswith("```"):
            resp_text = resp_text[:-3]
            
        parsed_json = json.loads(resp_text)
        
        # Ensure all numeric fields are safe floats
        num_fields = [
            "basic_salary", "hra", "special_allowance", "other_earnings",
            "gross_earnings", "provident_fund", "professional_tax",
            "income_tax_tds", "other_deductions", "gross_deductions", "net_pay"
        ]
        for nf in num_fields:
            raw_val = parsed_json.get(nf)
            if raw_val is None:
                parsed_json[nf] = 0.0
            elif isinstance(raw_val, str):
                cleaned = re.sub(r"[^\d.]", "", raw_val)
                parsed_json[nf] = float(cleaned) if cleaned else 0.0
            else:
                parsed_json[nf] = float(raw_val)

        return parsed_json
    except Exception as e:
        logger.error(f"Error parsing payslip via LLM: {str(e)}")
        raise ValueError(f"Failed to parse payslip using LLM: {str(e)}")
