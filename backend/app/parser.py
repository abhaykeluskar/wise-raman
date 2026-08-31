import io
import re
import json
import os
from typing import List, Literal, Optional, Dict, Any
import pandas as pd
import pdfplumber
import requests
from datetime import datetime
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
    (r"\d{2}\s+[A-Za-z]{3}\s+\d{4}", "%d %b %Y"),
    (r"\d{1,2}\s+[A-Za-z]{3}\s+\d{4}", "%d %b %Y"),
    (r"\d{2}\s+[A-Za-z]{3}\s*'\d{2}", "%d %b '%y"),
    (r"\d{1,2}\s+[A-Za-z]{3}\s*'\d{2}", "%d %b '%y"),
    (r"\d{2}\s+[A-Za-z]{3}\s+\d{2}", "%d %b %y"),
    (r"\d{1,2}\s+[A-Za-z]{3}\s+\d{2}", "%d %b %y"),
]

def extract_pdf_pages_text(file_bytes: bytes, password: Optional[str] = None) -> List[str]:
    """
    Extracts text from each PDF page. Supports password-protected PDFs.
    If a page has no selectable font glyphs (vector curves/scanned),
    falls back to rendering and OCR via Tesseract.
    """
    pages_text = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes), password=password) as pdf:
            for idx, page in enumerate(pdf.pages):
                t = page.extract_text() or ""
                if len(t.strip()) < 15:
                    logger.info(f"Page {idx+1} has no embedded font text ({len(t.strip())} chars). Using OCR fallback...")
                    try:
                        import pypdfium2
                        import pytesseract
                        from PIL import Image, ImageEnhance
                        
                        pdf_doc = pypdfium2.PdfDocument(file_bytes, password=password)
                        pdfium_page = pdf_doc[idx]
                        img = pdfium_page.render(scale=3).to_pil()
                        gray = img.convert('L')
                        enhanced = ImageEnhance.Contrast(gray).enhance(2.0)
                        
                        ocr_t = pytesseract.image_to_string(enhanced)
                        logger.info(f"OCR successfully extracted {len(ocr_t)} characters from page {idx+1}")
                        pages_text.append(ocr_t)
                    except Exception as ocr_err:
                        logger.error(f"OCR fallback failed on page {idx+1}: {ocr_err}")
                        pages_text.append(t)
                else:
                    pages_text.append(t)
    except pdfplumber.pdfminer.pdfdocument.PDFPasswordIncorrect:
        raise ValueError("PDF is password-protected. Please provide the correct password.")
    except Exception as e:
        logger.error(f"Error extracting PDF pages: {e}")
        if "password" in str(e).lower():
            raise ValueError("PDF is password-protected or password was incorrect. Please provide the password.")
        raise
    return pages_text

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

def detect_bank_and_format(filename, first_few_lines):
    combined_text = f"{filename or ''}\n" + "\n".join(first_few_lines or [])
    combined_text = combined_text.lower()
    if "hdfc" in combined_text: return "HDFC"
    elif "state bank of india" in combined_text or "sbi" in combined_text: return "SBI"
    elif "axis" in combined_text: return "AXIS"
    elif "federal" in combined_text or "onecard" in combined_text: return "FEDERAL"
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

def parse_tabular_statement(file_bytes, ext, account_type="Savings"):
    """Parse Indian bank CSV / Excel exports (savings and credit cards)."""
    df = read_tabular_dataframe(file_bytes, ext)
    if df is None:
        return []

    cols = list(df.columns)
    date_col = _pick_column(cols, ["transaction date", "txn date", "tran date", "value date", "posting date", "date"])
    desc_col = _pick_column(cols, ["narration", "particulars", "description", "details", "remarks", "merchant", "transaction details", "narration/description"])
    debit_col = _pick_column(cols, ["withdrawal amt", "withdrawal", "debit amount", "debit amt", "withdrawals", "debit"])
    credit_col = _pick_column(cols, ["deposit amt", "deposit", "credit amount", "credit amt", "deposits", "credit"])
    amount_col = _pick_column(cols, ["amount (inr)", "transaction amount", "txn amount", "amount"])
    type_col = _pick_column(cols, ["dr cr", "debit credit", "type", "txn type", "transaction type", "cr/dr"])
    bal_col = _pick_column(cols, ["closing balance", "running balance", "balance"])

    if date_col is None:
        return []

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

