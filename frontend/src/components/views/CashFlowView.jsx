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
  const { savingsCashflow, transactions, authFetch } = useFinance();
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
    return [
      { month: 'Sep 2025', income: 110000, expenses: 54000, net: 56000 },
      { month: 'Oct 2025', income: 112000, expenses: 62000, net: 50000 },
      { month: 'Nov 2025', income: 114000, expenses: 59000, net: 55000 },
      { month: 'Dec 2025', income: 130000, expenses: 75000, net: 55000 },
      { month: 'Jan 2026', income: 115000, expenses: 56000, net: 59000 },
      { month: 'Feb 2026', income: 118000, expenses: 58000, net: 60000 },
      { month: 'Mar 2026', income: 115000, expenses: 52000, net: 63000 },
      { month: 'Apr 2026', income: 120000, expenses: 58000, net: 62000 },
      { month: 'May 2026', income: 118000, expenses: 61000, net: 57000 },
      { month: 'Jun 2026', income: 125000, expenses: 54000, net: 71000 },
      { month: 'Jul 2026', income: 122000, expenses: 64000, net: 58000 },
      { month: 'Aug 2026', income: 124500, expenses: 58742, net: 65758 }
    ];
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

  const currentMonth = allMonthlyData[allMonthlyData.length - 1] || { income: 124500, expenses: 58742, net: 65758 };
  const savingsRate = currentMonth.income > 0 ? Math.round((currentMonth.net / currentMonth.income) * 100) : 52;

  // Upcoming planned recurring commitments
  const displayEvents = calendarEvents.length > 0 ? calendarEvents.slice(0, 5).map(e => ({
    title: e.title || e.event_name,
    date: e.date || e.day || 'Upcoming',
    amount: Math.abs(parseFloat(e.amount || 0)),
    type: e.type || (e.flow === 'INFLOW' ? 'income' : 'commitment'),
    source: e.source || e.account || 'Scheduled'
  })) : [
    { title: 'Salary Credit (Expected)', date: '01 Sep', amount: 124500, type: 'income', source: 'Employer' },
    { title: 'Axis Airtel Card Payment', date: '01 Sep', amount: 3373.53, type: 'commitment', source: 'Axis Bank' },
    { title: 'SIP — Nifty 50 Index Fund', date: '05 Sep', amount: 15000, type: 'investment', source: 'Groww' },
    { title: 'Apartment Maintenance / Rent', date: '10 Sep', amount: 22000, type: 'commitment', source: 'Landlord' },
    { title: 'Internet & Cloud Subscriptions', date: '15 Sep', amount: 2499, type: 'commitment', source: 'Airtel' }
  ];

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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 sm:divide-x sm:divide-[#E4E8E3]/20">
          <div>
            <MetricValue
              label="Latest Monthly Inflows"
              value={`+${formatCurrency(currentMonth.income)}`}
              trend={{ value: '2.0%', direction: 'up', label: 'vs previous' }}
              size="md"
            />
          </div>

          <div className="sm:px-6">
            <MetricValue
              label="Latest Monthly Outflows"
              value={`-${formatCurrency(currentMonth.expenses)}`}
              trend={{ value: '8.3%', direction: 'down', label: 'lower spend', positiveIsGood: false }}
              size="md"
            />
          </div>

          <div className="sm:px-6">
            <MetricValue
              label="Net Surplus"
              value={formatCurrency(currentMonth.net)}
              subtext="Added to reserves"
              size="md"
            />
          </div>

          <div className="sm:pl-6">
            <MetricValue
              label="Projected End Balance"
              value="₹1,62,136.45"
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

        <div className="h-64 w-full">
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
      </div>

    </div>
  );
};
