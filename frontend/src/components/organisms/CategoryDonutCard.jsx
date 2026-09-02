import React, { useState, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../utils/formatters';
import { CHART_PALETTE } from '../../utils/themeTokens';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieIcon, ChevronDown } from 'lucide-react';

export const CategoryDonutCard = () => {
  const { theme, style } = useTheme();
  const { transactions } = useFinance();

  // Extract unique available months from transactions
  const availableMonths = useMemo(() => {
    const monthsSet = new Set();
    transactions.forEach(t => {
      if (t.date) {
        const d = new Date(t.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthsSet.add(key);
      }
    });
    return Array.from(monthsSet).sort().reverse();
  }, [transactions]);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Calculate categorized spend for selected month (excluding transfers & CC payments)
  const { donutData, totalMonthSpend } = useMemo(() => {
    const validTxs = transactions.filter(t => {
      if (t.is_excluded_from_spending || parseFloat(t.amount) >= 0) return false;
      if (t.transaction_type === 'TRANSFER_INTERNAL' || t.transaction_type === 'CC_BILL_PAYMENT') return false;
      if (!t.date) return false;
      const d = new Date(t.date);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return mKey === selectedMonth;
    });

    const categoryMap = {};
    let total = 0;

    validTxs.forEach(tx => {
      const cat = tx.category && tx.category !== 'Processing...' ? tx.category : 'Others';
      const amt = Math.abs(parseFloat(tx.amount));
      categoryMap[cat] = (categoryMap[cat] || 0) + amt;
      total += amt;
    });

    const data = Object.keys(categoryMap).map(catName => ({
      name: catName,
      value: categoryMap[catName],
      percent: total > 0 ? (categoryMap[catName] / total) * 100 : 0
    })).sort((a, b) => b.value - a.value);

    return { donutData: data, totalMonthSpend: total };
  }, [transactions, selectedMonth]);

  const formatMonthLabel = (mKey) => {
    const [year, month] = mKey.split('-');
    const d = new Date(parseInt(year), parseInt(month) - 1, 1);
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div className={`p-6 rounded-3xl border-0 flex flex-col justify-between transition-all duration-300 min-h-[320px] ${style('neu-flat-dark', 'neu-flat-light')}`}>
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-[#5EEAD4]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Category Distribution
            </h3>
          </div>

          {/* Month Selector Dropdown */}
          <div className="relative inline-block">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className={`rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold appearance-none cursor-pointer border-0 transition-all ${style(
                'neu-inset-dark text-[#F4F7FA]',
                'neu-inset-light text-[#17202A]'
              )}`}
            >
              {availableMonths.length === 0 ? (
                <option value={selectedMonth}>{formatMonthLabel(selectedMonth)}</option>
              ) : (
                availableMonths.map(m => (
                  <option key={m} value={m}>{formatMonthLabel(m)}</option>
                ))
              )}
            </select>
            <ChevronDown className="h-3 w-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
          </div>
        </div>

        {/* Content Body */}
        {donutData.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 italic">
            No categorized spending recorded for {formatMonthLabel(selectedMonth)}.
          </div>
        ) : (
          <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-4">
            
            {/* Donut Pie */}
            <div className="w-full sm:w-1/2 h-[170px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: theme === 'dark' ? '#151A22' : '#FFFFFF',
                      borderColor: theme === 'dark' ? '#27313D' : '#D8E0E7',
                      color: theme === 'dark' ? '#F4F7FA' : '#17202A',
                      borderRadius: '12px',
                      fontSize: '11px'
                    }}
                    formatter={(value) => [`₹${value.toLocaleString()}`, "Spend"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Category breakdown list */}
            <div className="w-full sm:w-1/2 flex flex-col gap-1.5 max-h-[170px] overflow-y-auto pr-1 custom-scrollbar">
              {donutData.map((d, index) => (
                <div 
                  key={d.name} 
                  className={`flex items-center justify-between p-1.5 px-2.5 rounded-lg border-0 ${style('hover:bg-slate-800/30', 'hover:bg-slate-100/50')} transition-colors`}
                >
                  <div className="flex items-center gap-2 text-xs font-medium min-w-0">
                    <span 
                      className="h-2 w-2 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length] }} 
                    />
                    <span className="truncate">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-semibold tabular-nums">
                      {d.percent.toFixed(0)}%
                    </span>
                    <span className="text-xs font-bold tabular-nums">
                      {formatCurrency(d.value, false)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800/10 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Total Month Spend
        </span>
        <span className="text-base font-black tabular-nums">
          {formatCurrency(totalMonthSpend)}
        </span>
      </div>
    </div>
  );
};