def parse_sbi_statement(file_bytes, ext, account_type, password=None):
    transactions = []
    is_credit_card = account_type == "Credit Card"
    is_savings = account_type in ["Savings", "Current"]
    opening_balance = None
    closing_balance = None
    ext = (ext or "").lower()

    if ext in TABULAR_EXTS:
        return parse_tabular_statement(file_bytes, ext, account_type)
    
    if ext == "pdf":
        if is_savings:
            lines_all = []
            with pdfplumber.open(io.BytesIO(file_bytes), password=password) as pdf:
                p1_text = pdf.pages[0].extract_text() or ""
                m_clear = re.search(r"Clear Balance\s*:\s*([0-9,]+\.\d{2})\s*(CR|DR)?", p1_text, re.I)
                if m_clear:
                    closing_balance = Decimal(m_clear.group(1).replace(",", ""))
                
                for page in pdf.pages:
                    text = page.extract_text() or ""
                    lines_all.extend(text.splitlines())

            pattern = re.compile(r"^(\d{2}/\d{2}/\d{4})\s+(\d{2}/\d{2}/\d{4})\s+(.*?)\s+(-|[0-9,]+\.\d{2})\s+(-|[0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})$")
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
                        transactions.append({
                            "date": parsed_date,
                            "amount": amt,
                            "description": desc.strip(),
                            "raw_text": line,
                            "balance": bal
                        })
            if transactions:
                opening_balance = transactions[0]["balance"] - transactions[0]["amount"]
                if not closing_balance:
                    closing_balance = transactions[-1]["balance"]
            
            return {
                "transactions": transactions,
                "opening_balance": opening_balance,
                "closing_balance": closing_balance,
                "statement_summary": {
                    "opening_balance": opening_balance,
                    "total_amount_due": closing_balance
                }
            }
        elif is_credit_card:
            sbi_cc_pattern = re.compile(r"^(\d{2}\s+[A-Za-z]{3}\s+\d{2,4})\s+(.+?)\s+([0-9,]+(?:\.\d{1,2})?)\s*([CDMT]?)$", re.IGNORECASE)
            sbi_cc_tax_pattern = re.compile(r"^(IGST|CGST|SGST|INTEREST ON EMI)\s+.*?([0-9,]+(?:\.\d{1,2})?)\s*([CD]?)$", re.IGNORECASE)
            
            with pdfplumber.open(io.BytesIO(file_bytes), password=password) as pdf:
                last_date = None
                for page in pdf.pages:
                    text = page.extract_text()
                    if not text: continue
                    lines = text.splitlines()
                    for line in lines:
                        line = line.strip()
                        match = sbi_cc_pattern.match(line)
                        tax_match = sbi_cc_tax_pattern.match(line)
                        
                        if match:
                            date_str, desc, amt_str, indicator = match.groups()
                            parsed_date = parse_date_string(date_str)
                            if not parsed_date: continue
                            last_date = parsed_date
                            amt = clean_amount(amt_str)
                            if amt is None: continue
                            amt = amt if indicator.upper() == 'C' else -amt
                            transactions.append({"date": parsed_date, "amount": amt, "description": desc.strip(), "raw_text": line})
                        elif tax_match and last_date:
                            desc, amt_str, indicator = tax_match.groups()
                            amt = clean_amount(amt_str)
                            if amt is not None:
                                amt = amt if indicator.upper() == 'C' else -amt
                                transactions.append({"date": last_date, "amount": amt, "description": desc.strip(), "raw_text": line})
    return transactions

