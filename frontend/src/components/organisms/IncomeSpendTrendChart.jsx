import React, { useState, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { TimeframePills } from '../molecules/TimeframePills';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import { TrendingUp } from 'lucide-react';

export const IncomeSpendTrendChart = () => {
  const { theme } = useTheme();
  const { transactions } = useFinance();
  const isDark = theme === 'dark';
  const [timeframe, setTimeframe] = useState('1m');

  const chartData = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];

    const now = new Date();
    let startDate = new Date();

    if (timeframe === '1w') startDate.setDate(now.getDate() - 7);
    else if (timeframe === '1m') startDate.setMonth(now.getMonth() - 1);
    else if (timeframe === '1y') startDate.setFullYear(now.getFullYear() - 1);
    else startDate = new Date(0); // All time

    const filtered = transactions.filter(t => new Date(t.date) >= startDate && !t.is_excluded_from_spending);

    const grouped = {};
    filtered.forEach(t => {
      const d = new Date(t.date);
      const key = timeframe === '1y' || timeframe === 'all'
        ? d.toLocaleString('default', { month: 'short', year: '2-digit' })
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      if (!grouped[key]) {
        grouped[key] = { name: key, Income: 0, Spend: 0, timestamp: d.getTime() };
      }

      const amt = Math.abs(parseFloat(t.amount || 0));
      if (t.amount > 0) {
        grouped[key].Income += amt;
      } else {
        if (t.category !== 'Credit Card Payment' && t.category !== 'Transfer') {
          grouped[key].Spend += amt;
        }
      }
    });

    return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
  }, [transactions, timeframe]);

  const spendColor = '#C85C5C';
  const incomeColor = '#3F8F5E';

  return (
    <div className={`p-6 rounded-[16px] border flex flex-col min-h-[380px] transition-all duration-150 ${
      isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
    }`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#3F8F5E]" />
          <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            Income vs. Spend Trend
          </h3>
        </div>
        <TimeframePills activeTimeframe={timeframe} onSelect={setTimeframe} />
      </div>

      {/* Chart */}
      <div className="flex-1 w-full min-h-[280px] flex flex-col justify-center">
        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <TrendingUp className={`h-8 w-8 opacity-40 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`} />
            <p className={`text-xs font-medium ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              No transactions recorded for the selected timeframe ({timeframe.toUpperCase()}).
            </p>
          </div>
        ) : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={spendColor} stopOpacity={0.25}/>
                    <stop offset="95%" stopColor={spendColor} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="trendIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={incomeColor} stopOpacity={0.25}/>
                    <stop offset="95%" stopColor={incomeColor} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#2A352D' : '#EEF2ED'} />
                <XAxis dataKey="name" stroke={isDark ? '#8B978F' : '#7B877F'} fontSize={10} tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={20} />
                <YAxis stroke={isDark ? '#8B978F' : '#7B877F'} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: isDark ? '#171E19' : '#FFFFFF',
                    borderColor: isDark ? '#2A352D' : '#E4E8E3',
                    color: isDark ? '#F1F5F2' : '#1D2822',
                    borderRadius: '10px',
                    fontSize: '12px'
                  }}
                  formatter={(value, name) => [`₹${value.toLocaleString()}`, name === 'Spend' ? 'Living Expenses' : 'Income & Deposits']}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Area type="monotone" dataKey="Income" stroke={incomeColor} fillOpacity={1} fill="url(#trendIncome)" strokeWidth={2} />
                <Area type="monotone" dataKey="Spend" stroke={spendColor} fillOpacity={1} fill="url(#trendSpend)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
