import React, { useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { ShieldAlert, ArrowRight } from 'lucide-react';

export const RecurringBillsWatchdog = ({ transactions, onSelectMerchant }) => {
  const { theme, style } = useTheme();

  const recurringBills = useMemo(() => {
    if (!transactions) return [];

    // Filter to negative transactions only (outflows) in the last 90 days
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
    
    const recentOutflows = transactions.filter(t => {
      if (parseFloat(t.amount) >= 0) return false;
      if (t.is_excluded_from_spending) return false;
      return new Date(t.date) >= cutoff;
    });

    // Group by Merchant (using description) and Amount
    const grouped = {};
    recentOutflows.forEach(tx => {
      const amt = Math.abs(parseFloat(tx.amount));
      // Round to near integers to catch small fluctuations
      const roundedAmt = Math.round(amt); 
      const desc = (tx.description || 'Unknown').toUpperCase().trim();
      
      // We need a stable key. Some merchants append location, so we take the first word if it's long, 
      // or just use the exact description for simplicity right now.
      const key = `${desc}_${roundedAmt}`;
      if (!grouped[key]) {
        grouped[key] = { merchant: tx.description, amount: amt, dates: [] };
      }
      grouped[key].dates.push(new Date(tx.date));
    });

    const bills = [];
    Object.values(grouped).forEach(group => {
      // If we see it at least 2 times in 90 days, we consider it recurring.
      if (group.dates.length >= 2) {
        // Sort dates descending
        group.dates.sort((a, b) => b - a);
        
        // Calculate days since last
        const daysSinceLast = Math.floor((now - group.dates[0]) / (1000 * 60 * 60 * 24));
        // Project next date assuming 30 day cycle
        const nextDate = new Date(group.dates[0]);
        nextDate.setDate(nextDate.getDate() + 30);
        
        bills.push({
          merchant: group.merchant,
          amount: group.amount,
          frequency: group.dates.length,
          lastDate: group.dates[0],
          nextDate: nextDate,
          daysUntil: Math.floor((nextDate - now) / (1000 * 60 * 60 * 24))
        });
      }
    });

    // Sort by days until next payment
    return bills.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 5);
  }, [transactions]);

  if (recurringBills.length === 0) return null;

  return (
    <div className={`p-6 rounded-2xl flex flex-col gap-4 border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-emerald-500" />
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Mandate Watchdog</h3>
      </div>
      
      <div className="flex flex-col gap-3 mt-2">
        {recurringBills.map((bill, idx) => {
          const isDueSoon = bill.daysUntil <= 5 && bill.daysUntil >= 0;
          return (
            <div
              key={idx}
              role={onSelectMerchant ? 'button' : undefined}
              onClick={() => onSelectMerchant && onSelectMerchant(bill.merchant)}
              className={`p-3 rounded-xl flex items-center justify-between ${style('bg-[#1a1a2e]', 'bg-slate-100')} ${onSelectMerchant ? 'cursor-pointer hover:brightness-110' : ''}`}
            >
              <div className="flex flex-col">
                <span className={`text-sm font-bold truncate max-w-[150px] ${style('text-slate-200', 'text-slate-800')}`}>
                  {bill.merchant}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                  {bill.daysUntil < 0 ? `Was due ${Math.abs(bill.daysUntil)}d ago` : `Due in ${bill.daysUntil} days`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-black ${isDueSoon ? 'text-red-500' : style('text-slate-300', 'text-slate-700')}`}>
                  ₹{bill.amount.toLocaleString()}
                </span>
                <div className={`p-1.5 rounded-full ${isDueSoon ? 'bg-red-500/10' : style('bg-slate-800', 'bg-slate-200')}`}>
                  <ArrowRight className={`h-3 w-3 ${isDueSoon ? 'text-red-500' : 'text-slate-400'}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