def parse_hdfc_statement(file_bytes, ext, account_type, password=None):
    transactions = []
    is_credit_card = account_type == "Credit Card"
    is_savings = account_type in ["Savings", "Current"]
    opening_balance = None
    closing_balance = None
    ext = (ext or "").lower()

    if ext in TABULAR_EXTS:
        return parse_tabular_statement(file_bytes, ext, account_type)
    
    if ext == "pdf":
        if is_savings:
            lines_all = []
            with pdfplumber.open(io.BytesIO(file_bytes), password=password) as pdf:
                for page in pdf.pages:
                    text = page.extract_text() or ""
                    lines_all.extend(text.splitlines())

            summary_pattern = re.compile(r"([0-9,]+\.\d{2})\s+(\d+)\s+(\d+)\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})")
            for line in lines_all:
                if "STATEMENT SUMMARY" in line or "Opening Balance" in line:
                    m_sum = summary_pattern.search(line)
                    if m_sum:
                        opening_balance = Decimal(m_sum.group(1).replace(",", ""))
                        closing_balance = Decimal(m_sum.group(6).replace(",", ""))

            pattern = re.compile(r"^(\d{2}/\d{2}/\d{2,4})\s+(?:(.*?)\s+)?(\d{2}/\d{2}/\d{2,4})\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})$")
            
            prev_bal = opening_balance
            for line in lines_all:
                line = line.strip()
                m = pattern.match(line)
                if m:
                    d_str, ref, v_str, wdl_str, dep_str, bal_str = m.groups()
                    bal = Decimal(bal_str.replace(",", ""))
                    
                    if prev_bal is not None:
                        amt = bal - prev_bal
                    else:
                        wdl = Decimal(wdl_str.replace(",", ""))
                        dep = Decimal(dep_str.replace(",", ""))
                        amt = dep if dep > Decimal("0.00") else -wdl
                    
                    prev_bal = bal
                    parsed_date = parse_date_string(d_str)
                    if parsed_date:
                        transactions.append({
                            "date": parsed_date,
                            "amount": amt,
                            "description": ref.strip() if ref and ref.strip() else "HDFC Tx",
                            "raw_text": line,
                            "balance": bal
                        })
            
            if transactions:
                if not opening_balance:
                    opening_balance = transactions[0]["balance"] - transactions[0]["amount"]
                if not closing_balance:
                    closing_balance = transactions[-1]["balance"]
            
            return {
                "transactions": transactions,
                "opening_balance": opening_balance,
                "closing_balance": closing_balance,
                "statement_summary": {
                    "opening_balance": opening_balance,
                    "total_amount_due": closing_balance
                }
            }
        elif is_credit_card:
            hdfc_cc_pattern = re.compile(r"^(\d{2}/\d{2}/\d{2,4})(?:\|\s*\d{2}:\d{2})?\s+(.+?)\s+(?:C\s+)?([0-9,]+(?:\.\d{1,2})?)\s*(Cr|Dr|[A-Za-z•l]+)?\s*$", re.IGNORECASE)
            with pdfplumber.open(io.BytesIO(file_bytes), password=password) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if not text: continue
                    lines = text.splitlines()
                    for line in lines:
                        line = line.strip()
                        match = hdfc_cc_pattern.match(line)
                        if match:
                            groups = match.groups()
                            date_str, desc, amt_str = groups[0], groups[1], groups[2]
                            indicator = groups[3] if len(groups) > 3 else None
                            parsed_date = parse_date_string(date_str)
                            if not parsed_date: continue
                            amt = clean_amount(amt_str)
                            if amt is None: continue
                            
                            is_credit = False
                            if indicator and indicator.upper() in ["CR", "C"]:
                                is_credit = True
                            elif any(kw in desc.lower() for kw in ["cc payment", "payzapp", "payment received", "refund", "reversal", "cashback", "cr."]):
                                is_credit = True
                                
                            amt = amt if is_credit else -amt
                            transactions.append({"date": parsed_date, "amount": amt, "description": desc.strip(), "raw_text": line})
    return transactions

