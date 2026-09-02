// Financial analytics helper utilities

export const calculateNextCardBill = (cards = []) => {
  if (!cards || cards.length === 0) return null;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  let nearestCard = null;
  let minDaysDiff = Infinity;
  let computedBillDate = null;

  cards.forEach(card => {
    const stmtDay = parseInt(card.statement_date) || 1;
    let billMonth = currentMonth;
    let billYear = currentYear;

    let billDate = new Date(billYear, billMonth, stmtDay);
    billDate.setHours(0, 0, 0, 0);
    
    if (billDate < today) {
      // If statement already generated this month, next bill is next month
      billMonth = (billMonth + 1) % 12;
      if (billMonth === 0) billYear += 1;
      billDate = new Date(billYear, billMonth, stmtDay);
      billDate.setHours(0, 0, 0, 0);
    }

    const diffDays = Math.round((billDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays < minDaysDiff) {
      minDaysDiff = diffDays;
      nearestCard = card;
      computedBillDate = billDate;
    }
  });

  if (!nearestCard || !computedBillDate) return null;

  return {
    card: nearestCard,
    billDate: computedBillDate,
    daysRemaining: minDaysDiff,
    formattedDate: computedBillDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  };
};

const startOfDay = (d) => {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
};

const formatInDate = (d) =>
  d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const clampStatementDay = (year, monthIndex, stmtDay) => {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(Math.max(1, stmtDay || 1), lastDay);
};

/** Paise rounding (banks/RBI post in ₹ with 2 decimals, half-up). */
export const roundPaise = (n) => {
  const x = typeof n === 'number' ? n : parseFloat(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
};

/**
 * Ledger-implied card outstanding.
 * App convention: purchases/fees < 0, payments/refunds/cashback > 0.
 * TAD ≈ max(0, −Σ amounts), matching RBI TAD (net of credits in the posted ledger).
 */
export const cardLedgerOutstanding = (transactions = []) => {
  const net = transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  return Math.max(0, roundPaise(-net));
};

export const latestCardStatement = (statements = [], accountId) => {
  const rows = statements.filter((s) => String(s.account_id) === String(accountId));
  rows.sort((a, b) => String(b.statement_date || '').localeCompare(String(a.statement_date || '')));
  return rows[0] || null;
};

/** Prefer official statement TAD; else reconstruct from the card ledger. */
export const cardTotalAmountDue = ({ transactions = [], statements = [], accountId } = {}) => {
  const stmt = latestCardStatement(statements, accountId);
  const tad = stmt != null ? parseFloat(stmt.total_amount_due) : NaN;
  if (Number.isFinite(tad) && tad >= 0) {
    return { amount: roundPaise(tad), source: 'statement', statement: stmt };
  }
  return { amount: cardLedgerOutstanding(transactions), source: 'ledger', statement: stmt };
};

/**
 * Estimated payment due: statement day + 20 calendar days.
 * RBI requires at least a fortnight (14 days) before interest; issuers commonly use ~15–20 days
 * (RBI Master Direction illustration: 30 Oct statement → 19 Nov due). This is not issuer-specific.
 */
export const getNextDueDate = (card, fromDate = new Date()) => {
  const today = startOfDay(fromDate);
  const rawStmtDay = parseInt(card?.statement_date, 10) || 1;
  const stmtDay = clampStatementDay(today.getFullYear(), today.getMonth(), rawStmtDay);
  let stmtDate = startOfDay(new Date(today.getFullYear(), today.getMonth(), stmtDay));
  let dueDate = startOfDay(new Date(stmtDate));
  dueDate.setDate(dueDate.getDate() + 20);

  if (dueDate < today) {
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextStmtDay = clampStatementDay(nextMonth.getFullYear(), nextMonth.getMonth(), rawStmtDay);
    stmtDate = startOfDay(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), nextStmtDay));
    dueDate = startOfDay(new Date(stmtDate));
    dueDate.setDate(dueDate.getDate() + 20);
  }

  const daysRemaining = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));
  return {
    card,
    dueDate,
    daysRemaining,
    formattedDate: formatInDate(dueDate)
  };
};

export const calculateNextCardDue = (cards = []) => {
  if (!cards || cards.length === 0) return null;

  let nearest = null;
  cards.forEach(card => {
    const due = getNextDueDate(card);
    if (due.daysRemaining >= 0 && (!nearest || due.daysRemaining < nearest.daysRemaining)) {
      nearest = due;
    }
  });
  return nearest;
};

