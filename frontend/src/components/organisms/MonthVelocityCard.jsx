import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { calculateVelocity } from '../../utils/analytics';
import { formatCurrency } from '../../utils/formatters';
import { Gauge, TrendingDown, TrendingUp, Calendar, Zap } from 'lucide-react';

export const MonthVelocityCard = () => {
  const { style } = useTheme();
  const { transactions } = useFinance();

  const velocity = React.useMemo(() => calculateVelocity(transactions), [transactions]);

  const isVelocityLower = velocity.velocityTrend <= 0;

  return (
    <div className={`p-6 rounded-2xl border-0 flex flex-col justify-between transition-all duration-300 min-h-[320px] ${style('neu-flat-dark', 'neu-flat-light')}`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Current Month Velocity
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Day {velocity.currentDay} of {velocity.daysInCurrentMonth}
          </span>
        </div>

        {/* Velocity Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          
          {/* Daily Burn Rate */}
          <div className={`p-4 rounded-xl border-0 ${style('neu-inset-dark', 'neu-inset-light')}`}>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Daily Burn Rate
            </span>
            <h4 className="text-xl font-black text-amber-400 mt-1 tabular-nums">
              {formatCurrency(velocity.dailyBurnRate, false)}/day
            </h4>
            <span className="text-xs text-slate-400 mt-0.5 block font-normal">
              Avg based on {velocity.currentDay} days
            </span>
          </div>

          {/* Projected Month End */}
          <div className={`p-4 rounded-xl border-0 ${style('neu-inset-dark', 'neu-inset-light')}`}>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Projected Outflow
            </span>
            <h4 className="text-xl font-black mt-1 tabular-nums">
              {formatCurrency(velocity.projectedMonthEnd, false)}
            </h4>
            <span className="text-xs text-slate-400 mt-0.5 block font-normal">
              Month-end forecast
            </span>
          </div>

        </div>
      </div>

      {/* MoM Velocity Comparison */}
      <div className={`mt-4 p-3.5 rounded-xl flex items-center justify-between border-0 ${style('neu-inset-dark', 'neu-inset-light')}`}>
        <div className="flex items-center gap-2">
          {isVelocityLower ? (
            <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400">
              <TrendingDown className="h-4 w-4" />
            </div>
          ) : (
            <div className="p-1.5 rounded-lg bg-red-500/15 text-red-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-xs font-bold">
              Velocity Trend
            </span>
            <span className="text-xs text-slate-400 font-normal">
              Spend trajectory vs last month
            </span>
          </div>
        </div>

        <span className={`text-sm font-extrabold tabular-nums ${isVelocityLower ? 'text-emerald-400' : 'text-red-400'}`}>
          {velocity.velocityTrend >= 0 ? `+${velocity.velocityTrend.toFixed(1)}%` : `${velocity.velocityTrend.toFixed(1)}%`}
        </span>
      </div>
    </div>
  );
};