def parse_federal_statement(file_bytes, ext, account_type, password=None):
    transactions = []
    ext = (ext or "").lower()
    if ext in TABULAR_EXTS:
        return parse_tabular_statement(file_bytes, ext, account_type)
    if ext == "pdf":
        if account_type in ["Savings", "Current"]:
            tabular_like = []
            sav_pattern = re.compile(
                r"^(\d{2}[-/]\d{2}[-/]\d{2,4})\s+(.+?)\s+([0-9,]+\.\d{2}|-)\s+([0-9,]+\.\d{2}|-)\s+([0-9,]+\.\d{2})$"
            )
            with pdfplumber.open(io.BytesIO(file_bytes), password=password) as pdf:
                for page in pdf.pages:
                    text = page.extract_text() or ""
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
                        amt = dep if dep > 0 else -wdl
                        tabular_like.append({
                            "date": parsed_date,
                            "amount": amt,
                            "description": desc.strip(),
                            "raw_text": line.strip(),
                            "balance": Decimal(bal_str.replace(",", "")),
                        })
            if tabular_like:
                return {
                    "transactions": tabular_like,
                    "opening_balance": tabular_like[0]["balance"] - tabular_like[0]["amount"],
                    "closing_balance": tabular_like[-1]["balance"],
                    "statement_summary": {
                        "opening_balance": tabular_like[0]["balance"] - tabular_like[0]["amount"],
                        "total_amount_due": tabular_like[-1]["balance"],
                    },
                }
        fed_pattern = re.compile(r"^(\d{2}\s+[A-Za-z]{3})\s+(.+?)\s+([A-Z_]+)\s+([0-9,]+(?:\.\d{1,2})?)\s+([0-9,]+(?:\.\d{1,2})?)$", re.IGNORECASE)
        fed_repayment_pattern = re.compile(r"^(\d{2}\s+[A-Za-z]{3})\s+(.+?)\s+([0-9,]+(?:\.\d{1,2})?)$", re.IGNORECASE)
        
        with pdfplumber.open(io.BytesIO(file_bytes), password=password) as pdf:
            statement_year = str(datetime.now().year)
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    year_match = re.search(r"Statement Date\s*\n*(\d{2}\s+[A-Za-z]{3}\s+(\d{4}))", text, re.IGNORECASE)
                    if year_match: statement_year = year_match.group(2)
                    
            for page in pdf.pages:
                text = page.extract_text()
                if not text: continue
                lines = text.splitlines()
                for line in lines:
                    line = line.strip()
                    
                    match_debit = fed_pattern.match(line)
                    if match_debit:
                        date_str, desc, txn_type, reward_pts, amt_str = match_debit.groups()
                        parsed_date = parse_date_string(f"{date_str} {statement_year}")
                        if not parsed_date: continue
                        amt = clean_amount(amt_str)
                        if amt is not None:
                            transactions.append({"date": parsed_date, "amount": -amt, "description": desc.strip(), "raw_text": line})
                        continue
                        
                    match_credit = fed_repayment_pattern.match(line)
                    if match_credit:
                        date_str, desc, amt_str = match_credit.groups()
                        desc_lower = desc.lower()
                        is_credit = any(k in desc_lower for k in ['repayment', 'paid via', 'refund', 'cashback', 'reversal'])
                        
                        parsed_date = parse_date_string(f"{date_str} {statement_year}")
                        if not parsed_date: continue
                        amt = clean_amount(amt_str)
                        if amt is not None:
                            final_amt = amt if is_credit else -amt
                            transactions.append({"date": parsed_date, "amount": final_amt, "description": desc.strip(), "raw_text": line})
    return transactions

def parse_axis_statement(file_bytes, ext, account_type, password=None):
    transactions = []
    ext = (ext or "").lower()
    if ext in TABULAR_EXTS:
        return parse_tabular_statement(file_bytes, ext, account_type)
    if ext == "pdf":
        pages = extract_pdf_pages_text(file_bytes, password=password)
        if account_type in ["Savings", "Current"]:
            sav_pattern = re.compile(
                r"^(\d{2}[-/]\d{2}[-/]\d{2,4})\s+(.+?)\s+([0-9,]+\.\d{2}|-)\s+([0-9,]+\.\d{2}|-)\s+([0-9,]+\.\d{2})$"
            )
            opening_balance = None
            for text in pages:
                if not text:
                    continue
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
                    "opening_balance": opening_balance,
                    "closing_balance": transactions[-1]["balance"],
                    "statement_summary": {
                        "opening_balance": opening_balance,
                        "total_amount_due": transactions[-1]["balance"],
                    },
                }

        axis_pattern = re.compile(
            r"^(\d{1,2}\s+[A-Za-z]{3}\s*['’]?\s*\d{2,4}|\d{2}[-/]\d{2}[-/]\d{2,4})\s+(.+?)\s+(?:[₹%¥RsINR\.\s]+)?([0-9,]+(?:\.\d{1,2})?)\s*(Credit|Debit|Cr|Dr)?\s*$", 
            re.IGNORECASE
        )
        
        pending_desc = ""
        for text in pages:
            if not text: continue
            for line in text.splitlines():
                line = line.strip()
                if not line: continue
                
                # Skip noise headers
                if any(h in line.lower() for h in ["transaction summary", "payment summary", "page 1 of", "credit card number", "building a8", "selected statement"]):
                    continue
                
                match = axis_pattern.match(line)
                if match:
                    date_str, desc, amt_str, indicator = match.groups()
                    parsed_date = parse_date_string(date_str)
                    amt = clean_amount(amt_str)
                    if parsed_date and amt is not None:
                        full_desc = (pending_desc + " " + desc).strip()
                        pending_desc = ""
                        
                        # Reliable credit vs debit detection
                        is_credit = False
                        if indicator:
                            if indicator.upper() in ['CR', 'CREDIT']:
                                is_credit = True
                            elif indicator.upper() in ['DR', 'DEBIT']:
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
                            "description": full_desc, 
                            "raw_text": line
                        })
                else:
                    if any(kw in line.lower() for kw in ["cashback", "telecom", "others"]):
                        pending_desc = line
    return transactions

