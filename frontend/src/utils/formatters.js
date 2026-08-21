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