const TRANSFER_TYPES = new Set([
  'TRANSFER_INTERNAL',
  'CC_BILL_PAYMENT',
  'CC_PAYMENT_RECEIVED'
]);

const TRANSFER_CATEGORIES = new Set(['Transfer', 'Repayments']);

const TRANSFER_DESC = /NEFT|RTGS|IMPS|INTERNAL FUND|OWN ACCOUNT|SELF TRANSFER|TO SELF|CC PAYMENT|CREDIT CARD|BILLDESK|MB\/IB PAYMENT|AUTODEBIT|AUTO DEBIT/;

export const isInternalFlow = (tx) => {
  if (!tx) return false;
  if (TRANSFER_TYPES.has(tx.transaction_type)) return true;
  if (TRANSFER_CATEGORIES.has(tx.category)) return true;
  return TRANSFER_DESC.test((tx.description || '').toUpperCase());
};

export const calculateVelocity = (transactions = []) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const currentDay = Math.max(1, now.getDate());

  // Filter current month valid spending transactions
  const currentMonthSpends = transactions.filter(t => {
    if (t.is_excluded_from_spending || parseFloat(t.amount) >= 0) return false;
    if (isInternalFlow(t)) return false;
    if (!t.date) return false;
    const d = new Date(t.date);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });

  const totalCurrentSpend = currentMonthSpends.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
  const dailyBurnRate = totalCurrentSpend / currentDay;
  const projectedMonthEnd = dailyBurnRate * daysInCurrentMonth;

  // Previous month spending for trend comparison
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const prevMonthSpends = transactions.filter(t => {
    if (t.is_excluded_from_spending || parseFloat(t.amount) >= 0) return false;
    if (isInternalFlow(t)) return false;
    if (!t.date) return false;
    const d = new Date(t.date);
    return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
  });

  const totalPrevSpend = prevMonthSpends.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
  let velocityTrend = 0;
  if (totalPrevSpend > 0) {
    velocityTrend = ((projectedMonthEnd - totalPrevSpend) / totalPrevSpend) * 100;
  }

  return {
    dailyBurnRate,
    projectedMonthEnd,
    totalCurrentSpend,
    velocityTrend,
    currentDay,
    daysInCurrentMonth
  };
};

export const matchesPaymentRail = (tx, accounts, rail) => {
  if (!rail || rail === 'ALL') return true;
  const desc = (tx.description || '').toUpperCase();
  const acct = accounts.find(a => String(a.id) === String(tx.account_id));
  const isUpi = desc.includes('UPI');
  const isCc = acct?.subtype === 'CREDIT_CARD';
  if (rail === 'UPI') return isUpi;
  if (rail === 'CREDIT_CARD') return isCc && !isUpi;
  if (rail === 'OTHER') return !isUpi && !isCc;
  return true;
};

export const getFinancialContext = (transactions = []) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  let income = 0;
  let spending = 0;
  let lastImportDate = null;

  transactions.forEach(t => {
    if (!t.date) return;
    const d = new Date(t.date);
    
    // Track most recent transaction for data freshness
    if (!lastImportDate || d > lastImportDate) {
      lastImportDate = d;
    }

    // Only process current month for financial context
    if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
      const amt = parseFloat(t.amount || 0);
      
      // Determine if it's an internal transfer/settlement
      const isTransfer = isInternalFlow(t);
      const isExcluded = t.is_excluded_from_spending === true;

      // Income = positive events, non-transfers, non-excluded
      if (amt > 0 && !isTransfer && !isExcluded) {
        income += amt;
      }
      
      // Spending = negative events, non-transfers, non-excluded
      if (amt < 0 && !isTransfer && !isExcluded) {
        spending += Math.abs(amt);
      }
    }
  });

  const netFlow = income - spending;
  const savingsRate = income > 0 ? (netFlow / income) * 100 : 0;

  // Determine freshness
  let freshnessStatus = "Unknown";
  let isComplete = false;
  if (lastImportDate) {
    const daysSinceUpdate = Math.round((now - lastImportDate) / (1000 * 60 * 60 * 24));
    if (daysSinceUpdate <= 1) {
      freshnessStatus = "Updated today";
      isComplete = true;
    } else {
      freshnessStatus = `Last import ${daysSinceUpdate} days ago`;
    }
  }

  return {
    period: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    transactionCount: transactions.length, // total history available for RAG
    income,
    spending,
    netFlow,
    savingsRate,
    lastUpdatedAt: lastImportDate ? lastImportDate.toISOString() : null,
    freshnessStatus,
    dataCompleteness: isComplete ? "HIGH" : "PARTIAL"
  };
};
