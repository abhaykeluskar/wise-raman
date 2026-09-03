import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { calculateVelocity } from '../../utils/analytics';
import { formatCurrency } from '../../utils/formatters';
import { Zap, TrendingDown, TrendingUp, Calendar } from 'lucide-react';

export const MonthVelocityCard = () => {
  const { theme } = useTheme();
  const { transactions } = useFinance();
  const isDark = theme === 'dark';

  const velocity = React.useMemo(() => calculateVelocity(transactions), [transactions]);
  const isVelocityLower = velocity.velocityTrend <= 0;

  return (
    <div className={`p-6 rounded-[16px] border flex flex-col justify-between transition-all duration-150 min-h-[320px] ${
      isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#B78332]" />
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Current Month Velocity
            </h3>
          </div>
          <span className={`text-xs font-medium flex items-center gap-1 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            <Calendar className="h-3.5 w-3.5" /> Day {velocity.currentDay} of {velocity.daysInCurrentMonth}
          </span>
        </div>

        {/* Velocity Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          {/* Daily Burn Rate */}
          <div className={`p-3.5 rounded-[10px] border ${
            isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${
              isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
            }`}>
              Daily Burn Rate
            </span>
            <h4 className="text-xl font-bold text-[#B78332] mt-1 tabular-nums">
              {formatCurrency(velocity.dailyBurnRate, false)}/day
            </h4>
            <span className={`text-[11px] mt-0.5 block font-medium ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Avg based on {velocity.currentDay} days
            </span>
          </div>

          {/* Projected Month End */}
          <div className={`p-3.5 rounded-[10px] border ${
            isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${
              isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
            }`}>
              Projected Outflow
            </span>
            <h4 className="text-xl font-bold text-[#C85C5C] mt-1 tabular-nums">
              {formatCurrency(velocity.projectedMonthEnd, false)}
            </h4>
            <span className={`text-[11px] mt-0.5 block font-medium ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Month-end forecast
            </span>
          </div>
        </div>
      </div>

      {/* MoM Velocity Comparison */}
      <div className={`mt-4 p-3 rounded-[10px] border flex items-center justify-between ${
        isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-[6px] ${
            isVelocityLower ? 'bg-[#3F8F5E]/15 text-[#3F8F5E]' : 'bg-[#C85C5C]/15 text-[#C85C5C]'
          }`}>
            {isVelocityLower ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold">Velocity Trajectory</span>
            <span className={`text-[11px] ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Spend trajectory vs last month
            </span>
          </div>
        </div>

        <span className={`text-xs font-bold tabular-nums ${isVelocityLower ? 'text-[#3F8F5E]' : 'text-[#C85C5C]'}`}>
          {velocity.velocityTrend >= 0 ? `+${velocity.velocityTrend.toFixed(1)}%` : `${velocity.velocityTrend.toFixed(1)}%`}
        </span>
      </div>
    </div>
  );
};
