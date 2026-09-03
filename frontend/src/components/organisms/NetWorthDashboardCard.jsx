import React, { useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../utils/formatters';
import { TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts';

export const NetWorthDashboardCard = () => {
  const { theme } = useTheme();
  const { netWorth, cashflow } = useFinance();
  const isDark = theme === 'dark';

  const timelineData = useMemo(() => {
    if (!netWorth || !cashflow || cashflow.length === 0) return [];
    
    let currentNW = parseFloat(netWorth.net_worth || 0);
    const data = [];
    const reversedCashflow = [...cashflow].reverse();
    
    data.push({
      month: 'Now',
      netWorth: currentNW
    });
    
    for (let i = 0; i < reversedCashflow.length; i++) {
      const cf = reversedCashflow[i];
      const netFlow = (cf.cash_in || 0) - (cf.cash_out || 0);
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
    <div className={`p-6 rounded-[16px] border flex flex-col justify-between transition-all duration-150 min-h-[320px] ${
      isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#3F8F5E]" />
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Net Worth Overview
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className={`p-3.5 rounded-[10px] border ${
            isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
          }`}>
            <span className={`text-[10px] uppercase font-bold flex items-center gap-1 ${
              isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
            }`}>
              <ArrowUpRight className="h-3 w-3 text-[#3F8F5E]"/> Assets
            </span>
            <div className="text-base font-bold text-[#3F8F5E] tabular-nums mt-0.5">{formatCurrency(totalAssets)}</div>
          </div>
          <div className={`p-3.5 rounded-[10px] border ${
            isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
          }`}>
            <span className={`text-[10px] uppercase font-bold flex items-center gap-1 ${
              isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
            }`}>
              <ArrowDownRight className="h-3 w-3 text-[#C85C5C]"/> Liabilities
            </span>
            <div className="text-base font-bold text-[#C85C5C] tabular-nums mt-0.5">{formatCurrency(totalLiabilities)}</div>
          </div>
        </div>
        
        {/* Timeline Chart */}
        {timelineData.length > 0 ? (
          <div className="h-28 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNW" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3F8F5E" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#3F8F5E" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" hide />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: isDark ? '#171E19' : '#FFFFFF', 
                    borderColor: isDark ? '#2A352D' : '#E4E8E3', 
                    borderRadius: '10px',
                    fontSize: '12px'
                  }}
                  formatter={(val) => [formatCurrency(val), 'Net Worth']}
                />
                <Area type="monotone" dataKey="netWorth" stroke="#3F8F5E" fillOpacity={1} fill="url(#colorNW)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className={`py-8 text-center text-xs italic ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            Import statements to build your net worth timeline.
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-[#E4E8E3]/20 flex items-center justify-between">
        <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
          Net Worth
        </span>
        <span className="text-lg font-bold text-[#3F8F5E] tabular-nums">
          {formatCurrency(currentNW)}
        </span>
      </div>
    </div>
  );
};
