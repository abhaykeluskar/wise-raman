import React, { useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export const RecurringBillsWatchdog = ({ onSelectMerchant }) => {
  const { theme } = useTheme();
  const { transactions } = useFinance();
  const isDark = theme === 'dark';

  const recurringBills = useMemo(() => {
    if (!transactions) return [];

    const merchantMap = new Map();
    transactions.forEach(t => {
      const amt = parseFloat(t.amount);
      if (amt < 0 && !t.is_excluded_from_spending) {
        const m = t.merchant || t.description || 'Unknown';
        if (!merchantMap.has(m)) merchantMap.set(m, []);
        merchantMap.get(m).push(t);
      }
    });

    const bills = [];
    merchantMap.forEach((txs, merchant) => {
      if (txs.length >= 2) {
        txs.sort((a, b) => new Date(b.date) - new Date(a.date));
        const latestTx = txs[0];
        const latestDate = new Date(latestTx.date);
        const nextDate = new Date(latestDate);
        nextDate.setMonth(nextDate.getMonth() + 1);

        const today = new Date();
        const diffTime = nextDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        bills.push({
          merchant,
          amount: Math.abs(parseFloat(latestTx.amount)),
          nextDate: nextDate.toISOString().split('T')[0],
          daysUntil: diffDays
        });
      }
    });

    return bills.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 5);
  }, [transactions]);

  if (recurringBills.length === 0) return null;

  return (
    <div className={`p-5 rounded-[14px] border flex flex-col gap-3.5 ${
      isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
    }`}>
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-[#3F8F5E]" />
        <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
          Mandate Watchdog
        </h3>
      </div>
      
      <div className="flex flex-col gap-2">
        {recurringBills.map((bill, idx) => {
          const isDueSoon = bill.daysUntil <= 5 && bill.daysUntil >= 0;
          return (
            <div
              key={idx}
              role={onSelectMerchant ? 'button' : undefined}
              onClick={() => onSelectMerchant && onSelectMerchant(bill.merchant)}
              className={`p-3 rounded-[10px] border flex items-center justify-between transition-colors ${
                isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
              } ${onSelectMerchant ? 'cursor-pointer hover:opacity-90' : ''}`}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold truncate">
                  {bill.merchant}
                </span>
                <span className={`text-[10px] uppercase tracking-wider font-semibold ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                  {bill.daysUntil < 0 ? `Was due ${Math.abs(bill.daysUntil)}d ago` : `Due in ${bill.daysUntil} days`}
                </span>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className={`text-xs font-bold tabular-nums ${isDueSoon ? 'text-[#C85C5C]' : ''}`}>
                  {formatCurrency(bill.amount)}
                </span>
                <div className={`p-1 rounded-full ${isDueSoon ? 'bg-[#C85C5C]/15 text-[#C85C5C]' : 'bg-black/5 dark:bg-white/5 text-[#8B978F]'}`}>
                  <ArrowRight className="h-3 w-3" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