def parse_generic_statement(file_bytes, ext, account_type, password=None):
    ext = (ext or "").lower()
    if ext in TABULAR_EXTS:
        return parse_tabular_statement(file_bytes, ext, account_type)
    return []

from app.telemetry import telemetry
from app.config import settings

def extract_and_categorize_with_light_llm(
    text_chunk: str, 
    ollama_url: Optional[str] = None, 
    model: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Sends raw statement text to a lightweight Ollama model with strict schema constraints.
    """
    url = (ollama_url or settings.OLLAMA_URL).rstrip("/")
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
        "format": schema,  # Strict JSON Schema constraint
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
    url = (ollama_url or settings.OLLAMA_URL).rstrip("/")
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

def extract_statement_metadata(
    file_bytes: bytes, 
    ext: str, 
    bank_name: str = "", 
    password: Optional[str] = None
) -> Dict[str, Any]:
    """
    Extracts summary header metadata from credit card statements including:
    - Opening Balance / Previous Dues
    - Total Amount Due
    - Minimum Amount Due
    - Credit Limit
    - Available Credit Limit
    - Statement Date & Due Date
    - Period Start & End Dates
    """
    full_text = ""
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

        # Axis: Credit Limit | Opening Balance
        if "CREDIT LIMIT" in line_u and "OPENING BALANCE" in line_u and i + 1 < len(lines):
            val_line = lines[i+1]
            amounts = re.findall(r'[\d,]+\.\d{2}', val_line)
            if len(amounts) >= 2:
                if meta["credit_limit"] is None: meta["credit_limit"] = clean_amount(amounts[0])
                if meta["opening_balance"] is None: meta["opening_balance"] = clean_amount(amounts[1])

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
                    
                    # Extract amounts with C or numbers
                    c_amounts = re.findall(r'C\s*([\d,]+(?:\.\d{2})?)', l_val)
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
        if valid_tads:
            meta["total_amount_due"] = valid_tads[0]
        m_oc_stmt = re.search(r'Statement Date\s*\n?\s*(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})', full_text, re.IGNORECASE)
        if m_oc_stmt:
            meta["statement_date"] = parse_date_string(m_oc_stmt.group(1))

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
            m = re.search(r'Opening Balance\s*(?:\(as on [^\)]+\)\s*)?([\d,]+\.\d{2})', full_text, re.IGNORECASE)
            if m: meta["opening_balance"] = clean_amount(m.group(1))
            elif "Federal Bank One" in full_text:
                meta["opening_balance"] = clean_amount("0.00")

    # SBI/HDFC Savings Accounts Summaries
    if meta["opening_balance"] is None or meta["total_amount_due"] is None:
        # SBI Savings
        m_sbi_sum = re.search(r'Brought Forward.*?Closing Balance\s*\n\s*([\d,]+\.\d{2})CR?\s+\d+\s+\d+\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})CR?', full_text, re.IGNORECASE | re.DOTALL)
        if m_sbi_sum:
            meta["opening_balance"] = clean_amount(m_sbi_sum.group(1))
            meta["total_amount_due"] = clean_amount(m_sbi_sum.group(2))
        
        # HDFC Savings
        m_hdfc_sum = re.search(r'STATEMENT SUMMARY.*?\nOpening Balance.*?Closing Balance\s*\n\s*([\d,]+\.\d{2})\s+\d+\s+\d+\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})', full_text, re.IGNORECASE | re.DOTALL)
        if m_hdfc_sum:
            meta["opening_balance"] = clean_amount(m_hdfc_sum.group(1))
            meta["total_amount_due"] = clean_amount(m_hdfc_sum.group(2))

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

def parse_statement(
    file_bytes, 
    filename, 
    account_type='Credit Card', 
    bank_name=None, 
    processing_engine="Standard Algo Parser",
    password: Optional[str] = None
):
    ext = filename.lower().split('.')[-1]
    bank = bank_name

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

    # Extract Statement Summary Metadata (Opening Balance, Total Due, Limit, Due Date)
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
    
    if "SBI" in bank.upper(): raw_res = parse_sbi_statement(file_bytes, ext, account_type, password=password)
    elif "HDFC" in bank.upper(): raw_res = parse_hdfc_statement(file_bytes, ext, account_type, password=password)
    elif "AXIS" in bank.upper(): raw_res = parse_axis_statement(file_bytes, ext, account_type, password=password)
    elif "FEDERAL" in bank.upper(): raw_res = parse_federal_statement(file_bytes, ext, account_type, password=password)
    else:
        raw_res = parse_axis_statement(file_bytes, ext, account_type, password=password)
        if not raw_res:
            raw_res = parse_generic_statement(file_bytes, ext, account_type, password=password)
            
    if isinstance(raw_res, dict):
        transactions = raw_res.get("transactions", [])
        parsed_summary = raw_res.get("statement_summary") or {}
        for k, v in parsed_summary.items():
            if v is not None and statement_summary.get(k) is None:
                statement_summary[k] = v
    else:
        transactions = raw_res or []

    if (not transactions) and ext in TABULAR_EXTS:
        fallback = parse_tabular_statement(file_bytes, ext, account_type)
        if isinstance(fallback, dict):
            transactions = fallback.get("transactions", [])
            parsed_summary = fallback.get("statement_summary") or {}
            for k, v in parsed_summary.items():
                if v is not None and statement_summary.get(k) is None:
                    statement_summary[k] = v
            if fallback.get("opening_balance") is not None:
                statement_summary["opening_balance"] = statement_summary.get("opening_balance") or fallback.get("opening_balance")
        elif fallback:
            transactions = fallback
        
    return {
        "transactions": transactions,
        "statement_summary": statement_summary,
        "opening_balance": statement_summary.get("opening_balance"),
        "closing_balance": statement_summary.get("total_amount_due")
    }

def parse_payslip(file_bytes, password: Optional[str] = None):
    """Parse Payslip PDF using Ollama LLM."""
    pages = extract_pdf_pages_text(file_bytes, password=password)
    text = "\n".join(pages)
    
    prompt = f"""
You are an expert payslip parser. Extract the following information from this Indian payslip text and return it strictly as valid JSON.
Do NOT include any markdown formatting, backticks, or other text outside the JSON object.

Extract these fields:
- employee_id (string or null)
- employee_name (string or null)
- company_name (string or null)
- period_month (integer, 1-12 representing the month)
- period_year (integer, e.g., 2025)
- bank_account_no (string or null)
- basic_salary (number, defaults to 0)
- hra (number, defaults to 0)
- special_allowance (number, defaults to 0)
- other_earnings (number, defaults to 0)
- gross_earnings (number)
- provident_fund (number, defaults to 0)
- professional_tax (number, defaults to 0)
- income_tax_tds (number, defaults to 0)
- other_deductions (number, defaults to 0)
- gross_deductions (number)
- net_pay (number)

Text to parse:
{text}
"""
    try:
        response = requests.post(
            f"{settings.OLLAMA_URL}/api/generate",
            json={
                "model": "qwen2.5:3b",
                "prompt": prompt,
                "stream": False,
                "format": "json"
            },
            timeout=180
        )
        response.raise_for_status()
        data = response.json()
        
        # Sometimes Ollama returns backticks even with format=json
        resp_text = data["response"].strip()
        if resp_text.startswith("```json"):
            resp_text = resp_text[7:]
        if resp_text.startswith("```"):
            resp_text = resp_text[3:]
        if resp_text.endswith("```"):
            resp_text = resp_text[:-3]
            
        parsed_json = json.loads(resp_text)
        return parsed_json
    except Exception as e:
        logger.error(f"Error parsing payslip via LLM: {str(e)}")
        raise ValueError(f"Failed to parse payslip using LLM: {str(e)}")
