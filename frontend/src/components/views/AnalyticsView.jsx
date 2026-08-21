import React, { useMemo, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { 
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, 
  BarChart, Bar, Legend, PieChart, Pie, Cell, Line, ComposedChart
} from 'recharts';
import { Activity, PieChart as PieChartIcon, BarChart3, Layers, Eye, EyeOff } from 'lucide-react';
import { CalendarHeatmap } from '../organisms/CalendarHeatmap';
import { AnalyticsDrilldownModal } from '../organisms/AnalyticsDrilldownModal';
import { RecurringBillsWatchdog } from '../organisms/RecurringBillsWatchdog';
import { isInternalFlow } from '../../utils/analytics';

export const AnalyticsView = () => {
  const { theme, style } = useTheme();
  const { transactions, accounts, openInLedger } = useFinance();
  
  const [timeframe, setTimeframe] = useState('all');
  const [flowFilter, setFlowFilter] = useState('OUTFLOW'); 
  const [activeCategory, setActiveCategory] = useState(null);
  const [showSavingsLine, setShowSavingsLine] = useState(true);

  const timeFilteredTxs = useMemo(() => {
    if (timeframe === 'all') return transactions;
    const now = new Date();
    let cutoff = new Date(0);
    if (timeframe === '1m') cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    else if (timeframe === '3m') cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    else if (timeframe === '1y') cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    return transactions.filter(t => new Date(t.date) >= cutoff);
  }, [transactions, timeframe]);

  const filteredTxs = useMemo(() => {
    return timeFilteredTxs.filter(tx => {
      const amt = parseFloat(tx.amount);
      const isInternal = isInternalFlow(tx);
      if (flowFilter === 'ALL') return true;
      if (flowFilter === 'OUTFLOW') return amt < 0 && !isInternal && !tx.is_excluded_from_spending;
      if (flowFilter === 'INFLOW') return amt > 0 && !isInternal;
      if (flowFilter === 'TRANSFERS') return isInternal;
      return true;
    });
  }, [timeFilteredTxs, flowFilter]);

  const goToLedger = (filters) => {
    openInLedger({
      flow: flowFilter,
      ...filters
    });
  };

  const payloadRow = (data) => data?.payload || data || {};

  // 1. Dynamic Stacked Categories for Burn Rate
  const { topCategoryKeys, burnRateData } = useMemo(() => {
    const categoryTotals = {};
    filteredTxs.forEach(tx => {
      const amt = parseFloat(tx.amount);
      if (flowFilter === 'INFLOW' && amt <= 0) return;
      if (flowFilter !== 'INFLOW' && amt >= 0 && flowFilter !== 'ALL' && flowFilter !== 'TRANSFERS') return;
      if (amt < 0 || flowFilter === 'INFLOW' || (flowFilter === 'TRANSFERS' && amt !== 0)) {
        const cat = tx.category || 'Other';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(amt);
      }
    });

    const sortedCats = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);
    const top4 = sortedCats.slice(0, 4);

    const grouped = {};
    filteredTxs.forEach(tx => {
      const amt = parseFloat(tx.amount);
      if (!tx.date) return;
      const d = new Date(tx.date);
      const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!grouped[key]) {
        grouped[key] = {
          name: key,
          yearMonth,
          timestamp: d.getTime(),
          Income: 0,
          TotalSpend: 0,
          Transfers: 0,
          Other: 0
        };
        top4.forEach(cat => { grouped[key][cat] = 0; });
      }

      const isInternal = isInternalFlow(tx);
      if (isInternal) {
        grouped[key].Transfers += Math.abs(amt);
      }
      if (amt > 0 && !isInternal) {
        grouped[key].Income += amt;
      } else if (amt < 0 && !tx.is_excluded_from_spending && !isInternal) {
        const spendAmt = Math.abs(amt);
        grouped[key].TotalSpend += spendAmt;
        const cat = tx.category || 'Other';
        if (top4.includes(cat)) grouped[key][cat] += spendAmt;
        else grouped[key].Other += spendAmt;
      } else if (isInternal) {
        const cat = tx.category || 'Other';
        if (flowFilter === 'TRANSFERS') {
          if (top4.includes(cat)) grouped[key][cat] = (grouped[key][cat] || 0) + Math.abs(amt);
          else grouped[key].Other += Math.abs(amt);
        }
      }
    });

    const result = Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
    result.forEach(r => {
      if (r.Income > 0) {
        let rate = ((r.Income - r.TotalSpend) / r.Income) * 100;
        if (rate < -100) rate = -100;
        if (rate > 100) rate = 100;
        r.SavingsRate = Math.round(rate * 10) / 10;
      } else {
        r.SavingsRate = null;
      }
    });

    return { topCategoryKeys: top4, burnRateData: result };
  }, [filteredTxs, flowFilter]);

  // 2. Category Breakdown (Bar Chart)
  const categoryData = useMemo(() => {
    const grouped = {};
    filteredTxs.forEach(tx => {
      const amt = parseFloat(tx.amount);
      if (flowFilter === 'INFLOW' && amt <= 0) return;
      if (flowFilter === 'OUTFLOW' && amt >= 0) return;
      if (amt === 0) return;
      const cat = tx.category || 'Other';
      if (!grouped[cat]) grouped[cat] = { name: cat, Spend: 0 };
      grouped[cat].Spend += Math.abs(amt);
    });
    return Object.values(grouped).sort((a, b) => b.Spend - a.Spend).slice(0, 10);
  }, [filteredTxs, flowFilter]);

  // 3. Payment Rail Donut
  const paymentRailData = useMemo(() => {
    let upi = 0, cc = 0, other = 0;
    filteredTxs.forEach(tx => {
      const amt = parseFloat(tx.amount);
      if (flowFilter === 'OUTFLOW' && amt >= 0) return;
      if (flowFilter === 'INFLOW' && amt <= 0) return;
      const acct = accounts.find(a => String(a.id) === String(tx.account_id));
      const desc = (tx.description || '').toUpperCase();
      const volume = Math.abs(amt);
      if (desc.includes('UPI') || desc.includes('UPI-') || desc.includes('/UPI/')) {
        upi += volume;
      } else if (acct?.subtype === 'CREDIT_CARD') {
        cc += volume;
      } else {
        other += volume;
      }
    });
    return [
      { name: 'UPI', value: Math.round(upi), rail: 'UPI' },
      { name: 'Credit Card', value: Math.round(cc), rail: 'CREDIT_CARD' },
      { name: 'Debit/NetBanking', value: Math.round(other), rail: 'OTHER' }
    ].filter(d => d.value > 0);
  }, [filteredTxs, accounts, flowFilter]);

  // 4. Accurate Average Daily Burn & Run-Rate Calculation
  const velocityMetrics = useMemo(() => {
    // Isolate pure spending transactions within active timeframe
    const spendTxs = timeFilteredTxs.filter(tx => {
      const amt = parseFloat(tx.amount);
      return amt < 0 && !isInternalFlow(tx) && !tx.is_excluded_from_spending;
    });

    const totalSpend = spendTxs.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0);

    let daysElapsed = 30;
    let label = 'Avg based on last 30 days';

    if (timeframe === '1m') {
      daysElapsed = 30;
      label = 'Avg based on last 30 days';
    } else if (timeframe === '3m') {
      daysElapsed = 90;
      label = 'Avg based on last 90 days';
    } else if (timeframe === '1y') {
      daysElapsed = 365;
      label = 'Avg based on last 365 days';
    } else if (timeframe === 'all') {
      if (spendTxs.length > 0) {
        const timestamps = spendTxs.map(t => new Date(t.date).getTime()).filter(t => !isNaN(t));
        const minT = Math.min(...timestamps);
        const maxT = Math.max(...timestamps);
        daysElapsed = Math.max(1, Math.round((maxT - minT) / (1000 * 60 * 60 * 24)));
        const years = (daysElapsed / 365.25).toFixed(1);
        label = `Avg across ${years} years (${daysElapsed.toLocaleString()} days)`;
      } else {
        daysElapsed = 1;
        label = 'No spending recorded';
      }
    }

    const dailyBurnRate = totalSpend / Math.max(1, daysElapsed);
    const projectedMonthly = dailyBurnRate * 30;

    return {
      dailyBurnRate,
      projectedMonthly,
      totalSpend,
      daysElapsed,
      label
    };
  }, [timeFilteredTxs, timeframe]);

  const STACK_COLORS = ['#FF7E67', '#4A90E2', '#10b981', '#F5A623'];
  const COLORS = ['#FF7E67', '#4A90E2', '#10b981', '#F5A623', '#9B9B9B', '#D0021B', '#7ED321', '#BD10E0', '#9013FE', '#4A4A4A'];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 pb-12">
      
      {/* Header & Flow Filters */}
      <div className={`p-4 sm:p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-[#FF7E67]" />
        <div className="flex flex-col gap-1">
          <h2 className={`text-xl font-bold ${style('text-white', 'text-slate-800')}`}>Financial Intelligence</h2>
          <span className="text-[11px] font-semibold text-slate-500">
            Showing {filteredTxs.length} {flowFilter === 'OUTFLOW' ? 'outflow' : flowFilter === 'INFLOW' ? 'inflow' : flowFilter === 'TRANSFERS' ? 'transfer' : ''} transactions
          </span>
        </div>
        </div>
        
        <div className={`flex flex-wrap p-1 rounded-xl gap-1 ${style('bg-[#1a1a2e]', 'bg-slate-200')} self-start sm:self-auto`}>
          {['ALL', 'OUTFLOW', 'INFLOW', 'TRANSFERS'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFlowFilter(f)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border-0 cursor-pointer ${
                flowFilter === f 
                  ? (theme === 'dark' ? 'bg-[#FF7E67] text-white shadow-lg' : 'bg-white text-slate-800 shadow') 
                  : (theme === 'dark' ? 'text-slate-400 hover:text-slate-200 hover:bg-[#24243E]' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-300')
              }`}
            >
              {f === 'OUTFLOW' ? 'Pure Outflow' : f}
            </button>
          ))}
        </div>

        <div className={`flex flex-wrap p-1 rounded-xl gap-1 ${style('neu-inset-dark', 'neu-inset-light')} self-start sm:self-auto`}>
          {[
            { key: '1m', label: '1M' },
            { key: '3m', label: '3M' },
            { key: '1y', label: '1Y' },
            { key: 'all', label: 'All' },
          ].map((tf) => (
            <button
              key={tf.key}
              type="button"
              onClick={() => setTimeframe(tf.key)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border-0 cursor-pointer ${
                timeframe === tf.key
                  ? (theme === 'dark' ? 'bg-[#FF7E67] text-white shadow-lg' : 'bg-white text-slate-800 shadow')
                  : (theme === 'dark' ? 'text-slate-400 hover:text-slate-200 hover:bg-[#24243E]' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-300')
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 1: MoM Burn Rate (Full Width) */}
      <div className="w-full">
        <div className={`p-6 rounded-2xl flex flex-col gap-4 border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between items-start gap-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                {flowFilter === 'INFLOW' ? 'Monthly Inflows' : flowFilter === 'TRANSFERS' ? 'Monthly Transfers' : 'Monthly Burn Rate & Savings %'}
              </h3>
            </div>
            {flowFilter === 'ALL' && (
            <button 
              type="button"
              onClick={() => setShowSavingsLine(!showSavingsLine)}
              className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${showSavingsLine ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}
            >
              {showSavingsLine ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {showSavingsLine ? 'Hide Savings % Line' : 'Show Savings % Line'}
            </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500 font-medium">Click a bar segment to open that month in the ledger.</p>
          <div className="w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={burnRateData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#1A1A2E' : '#E2E8F0'} />
                <XAxis dataKey="name" stroke="#8d99ae" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
                <YAxis yAxisId="left" stroke="#8d99ae" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `₹${v>=1000 ? (v/1000)+'k' : v}`} />
                {showSavingsLine && flowFilter === 'ALL' && (
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    stroke="#10b981" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={v => `${v}%`} 
                    domain={[-100, 100]} 
                  />
                )}
                <Tooltip 
                  contentStyle={{ backgroundColor: theme==='dark'?'#0F0F1A':'#FFF', borderColor: theme==='dark'?'#24243E':'#A3B1C6', borderRadius: '12px', color: theme==='dark'?'#EAEAEA':'#333' }}
                  formatter={(val, name) => [
                    name === 'SavingsRate' ? (val !== null ? `${val}%` : 'N/A') : `₹${Math.round(val || 0).toLocaleString()}`, 
                    name === 'SavingsRate' ? 'Savings Rate' : name
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />

                {burnRateData.length === 0 && (
                  <text x="50%" y="50%" textAnchor="middle" fill="#8d99ae" fontSize="12">
                    No transactions in this view
                  </text>
                )}
                
                {flowFilter !== 'INFLOW' && topCategoryKeys.map((cat, idx) => (
                  <Bar 
                    key={cat} 
                    yAxisId="left" 
                    dataKey={cat} 
                    stackId="a" 
                    fill={STACK_COLORS[idx % STACK_COLORS.length]} 
                    barSize={24}
                    cursor="pointer"
                    onClick={(data) => goToLedger({ month: payloadRow(data).yearMonth, category: cat })}
                  />
                ))}
                
                {flowFilter !== 'INFLOW' && (
                  <Bar 
                    yAxisId="left" 
                    dataKey="Other" 
                    stackId="a" 
                    fill={theme === 'dark' ? '#24243E' : '#CBD5E1'} 
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={(data) => goToLedger({ month: payloadRow(data).yearMonth })}
                  />
                )}

                {(flowFilter === 'INFLOW' || flowFilter === 'ALL') && (
                  <Bar
                    yAxisId="left"
                    dataKey="Income"
                    stackId={flowFilter === 'INFLOW' ? 'a' : 'income'}
                    fill="#10b981"
                    barSize={flowFilter === 'INFLOW' ? 24 : 10}
                    cursor="pointer"
                    radius={[4, 4, 0, 0]}
                    onClick={(data) => goToLedger({ month: payloadRow(data).yearMonth, flow: 'INFLOW' })}
                  />
                )}

                {showSavingsLine && flowFilter === 'ALL' && (
                  <Line 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="SavingsRate" 
                    stroke="#10b981" 
                    strokeWidth={2.5} 
                    connectNulls={false}
                    dot={{ r: 4, fill: '#10b981', strokeWidth: 0, cursor: 'pointer' }}
                    activeDot={{ r: 6, onClick: (_e, dot) => goToLedger({ month: payloadRow(dot).yearMonth, flow: 'ALL' }) }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2: Heatmap (Full Width) */}
      <div className="w-full overflow-hidden">
        <CalendarHeatmap
          transactions={filteredTxs}
          onDayClick={(date) => goToLedger({ date, month: date.slice(0, 7), flow: flowFilter })}
        />
      </div>

      {/* Row 3: Top Categories & Payment Rail Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Categories */}
        <div className={`p-6 rounded-2xl flex flex-col gap-4 border-0 h-96 ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Top Categories (Click to Deep-Dive)</h3>
            </div>
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical" margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme === 'dark' ? '#1A1A2E' : '#E2E8F0'} />
                <XAxis type="number" stroke="#8d99ae" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `₹${v>=1000 ? (v/1000)+'k' : v}`} />
                <YAxis dataKey="name" type="category" stroke="#8d99ae" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{fill: theme === 'dark' ? '#24243E' : '#E2E8F0'}}
                  contentStyle={{ backgroundColor: theme==='dark'?'#0F0F1A':'#FFF', borderColor: theme==='dark'?'#24243E':'#A3B1C6', borderRadius: '12px', color: theme==='dark'?'#EAEAEA':'#333' }}
                  formatter={(val) => [`₹${Math.round(val).toLocaleString()}`, flowFilter === 'INFLOW' ? 'Inflow' : 'Volume']}
                />
                <Bar 
                  dataKey="Spend" 
                  radius={[0, 4, 4, 0]} 
                  barSize={20}
                  cursor="pointer"
                  onClick={(data) => {
                    const name = data?.name || data?.payload?.name;
                    setActiveCategory(name);
                  }}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Rail Split */}
        <div className={`p-6 rounded-2xl flex flex-col gap-4 border-0 h-96 ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Payment Rails</h3>
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentRailData}
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                  cursor="pointer"
                  onClick={(data) => {
                    const rail = data?.rail || data?.payload?.rail;
                    if (rail) goToLedger({ rail, flow: flowFilter });
                  }}
                >
                  {paymentRailData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: theme==='dark'?'#0F0F1A':'#FFF', borderColor: theme==='dark'?'#24243E':'#A3B1C6', borderRadius: '12px', color: theme==='dark'?'#EAEAEA':'#333' }}
                  formatter={(val) => [`₹${val.toLocaleString()}`, 'Volume']}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 4: KPI Cards (Watchdog, Velocity) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecurringBillsWatchdog
          transactions={transactions}
          onSelectMerchant={(merchant) => goToLedger({ search: merchant, flow: 'OUTFLOW' })}
        />

        <div className={`p-6 rounded-2xl flex flex-col justify-center gap-2 border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Average Daily Burn Rate</h3>
          </div>
          
          <div className={`text-4xl font-black ${style('text-white', 'text-slate-800')}`}>
            ₹{velocityMetrics.dailyBurnRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            <span className="text-sm text-slate-500 font-medium ml-2">/ day</span>
          </div>

          <div className="text-xs font-bold text-slate-500 mt-2 flex flex-col gap-1">
            <span>{velocityMetrics.label}</span>
            <span>
              Monthly Run-Rate: <strong className={style('text-[#FF7E67]', 'text-red-500')}>₹{velocityMetrics.projectedMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
            </span>
          </div>
        </div>
      </div>

      {activeCategory && (
        <AnalyticsDrilldownModal 
          category={activeCategory} 
          transactions={filteredTxs} 
          onClose={() => setActiveCategory(null)}
          onOpenInLedger={() => {
            goToLedger({ category: activeCategory, flow: flowFilter });
            setActiveCategory(null);
          }}
        />
      )}
    </div>
  );
};
