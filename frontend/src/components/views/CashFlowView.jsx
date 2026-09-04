import React, { useMemo, useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { MetricValue } from '../molecules/MetricValue';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  Repeat, 
  Clock, 
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

export const CashFlowView = () => {
  const { theme } = useTheme();
  const { savingsCashflow, transactions, accounts, authFetch } = useFinance();
  const isDark = theme === 'dark';

  const [timeframe, setTimeframe] = useState('6M'); // '1M' | '3M' | '6M' | '1Y'
  const [calendarEvents, setCalendarEvents] = useState([]);

  // Fetch real calendar events
  useEffect(() => {
    authFetch('/api/analytics/financial-calendar')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.events && data.events.length > 0) {
          setCalendarEvents(data.events);
        }
      })
      .catch(() => {});
  }, [authFetch]);

  // Monthly Cash Flow data
  const allMonthlyData = useMemo(() => {
    if (savingsCashflow?.monthly && savingsCashflow.monthly.length > 0) {
      return savingsCashflow.monthly.map(m => ({
        month: m.month,
        income: m.income || 0,
        expenses: m.expenses || 0,
        net: (m.income || 0) - (m.expenses || 0)
      }));
    }
    return [];
  }, [savingsCashflow]);

  // Sliced data based on timeframe
  const filteredMonthlyData = useMemo(() => {
    switch (timeframe) {
      case '1M': return allMonthlyData.slice(-1);
      case '3M': return allMonthlyData.slice(-3);
      case '1Y': return allMonthlyData.slice(-12);
      case '6M':
      default: return allMonthlyData.slice(-6);
    }
  }, [allMonthlyData, timeframe]);

  const currentMonth = allMonthlyData[allMonthlyData.length - 1] || { income: 0, expenses: 0, net: 0 };
  const savingsRate = currentMonth.income > 0 ? Math.round((currentMonth.net / currentMonth.income) * 100) : 0;

  // Liquid balance from accounts (Savings + Current or all liquid ASSET accounts)
  const liquidBalance = useMemo(() => {
    if (!accounts || accounts.length === 0) return 0;
    return accounts
      .filter(a => a.classification === 'ASSET' && (!a.subtype || a.subtype === 'SAVINGS' || a.subtype === 'CURRENT'))
      .reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);
  }, [accounts]);

  const projectedEndBalance = liquidBalance + (currentMonth.net || 0);

  // Dynamic trend calculations vs previous month
  const { incomeTrend, expenseTrend } = useMemo(() => {
    if (allMonthlyData.length < 2) return { incomeTrend: null, expenseTrend: null };
    const prev = allMonthlyData[allMonthlyData.length - 2];
    const cur = allMonthlyData[allMonthlyData.length - 1];

    let incTrend = null;
    if (prev.income > 0) {
      const diffPct = (((cur.income - prev.income) / prev.income) * 100).toFixed(1);
      incTrend = {
        value: `${Math.abs(diffPct)}%`,
        direction: diffPct >= 0 ? 'up' : 'down',
        label: 'vs previous'
      };
    }

    let expTrend = null;
    if (prev.expenses > 0) {
      const diffPct = (((cur.expenses - prev.expenses) / prev.expenses) * 100).toFixed(1);
      expTrend = {
        value: `${Math.abs(diffPct)}%`,
        direction: diffPct <= 0 ? 'down' : 'up',
        label: diffPct <= 0 ? 'lower spend' : 'higher spend',
        positiveIsGood: false
      };
    }

    return { incomeTrend: incTrend, expenseTrend: expTrend };
  }, [allMonthlyData]);

  // Upcoming planned recurring commitments
  const displayEvents = calendarEvents && calendarEvents.length > 0 ? calendarEvents.slice(0, 5).map(e => ({
    title: e.title || e.event_name || '-',
    date: e.date || e.day || '-',
    amount: Math.abs(parseFloat(e.amount || 0)),
    type: e.type || (e.flow === 'INFLOW' ? 'income' : 'commitment'),
    source: e.source || e.account || '-'
  })) : [];

  return (
    <div className="space-y-8 animate-in fade-in duration-200 pb-12">
      
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2 border-b border-[#E4E8E3]/30">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
            Cash Flow Dynamics
          </h2>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            Where money originates, where it flows, and projected monthly retention
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="brand">Savings Rate: {savingsRate}%</Badge>
        </div>
      </div>

      {/* 2. Primary Metrics Strip */}
      <div className={`p-6 rounded-[16px] border ${
        isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
      }`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:divide-x lg:divide-[#E4E8E3]/20">
          <div className="lg:pr-4">
            <MetricValue
              label="Latest Monthly Inflows"
              value={`+${formatCurrency(currentMonth.income)}`}
              trend={incomeTrend}
              size="md"
            />
          </div>

          <div className="lg:px-4">
            <MetricValue
              label="Latest Monthly Outflows"
              value={`-${formatCurrency(currentMonth.expenses)}`}
              trend={expenseTrend}
              size="md"
            />
          </div>

          <div className="lg:px-4">
            <MetricValue
              label="Net Surplus"
              value={formatCurrency(currentMonth.net)}
              subtext="Added to reserves"
              size="md"
            />
          </div>

          <div className="lg:pl-4">
            <MetricValue
              label="Projected End Balance"
              value={formatCurrency(projectedEndBalance)}
              subtext="Post scheduled commitments"
              size="md"
            />
          </div>
        </div>
      </div>

      {/* 3. Main Income vs. Outflow Visualization with Timeframe Pills */}
      <div className={`p-6 rounded-[16px] border ${
        isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className={`text-sm font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
              Flow Comparison ({timeframe})
            </h3>
            <p className={`text-[11px] ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Green = Income · Muted Brown = Operating Outflow
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            {/* Timeframe selector pills */}
            <div className={`flex items-center p-0.5 rounded-[8px] border ${
              isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
            }`}>
              {['1M', '3M', '6M', '1Y'].map(tf => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1 rounded-[6px] text-xs font-semibold cursor-pointer border-0 transition-colors ${
                    timeframe === tf
                      ? 'bg-[#3F8F5E] text-white'
                      : isDark ? 'text-[#8B978F] hover:text-[#F1F5F2]' : 'text-[#7B877F] hover:text-[#1D2822]'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#3F8F5E]" />
                <span className={isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}>Income</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#A77B58]" />
                <span className={isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}>Outflow</span>
              </div>
            </div>
          </div>
        </div>

        <div className="h-64 w-full flex items-center justify-center">
          {filteredMonthlyData.length === 0 ? (
            <span className="text-xs text-[#8B978F]">No cash flow records found for this timeframe.</span>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredMonthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={val => `₹${(val / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(val) => [formatCurrency(val), '']} />
                <Bar dataKey="income" name="Income" fill="#3F8F5E" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar dataKey="expenses" name="Outflow" fill="#A77B58" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 4. Upcoming Planned Cash Events */}
      <div className={`p-6 rounded-[16px] border ${
        isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className={`text-sm font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
              Upcoming Cash Events
            </h3>
            <p className={`text-[11px] ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Deterministic schedules (Next 30 Days)
            </p>
          </div>
          <Badge variant="brown" size="xs">Planned</Badge>
        </div>

        {displayEvents.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#8B978F]">
            No upcoming cash events scheduled.
          </div>
        ) : (
          <div className="divide-y divide-[#E4E8E3]/20 -mx-3">
            {displayEvents.map((evt, idx) => (
              <div key={idx} className="p-3.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className={`w-14 text-center font-bold text-[11px] ${isDark ? 'text-[#7FC39A]' : 'text-[#285A3A]'}`}>
                    {evt.date}
                  </div>
                  <div>
                    <div className="font-semibold">{evt.title}</div>
                    <div className="text-[11px] text-[#8B978F]">{evt.source}</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`tabular-nums font-semibold ${
                    evt.type === 'income' ? 'text-[#3F8F5E]' : ''
                  }`}>
                    {evt.type === 'income' ? '+' : '-'}{formatCurrency(evt.amount)}
                  </div>
                  <span className="text-[10px] text-[#8B978F] uppercase font-bold">
                    {evt.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
