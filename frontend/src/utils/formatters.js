// Utility formatters for Indian Rupees and Dates

export const formatCurrency = (val, showDecimals = true, preserveSign = true) => {
  if (val === null || val === undefined || isNaN(val)) return '₹0.00';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  const isNegative = num < 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0
  }).format(Math.abs(num));
  return (preserveSign && isNegative) ? `-${formatted}` : formatted;
};

/** Local calendar YYYY-MM-DD. Avoid Date#toISOString(), which is UTC and shifts the day in IST. */
export const toLocalDateKey = (date) => {
  if (date == null || date === '') return '';
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    date = new Date(date);
  }
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const formatDate = (dateStr, format = 'short') => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  
  if (format === 'short') {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  } else if (format === 'full') {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } else if (format === 'month-year') {
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  return d.toLocaleDateString('en-IN');
};

export const maskAccountNumber = (accNumber) => {
  if (!accNumber) return '...';
  const str = String(accNumber).trim();
  if (str.length <= 4) return `...${str}`;
  return `...${str.slice(-4)}`;
};
