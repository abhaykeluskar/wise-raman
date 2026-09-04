import React, { useMemo, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { MetricValue } from '../molecules/MetricValue';
import { TransactionRow } from '../molecules/TransactionRow';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { CalculationProofModal } from '../organisms/CalculationProofModal';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  ChevronRight, 
  Sparkles,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

export const DashboardView = ({
  onSelectTransaction,
  onNavigateTransactions,
  onNavigateCashFlow,
  onNavigateInsights,
  onFilterTransactions,
  selectedPeriod = new Date().toLocaleDateString('default', { month: 'long', year: 'numeric' })
}) => {
  const { theme } = useTheme();
  const { user, accounts, transactions, cards, spendingReport, netWorth, savingsCashflow, openInLedger } = useFinance();
  const isDark = theme === 'dark';

  // Calculation proof modal state
  const [proofMetric, setProofMetric] = useState(null); // 'netWorth' | 'bankBalance' | 'income' | 'spending'

  // Greeting name
  const userName = user?.name || (user?.email ? user.email.split('@')[0] : '-');

  // 1. Financial Overview Metrics
  const metrics = useMemo(() => {
    // Total Bank Balances (Liquid Assets)
    const liquidBalance = accounts
      .filter(a => a.classification === 'ASSET')
      .reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);

    // Current Month Transactions
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    let monthIncome = 0;
    let monthSpending = 0;

    transactions.forEach(tx => {
      const amt = parseFloat(tx.amount || 0);
      const isCurrentMonth = tx.date ? tx.date.startsWith(currentMonthPrefix) : true;
      if (isCurrentMonth) {
        if (tx.flow === 'INFLOW' || tx.type === 'CREDIT' || amt > 0) {
          monthIncome += Math.abs(amt);
        } else if (tx.category !== 'Transfer' && tx.type !== 'TRANSFER') {
          monthSpending += Math.abs(amt);
        }
      }
    });

    const totalLiabilities = (cards || []).reduce((sum, c) => sum + Math.abs(parseFloat(c.current_balance || c.balance || 0)), 0);
    const totalNetWorth = netWorth?.net_worth ?? (liquidBalance - totalLiabilities);

    // Trends from historical data if available
    let incomeTrend = null;
    let spendingTrend = null;
    if (savingsCashflow?.monthly && savingsCashflow.monthly.length >= 2) {
      const cur = savingsCashflow.monthly[savingsCashflow.monthly.length - 1];
      const prev = savingsCashflow.monthly[savingsCashflow.monthly.length - 2];
      if (prev.income > 0) {
        const diff = ((cur.income - prev.income) / prev.income) * 100;
        incomeTrend = {
          value: `${Math.abs(diff).toFixed(1)}%`,
          direction: diff >= 0 ? 'up' : 'down',
          label: `vs ${prev.month || 'prev'}`
        };
      }
      if (prev.expenses > 0) {
        const diff = ((cur.expenses - prev.expenses) / prev.expenses) * 100;
        spendingTrend = {
          value: `${Math.abs(diff).toFixed(1)}%`,
          direction: diff >= 0 ? 'up' : 'down',
          label: `vs ${prev.month || 'prev'}`,
          positiveIsGood: false
        };
      }
    }

    return {
      netWorth: totalNetWorth || 0,
      bankBalance: liquidBalance || 0,
      monthlyIncome: monthIncome || 0,
      monthlySpending: monthSpending || 0,
      incomeTrend,
      spendingTrend
    };
  }, [accounts, transactions, cards, netWorth, savingsCashflow]);

  // 2. Spending Breakdown by Category (Horizontal Bars)
  const categoryBreakdown = useMemo(() => {
    const catMap = {};
    let totalSpend = 0;

    transactions.forEach(tx => {
      const amt = parseFloat(tx.amount || 0);
      const isOutflow = (tx.flow === 'OUTFLOW' || tx.type === 'DEBIT' || amt < 0) && tx.category !== 'Transfer';
      if (isOutflow) {
        const cat = tx.category || 'Other';
        const val = Math.abs(amt);
        catMap[cat] = (catMap[cat] || 0) + val;
        totalSpend += val;
      }
    });

    const list = Object.entries(catMap)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: totalSpend > 0 ? Math.round((amount / totalSpend) * 100) : 0
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return list;
  }, [transactions]);

  // Primary insight derived from actual transactions
  const primaryInsight = useMemo(() => {
    if (categoryBreakdown.length > 0) {
      const top = categoryBreakdown[0];
      return {
        headline: `Highest spending category is ${top.name} at ${formatCurrency(top.amount)}.`,
        detail: `Accounting for ${top.percentage}% of your tracked monthly spending.`
      };
    }
    if (transactions.length > 0) {
      return {
        headline: `${transactions.length} transaction(s) tracked for this period.`,
        detail: `Total tracked spending is ${formatCurrency(metrics.monthlySpending)}.`
      };
    }
    return {
      headline: 'No transaction activity detected yet.',
      detail: 'Import a bank statement or payslip to generate deterministic financial insights.'
    };
  }, [categoryBreakdown, transactions, metrics.monthlySpending]);

  // Handle Category click to jump directly to Ledger with that filter
  const handleCategoryClick = (categoryName) => {
    openInLedger({ category: categoryName });
    if (onNavigateTransactions) onNavigateTransactions();
  };

  // 3. Recent Transactions (5-7 items)
  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 6);
  }, [transactions]);

  // 4. Cash Flow Trend Chart Data
  const chartData = useMemo(() => {
    if (savingsCashflow?.monthly && savingsCashflow.monthly.length > 0) {
      return savingsCashflow.monthly.map(m => ({
        month: m.month,
        income: m.income || 0,
        spending: m.expenses || 0,
        net: (m.income || 0) - (m.expenses || 0)
      }));
    }
    return [];
  }, [savingsCashflow]);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      
      {/* 1. Greeting & Dominant Story Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2 border-b border-[#E4E8E3]/30">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
            Good afternoon, {userName}
          </h2>
          <p className={`text-xs mt-1 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            Here's how your finances are looking this month.
          </p>
        </div>
        <div className={`text-xs font-semibold px-3 py-1 rounded-full border ${
          isDark ? 'bg-[#1C251F] text-[#7FC39A] border-[#2A352D]' : 'bg-[#F1F8F4] text-[#285A3A] border-[#C6E4D2]'
        }`}>
          {selectedPeriod}
        </div>
      </div>

      {/* 2. Financial Overview: Single Visual Group with Calculation Proofs */}
      <div className={`p-6 rounded-[16px] border ${
        isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
      }`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:divide-x sm:divide-[#E4E8E3]/20">
          
          <div className="sm:pr-4">
            <MetricValue
              label="Net Worth"
              value={formatCurrency(metrics.netWorth)}
              onHowCalculated={() => setProofMetric('netWorth')}
              size="md"
            />
          </div>

          <div className="sm:px-4">
            <MetricValue
              label="Bank Balance"
              value={formatCurrency(metrics.bankBalance)}
              subtext="Liquid available"
              onHowCalculated={() => setProofMetric('bankBalance')}
              size="md"
            />
          </div>

          <div className="sm:px-4">
            <MetricValue
              label="Monthly Income"
              value={formatCurrency(metrics.monthlyIncome)}
              trend={metrics.incomeTrend}
              onHowCalculated={() => setProofMetric('income')}
              size="md"
            />
          </div>

          <div className="sm:pl-4">
            <MetricValue
              label="Monthly Spending"
              value={formatCurrency(metrics.monthlySpending)}
              trend={metrics.spendingTrend}
              onHowCalculated={() => setProofMetric('spending')}
              size="md"
            />
          </div>

        </div>
      </div>

      {/* 3. Cash Flow Chart: Calm, Precise Line / Area */}
      <div className={`p-6 rounded-[16px] border ${
        isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className={`text-sm font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
              Cash Flow Trend
            </h3>
            <p className={`text-[11px] ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Net movement across connected accounts
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#3F8F5E]" />
              <span className={isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}>Income</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#A77B58]" />
              <span className={isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}>Spending</span>
            </div>
            {onNavigateCashFlow && (
              <button
                type="button"
                onClick={onNavigateCashFlow}
                className="hidden sm:inline-flex items-center gap-1 text-xs text-[#3F8F5E] hover:underline cursor-pointer border-0 bg-transparent font-semibold"
              >
                <span>Full Cash Flow</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="h-64 w-full flex items-center justify-center text-xs text-[#8B978F]">
            No cash flow trend data available. Import bank statements to view trends.
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3F8F5E" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#3F8F5E" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#A77B58" stopOpacity={0.12}/>
                    <stop offset="95%" stopColor="#A77B58" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={val => `₹${(val / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(val) => [formatCurrency(val), '']} />
                <Area type="monotone" dataKey="income" name="Income" stroke="#3F8F5E" strokeWidth={2} fillOpacity={1} fill="url(#incomeGrad)" />
                <Area type="monotone" dataKey="spending" name="Spending" stroke="#A77B58" strokeWidth={2} fillOpacity={1} fill="url(#spendGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 4. Two-Column Layout: Spending Breakdown + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Spending Breakdown (Horizontal Bars, Clickable!) */}
        <div className={`p-6 rounded-[16px] border flex flex-col justify-between ${
          isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className={`text-sm font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
                  Spending by Category
                </h3>
                <p className={`text-[11px] ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                  {selectedPeriod ? `${selectedPeriod} total:` : 'Total:'} {formatCurrency(metrics.monthlySpending)} (Click category to filter ledger)
                </p>
              </div>
            </div>

            {categoryBreakdown.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8B978F]">
                No spending categories recorded for this period
              </div>
            ) : (
              <div className="space-y-4 my-2">
                {categoryBreakdown.map((cat, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => handleCategoryClick(cat.name)}
                    className="space-y-1.5 cursor-pointer group p-1 rounded-[8px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    title={`Filter transactions for ${cat.name}`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-medium group-hover:text-[#3F8F5E] transition-colors ${
                        isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'
                      }`}>
                        {cat.name} →
                      </span>
                      <span className="tabular-nums font-semibold">
                        {formatCurrency(cat.amount)}
                      </span>
                    </div>
                    <div className={`w-full h-1.5 rounded-full overflow-hidden ${
                      isDark ? 'bg-[#1C251F]' : 'bg-[#F1F8F4]'
                    }`}>
                      <div 
                        className="h-full rounded-full transition-all duration-300"
                        style={{ 
                          width: `${cat.percentage}%`,
                          backgroundColor: idx === 0 ? '#5BAE78' : idx === 1 ? '#A77B58' : '#7FC39A'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[#E4E8E3]/20 mt-4">
            <span className={`text-[11px] ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Horizontal bars show proportional distribution. Click any bar to drill down in ledger.
            </span>
          </div>
        </div>

        {/* Recent Transactions List */}
        <div className={`p-6 rounded-[16px] border flex flex-col justify-between ${
          isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className={`text-sm font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
                  Recent Transactions
                </h3>
                <p className={`text-[11px] ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                  Latest activity across accounts
                </p>
              </div>
              {onNavigateTransactions && (
                <button
                  type="button"
                  onClick={onNavigateTransactions}
                  className="inline-flex items-center gap-1 text-xs text-[#3F8F5E] hover:underline cursor-pointer border-0 bg-transparent font-semibold"
                >
                  <span>View All</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="divide-y divide-[#E4E8E3]/20 -mx-3">
              {recentTransactions.map((tx, idx) => (
                <TransactionRow
                  key={tx.id || idx}
                  transaction={tx}
                  onClick={onSelectTransaction}
                />
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-[#E4E8E3]/20 mt-2 flex items-center justify-between text-xs">
            <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>
              Click any transaction for source evidence
            </span>
            <button
              type="button"
              onClick={onNavigateTransactions}
              className="text-[#3F8F5E] font-medium border-0 bg-transparent p-0 cursor-pointer"
            >
              Open Ledger →
            </button>
          </div>
        </div>

      </div>

      {/* 5. One Thing Worth Knowing (Deterministic Backend Insight) */}
      <div className={`p-5 sm:p-6 rounded-[16px] border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
        isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FAF6F1] border-[#E5D4C1]'
      }`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="brown" size="xs">
              ONE THING WORTH KNOWING
            </Badge>
            <span className="text-[11px] text-[#A77B58] font-medium">Deterministic Rule</span>
          </div>
          <h4 className={`text-sm sm:text-base font-bold ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
            {primaryInsight.headline}
          </h4>
          <p className={`text-xs ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
            {primaryInsight.detail}
          </p>
        </div>

        {onNavigateInsights && (
          <Button
            variant="brown"
            size="sm"
            onClick={onNavigateInsights}
            className="shrink-0"
          >
            <span>View spending trends</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Calculation Proof Modal */}
      <CalculationProofModal
        isOpen={!!proofMetric}
        onClose={() => setProofMetric(null)}
        metricType={proofMetric}
      />

    </div>
  );
};
