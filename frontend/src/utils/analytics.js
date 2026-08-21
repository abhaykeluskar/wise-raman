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

export const calculateNextCardDue = (cards = []) => {
  if (!cards || cards.length === 0) return null;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  let nearestCard = null;
  let minDaysDiff = Infinity;
  let computedDueDate = null;

  cards.forEach(card => {
    const stmtDay = parseInt(card.statement_date) || 1;
    // Estimated payment due date is statement date + 20 days
    let dueDay = stmtDay + 20;
    let dueMonth = currentMonth;
    let dueYear = currentYear;

    if (dueDay > 30) {
      dueDay = dueDay - 30;
      dueMonth = (dueMonth + 1) % 12;
      if (dueMonth === 0) dueYear += 1;
    }

    let dueDate = new Date(dueYear, dueMonth, dueDay);
    dueDate.setHours(0, 0, 0, 0);
    if (dueDate < today) {
      // If already passed this month, project for next month
      dueMonth = (dueMonth + 1) % 12;
      if (dueMonth === 0) dueYear += 1;
      dueDate = new Date(dueYear, dueMonth, dueDay);
      dueDate.setHours(0, 0, 0, 0);
    }

    const diffDays = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays < minDaysDiff) {
      minDaysDiff = diffDays;
      nearestCard = card;
      computedDueDate = dueDate;
    }
  });

  if (!nearestCard || !computedDueDate) return null;

  return {
    card: nearestCard,
    dueDate: computedDueDate,
    daysRemaining: minDaysDiff,
    formattedDate: computedDueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  };
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
