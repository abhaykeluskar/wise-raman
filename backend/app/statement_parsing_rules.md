# Indian Bank & Credit Card Statement Parsing Guidelines (WiseRaman AI Parser)

This document serves as the official reference instruction guide for algorithmic and LLM-based parsers when processing Indian financial statements (Savings, Current, and Credit Cards).

---

## 1. Credit Card Statement Structure & Metadata Extraction

Indian credit card statements always feature two distinct logical sections:
1. **Statement Summary Header Block**: Contains account overview and payment obligations.
2. **Transaction Ledger Table**: Lists debits (purchases/fees) and credits (payments/refunds).

### Required Header Metadata Fields:
* `opening_balance` (or `previous_dues`): Outstanding balance from the previous billing cycle.
* `total_amount_due` (or `total_payment_due`): The total closing amount that must be paid by the due date.
* `minimum_amount_due`: The minimum payment required to avoid late fees.
* `credit_limit` (or `total_credit_limit`): Total credit limit allocated to the card.
* `available_credit_limit`: Unutilized spend room remaining at statement generation.
* `statement_date`: Date on which the statement was generated.
* `due_date` (or `payment_due_date`): Payment deadline for the total amount due.
* `period_start_date` & `period_end_date`: Date range covered by this statement.

---

## 2. Bank-Specific Statement Layout Reference

### A. Axis Bank Credit Cards (e.g. Airtel Axis Mastercard)
* **Header Block Title**: `Payment Summary`
  * `Total Payment Due`: `₹ <amount>`
  * `Opening Balance`: `₹ <amount>`
  * `Credit Limit`: `₹ <amount>`
  * `Payment Due Date`: `<DD Mon 'YY>` (e.g., `01 Aug '26`)
  * `Minimum Payment Due`: `₹ <amount>`
* **Transaction Table**:
  * Columns: `Date | Transaction Details | Amount (INR) | Debit/Credit`
  * Table End Marker: `**End of Transaction Summary**`

### B. Federal Bank OneCard (FPL Technologies)
* **Header Block Titles**: `SUMMARY` & `STATEMENT ILLUSTRATION`
  * `Statement Date`: `<DD Mon YYYY>` (e.g., `20 Apr 2026`)
  * `Payment Due Date`: `<DD Mon YYYY>` (e.g., `07 May 2026`)
  * `Total Amount Due`: `<amount>`
  * `Minimum Amount Due`: `<amount>`
  * `Opening Balance (as on <date>)`: `<amount>`
  * `Repayments & Refunds`: `<amount>`
* **Transaction Table**:
  * Columns: `Date | Merchant Name | Transaction Type | Reward Points | Amount (Rs.)`
  * Repayment Indicator: Rows with Transaction Type `Repayments` or Merchant `Paid Via Upi` are **Credits**. All other rows are **Debits**.

### C. State Bank of India (SBI Card)
* **Header Block Title**: `ACCOUNT SUMMARY`
  * `Statement Date`: `<DD Mon YYYY>` (e.g., `03 Aug 2026`)
  * `Payment Due Date`: `<DD Mon YYYY>` (e.g., `23 Aug 2026`)
  * `Credit Limit (₹)`: `<amount>`
  * `Previous Balance (₹)`: `<amount>`
  * `*Total Amount Due (₹)`: `<amount>`
  * `**Minimum Amount Due (₹)`: `<amount>`
* **Transaction Table**:
  * Columns: `Date | Transaction Details | Amount (₹) | [C/D/M]`
  * Suffix Indicator: `C` = Credit, `D` = Debit, `M` = Monthly EMI Installment.

### D. HDFC Bank Credit Cards (e.g. Tata Neu Plus)
* **Header Block Title**: `PREVIOUS STATEMENT DUES | PAYMENTS/CREDITS RECEIVED | PURCHASES/DEBIT | TOTAL AMOUNT DUE`
  * `Statement Date`: `<DD Mon, YYYY>` (e.g., `07 Aug, 2026`)
  * `Billing Period`: `<DD Mon, YYYY> - <DD Mon, YYYY>`
  * `TOTAL AMOUNT DUE`: `[C/₹] <amount>`
  * `DUE DATE`: `<DD Mon, YYYY>` (e.g., `27 Aug, 2026`)
  * `TOTAL CREDIT LIMIT`: `[C/₹] <amount>`
  * `PREVIOUS STATEMENT DUES`: `[C/₹] <amount>`
* **Transaction Table**:
  * Columns: `DATE & TIME | TRANSACTION DESCRIPTION | Base NeuCoins | AMOUNT`
  * Credits: Prefixed with `+ C` or contains `CC PAYMENT`, `AUTODEBIT`, `REFUND`.

---

## 3. Financial Rules & Sign Conventions

1. **Sign Convention**:
   * **Purchases, Debits, Surcharges, Fees, GST**: Stored as **Negative Values** (`-amount`).
   * **Bill Payments, Cashbacks, Refunds, Reversals**: Stored as **Positive Values** (`+amount`).
2. **Reconciliation Formula**:
   $$\text{Closing Total Due} = \text{Opening Balance} + \sum \text{Debits} - \sum \text{Credits}$$
3. **Double-Counting Prevention**:
   * Internal transfers (`CC_BILL_PAYMENT` from Savings $\leftrightarrow$ `CC_PAYMENT_RECEIVED` on Credit Card) must be flagged with `is_excluded_from_spending = true`.

---

## 4. Expected Output JSON Format for LLM Parser

```json
{
  "statement_summary": {
    "bank_name": "Axis Bank",
    "card_name": "Airtel Axis Mastercard",
    "statement_date": "2026-07-12",
    "due_date": "2026-08-01",
    "period_start_date": "2026-06-12",
    "period_end_date": "2026-07-11",
    "opening_balance": 8514.70,
    "total_amount_due": 3373.53,
    "minimum_amount_due": 100.00,
    "credit_limit": 160000.00,
    "available_credit_limit": 156626.47
  },
  "transactions": [
    {
      "date": "2026-07-10",
      "description": "Netflix",
      "raw_text": "10 Jul '26 NETFLIX,MUMBAI 649.00 Debit",
      "amount": -649.00,
      "category": "Entertainment",
      "subcategory": "E-Commerce",
      "reference_id": null
    }
  ]
}
```

## Savings & Current Accounts Statement Structure
When parsing Savings/Current account statements:
1.  **Opening Balance**: Usually referred to as "Brought Forward" or "Opening Balance".
2.  **Closing Balance**: This should exactly match: Opening Balance + (Sum of Credits) - (Sum of Debits). Note: Unlike credit cards, here Credits increase your balance, and Debits decrease your balance.
3.  **HDFC Bank Savings**: Find the "STATEMENT SUMMARY" row at the end of the file. Columns: `Opening Balance | Dr Count | Cr Count | Debits | Credits | Closing Balance`.
4.  **State Bank of India (SBI) Savings**: Find the "Statement Summary" table. Columns: `Brought Forward | Dr Count | Cr Count | Total Debits | Total Credits | Closing Balance`.
