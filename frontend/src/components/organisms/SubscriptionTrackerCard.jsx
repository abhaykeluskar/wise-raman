import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../utils/formatters';
import { CalendarClock, AlertCircle, CheckCircle2, ArrowRight, Sliders, Plus, ExternalLink } from 'lucide-react';
import { ManageSubscriptionsModal } from './ManageSubscriptionsModal';

export const SubscriptionTrackerCard = ({ onNavigateCalendar }) => {
  const { style } = useTheme();
  const { subscriptions, refreshData } = useFinance();
  const [showManageModal, setShowManageModal] = useState(false);

  return (
    <>
      <div className={`p-6 rounded-3xl border-0 flex flex-col transition-all duration-300 min-h-[320px] ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[#5EEAD4]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Subscription Tracker
            </h3>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowManageModal(true)}
              className={`text-xxs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer border-0 bg-transparent transition-all ${style('text-[#5EEAD4] hover:underline', 'text-[#0F766E] hover:underline')}`}
            >
              <Sliders className="h-3 w-3" /> Manage & Optimize
            </button>

            {onNavigateCalendar && (
              <button
                type="button"
                onClick={onNavigateCalendar}
                className={`text-xxs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer border-0 bg-transparent transition-all ${style('text-slate-400 hover:text-[#5EEAD4]', 'text-slate-500 hover:text-[#0F766E]')}`}
              >
                Calendar <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {(!subscriptions || subscriptions.length === 0) ? (
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center text-xs text-slate-500 italic">
            <AlertCircle className="h-6 w-6 mb-2 opacity-50" />
            <p>No recurring subscriptions detected yet.</p>
            <button
              type="button"
              onClick={() => setShowManageModal(true)}
              className={`mt-3 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 border-0 cursor-pointer ${style('neu-btn-dark text-[#5EEAD4]', 'neu-btn-light text-[#0F766E]')}`}
            >
              <Plus className="h-3.5 w-3.5" /> Add Custom Subscription
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {subscriptions.map((sub, idx) => (
              <div 
                key={idx} 
                onClick={() => setShowManageModal(true)}
                className={`p-4 rounded-2xl flex items-center justify-between border-0 transition-all cursor-pointer hover:opacity-90 ${style('neu-inset-dark', 'neu-inset-light')}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-xl shrink-0 ${style('bg-[#151A22] text-[#5EEAD4]', 'bg-white text-[#0F766E] shadow-sm')}`}>
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className={`text-sm font-bold truncate ${style('text-[#F4F7FA]', 'text-[#17202A]')}`}>{sub.name}</span>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1 mt-0.5">
                      {sub.frequency} • Next: {new Date(sub.next_expected_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-rose-400 tabular-nums">
                    {formatCurrency(sub.amount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ManageSubscriptionsModal
        isOpen={showManageModal}
        onClose={() => setShowManageModal(false)}
        onRefreshData={() => {
          if (refreshData) refreshData();
        }}
      />
    </>
  );
};
