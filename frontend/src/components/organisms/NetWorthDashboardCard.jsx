import React, { useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../utils/formatters';
import { TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts';

export const NetWorthDashboardCard = () => {
  const { style, theme } = useTheme();
  const { netWorth, cashflow } = useFinance();

  // Construct timeline from current net worth backwards using historical cashflow
  const timelineData = useMemo(() => {
    if (!netWorth || !cashflow || cashflow.length === 0) return [];
    
    let currentNW = parseFloat(netWorth.net_worth || 0);
    const data = [];
    
    // cashflow is chronologically sorted from oldest to newest usually. Let's reverse it to go backwards
    const reversedCashflow = [...cashflow].reverse();
    
    // Add current month first
    data.push({
      month: 'Now',
      netWorth: currentNW
    });
    
    // Work backwards
    for (let i = 0; i < reversedCashflow.length; i++) {
      const cf = reversedCashflow[i];
      // Net flow for the month
      const netFlow = (cf.cash_in || 0) - (cf.cash_out || 0);
      
      // Before this month's flow, the net worth was:
      currentNW = currentNW - netFlow;
      
      data.unshift({
        month: cf.month,
        netWorth: currentNW
      });
    }
    
    return data;
  }, [netWorth, cashflow]);

  const totalAssets = parseFloat(netWorth?.total_assets || 0);
  const totalLiabilities = parseFloat(netWorth?.total_liabilities || 0);
  const currentNW = parseFloat(netWorth?.net_worth || 0);

  return (
    <div className={`p-6 rounded-2xl border-0 flex flex-col justify-between transition-all duration-300 min-h-[320px] ${style('neu-flat-dark', 'neu-flat-light')}`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Net Worth Dashboard
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className={`p-4 rounded-xl ${style('neu-inset-dark', 'neu-inset-light')}`}>
            <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1"><ArrowUpRight className="h-3 w-3 text-emerald-400"/> Assets</span>
            <div className="text-lg font-black text-emerald-400">{formatCurrency(totalAssets)}</div>
          </div>
          <div className={`p-4 rounded-xl ${style('neu-inset-dark', 'neu-inset-light')}`}>
            <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1"><ArrowDownRight className="h-3 w-3 text-red-400"/> Liabilities</span>
            <div className="text-lg font-black text-red-400">{formatCurrency(totalLiabilities)}</div>
          </div>
        </div>
        
        {/* Timeline Chart */}
        {timelineData.length > 0 ? (
          <div className="h-32 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNW" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: theme==='dark'?'#0F0F1A':'#FFF', borderColor: theme==='dark'?'#24243E':'#A3B1C6', borderRadius: '12px' }}
                  formatter={(val) => [formatCurrency(val), 'Net Worth']}
                />
                <Area type="monotone" dataKey="netWorth" stroke="#10b981" fillOpacity={1} fill="url(#colorNW)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-500 italic">
            Import statements to build your net worth timeline.
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800/10 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Total Net Worth
        </span>
        <span className="text-xl font-black text-emerald-400 tabular-nums">
          {formatCurrency(currentNW)}
        </span>
      </div>
    </div>
  );
};
