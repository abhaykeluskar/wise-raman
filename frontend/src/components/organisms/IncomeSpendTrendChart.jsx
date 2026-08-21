import React, { useState, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { TimeframePills } from '../molecules/TimeframePills';
import { TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';

export const IncomeSpendTrendChart = () => {
  const { theme, style } = useTheme();
  const { transactions } = useFinance();
  const [timeframe, setTimeframe] = useState('all');

  const chartData = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];

    const now = new Date();
    let cutoffDate = new Date(0);

    if (timeframe === '1w') {
      cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeframe === '1m') {
      cutoffDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    } else if (timeframe === '1y') {
      cutoffDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    }

    const filtered = transactions.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return d >= cutoffDate;
    });

    // Grouping by Date (for 1w/1m) or Month (for 1y/all)
    const grouped = {};

    filtered.forEach(tx => {
      const d = new Date(tx.date);
      const key = (timeframe === '1w' || timeframe === '1m')
        ? d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
        : d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

      if (!grouped[key]) {
        grouped[key] = {
          name: key,
          timestamp: d.getTime(),
          Income: 0,
          Spend: 0
        };
      }

      const amt = parseFloat(tx.amount);
      if (amt > 0) {
        // True Income / Deposit (excluding internal CC payment received)
        if (tx.transaction_type !== 'CC_PAYMENT_RECEIVED' && tx.transaction_type !== 'TRANSFER_INTERNAL') {
          grouped[key].Income += amt;
        }
      } else if (amt < 0) {
        // True Living Spend (excluding excluded internal transfers & cc bill payments)
        if (!tx.is_excluded_from_spending && tx.transaction_type !== 'CC_BILL_PAYMENT' && tx.transaction_type !== 'TRANSFER_INTERNAL') {
          grouped[key].Spend += Math.abs(amt);
        }
      }
    });

    return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
  }, [transactions, timeframe]);

  return (
    <div className={`p-6 rounded-2xl border-0 transition-all duration-300 flex flex-col min-h-[380px] ${style('neu-flat-dark', 'neu-flat-light')}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className={`h-4 w-4 ${style('text-[#FF7E67]', 'text-[#4A90E2]')}`} />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Income vs. Spend Trend
          </h3>
        </div>
        <TimeframePills activeTimeframe={timeframe} onSelect={setTimeframe} />
      </div>

      {/* Chart */}
      <div className="flex-1 w-full min-h-[280px] flex flex-col justify-center">
        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <TrendingUp className="h-8 w-8 text-slate-600 opacity-40" />
            <p className="text-xs text-slate-400 font-medium">
              No transactions recorded for the selected timeframe ({timeframe.toUpperCase()}).
            </p>
            <span className="text-[11px] text-slate-500">
              Try switching the timeframe to <span className="font-bold text-slate-400">"All"</span> or upload bank statements.
            </span>
          </div>
        ) : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="trendSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={theme === 'dark' ? '#FF7E67' : '#ef4444'} stopOpacity={0.35}/>
                  <stop offset="95%" stopColor={theme === 'dark' ? '#FF7E67' : '#ef4444'} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="trendIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#1A1A2E' : '#E2E8F0'} />
              <XAxis dataKey="name" stroke="#8d99ae" fontSize={10} tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={20} />
              <YAxis stroke="#8d99ae" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: theme === 'dark' ? '#0F0F1A' : '#FFFFFF',
                  borderColor: theme === 'dark' ? '#24243E' : '#A3B1C6',
                  color: theme === 'dark' ? '#EAEAEA' : '#2D3436',
                  borderRadius: '12px',
                  fontSize: '12px'
                }}
                formatter={(value, name) => [`₹${value.toLocaleString()}`, name === 'Spend' ? 'Living Expenses' : 'Income & Deposits']}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Area type="monotone" dataKey="Income" stroke="#10b981" fillOpacity={1} fill="url(#trendIncome)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="Spend" stroke={theme === 'dark' ? '#FF7E67' : '#ef4444'} fillOpacity={1} fill="url(#trendSpend)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      </div>
    </div>
  );
};
