import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../utils/formatters';
import { CalendarClock, AlertCircle, CheckCircle2 } from 'lucide-react';

export const SubscriptionTrackerCard = () => {
  const { style } = useTheme();
  const { subscriptions } = useFinance();

  return (
    <div className={`p-6 rounded-2xl border-0 flex flex-col transition-all duration-300 min-h-[320px] ${style('neu-flat-dark', 'neu-flat-light')}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-purple-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Subscription Tracker & Financial Calendar
          </h3>
        </div>
      </div>

      {(!subscriptions || subscriptions.length === 0) ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center text-xs text-slate-500 italic">
          <AlertCircle className="h-6 w-6 mb-2 opacity-50" />
          No recurring subscriptions detected yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {subscriptions.map((sub, idx) => (
            <div key={idx} className={`p-4 rounded-xl flex items-center justify-between border-0 transition-all ${style('neu-inset-dark', 'neu-inset-light')}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 rounded-lg shrink-0 ${style('bg-slate-800/40 text-purple-400', 'bg-slate-200 text-purple-600')}`}>
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold truncate">{sub.name}</span>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                    {sub.frequency} • Next: {new Date(sub.next_expected_date).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black text-red-400 tabular-nums">
                  {formatCurrency(sub.amount)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
