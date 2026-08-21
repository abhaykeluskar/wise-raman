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

/** Estimated payment due: statement day + 20 calendar days (handles 28–31 day months). */
export const getNextDueDate = (card, fromDate = new Date()) => {
  const today = startOfDay(fromDate);
  const stmtDay = parseInt(card?.statement_date, 10) || 1;
  let stmtDate = startOfDay(new Date(today.getFullYear(), today.getMonth(), stmtDay));
  let dueDate = startOfDay(new Date(stmtDate));
  dueDate.setDate(dueDate.getDate() + 20);

  if (dueDate < today) {
    stmtDate = startOfDay(new Date(today.getFullYear(), today.getMonth() + 1, stmtDay));
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

export const calculateVelocity = (transactions = []) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const currentDay = Math.max(1, now.getDate());

  // Filter current month valid spending transactions
  const currentMonthSpends = transactions.filter(t => {
    if (t.is_excluded_from_spending || parseFloat(t.amount) >= 0) return false;
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

