import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../utils/formatters';
import { CalendarClock, AlertCircle, CheckCircle2, ArrowRight, Sliders, Plus } from 'lucide-react';
import { ManageSubscriptionsModal } from './ManageSubscriptionsModal';
import { Button } from '../atoms/Button';

export const SubscriptionTrackerCard = ({ onNavigateCalendar }) => {
  const { theme } = useTheme();
  const { subscriptions, refreshData } = useFinance();
  const isDark = theme === 'dark';
  const [showManageModal, setShowManageModal] = useState(false);

  return (
    <>
      <div className={`p-6 rounded-[16px] border flex flex-col transition-all duration-150 min-h-[320px] ${
        isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[#3F8F5E]" />
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Subscription Tracker
            </h3>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowManageModal(true)}
              className="text-xs font-semibold flex items-center gap-1 cursor-pointer border-0 bg-transparent text-[#3F8F5E] hover:underline"
            >
              <Sliders className="h-3 w-3" /> Manage & Optimize
            </button>

            {onNavigateCalendar && (
              <button
                type="button"
                onClick={onNavigateCalendar}
                className={`text-xs font-semibold flex items-center gap-1 cursor-pointer border-0 bg-transparent ${
                  isDark ? 'text-[#8B978F] hover:text-[#F1F5F2]' : 'text-[#7B877F] hover:text-[#1D2822]'
                }`}
              >
                Calendar <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {(!subscriptions || subscriptions.length === 0) ? (
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center text-xs text-[#8B978F]">
            <AlertCircle className="h-6 w-6 mb-2 opacity-50 text-[#8B978F]" />
            <p>No recurring subscriptions detected yet.</p>
            <div className="mt-3">
              <Button
                variant="primary"
                size="xs"
                icon={Plus}
                onClick={() => setShowManageModal(true)}
              >
                Add Subscription
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 flex-1 overflow-y-auto pr-1">
            {subscriptions.map((sub, idx) => (
              <div 
                key={idx} 
                onClick={() => setShowManageModal(true)}
                className={`p-3 rounded-[10px] border flex items-center justify-between transition-colors cursor-pointer ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-1.5 rounded-[6px] bg-[#3F8F5E]/15 text-[#3F8F5E] shrink-0">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold truncate">{sub.name}</span>
                    <span className={`text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1 mt-0.5 ${
                      isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
                    }`}>
                      {sub.frequency} • Next: {new Date(sub.next_expected_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-[#C85C5C] tabular-nums">
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
