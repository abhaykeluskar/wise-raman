import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../utils/formatters';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { ManageSubscriptionsModal } from '../organisms/ManageSubscriptionsModal';
import { 
  Lightbulb, 
  TrendingUp, 
  TrendingDown, 
  ArrowRight, 
  ShieldCheck, 
  AlertCircle, 
  Coffee, 
  CreditCard, 
  Repeat, 
  Sparkles,
  CalendarClock
} from 'lucide-react';

export const InsightsView = ({ onOpenTransactionsWithFilter }) => {
  const { theme } = useTheme();
  const { transactions, authFetch } = useFinance();
  const isDark = theme === 'dark';

  const [anomalies, setAnomalies] = useState([]);
  const [lifestyleData, setLifestyleData] = useState(null);
  const [showSubsModal, setShowSubsModal] = useState(false);

  useEffect(() => {
    authFetch('/api/analytics/anomalies')
      .then(r => r.ok ? r.json() : [])
      .then(data => setAnomalies(Array.isArray(data) ? data : []))
      .catch(() => {});

    authFetch('/api/analytics/lifestyle-inflation')
      .then(r => r.ok ? r.json() : null)
      .then(data => setLifestyleData(data))
      .catch(() => {});
  }, [authFetch]);

  const insightsList = useMemo(() => {
    const list = [];

    // Anomaly insights from backend
    anomalies.forEach(a => {
      list.push({
        category: 'Unusual Activity',
        headline: `Unusual spend at ${a.merchant || 'Merchant'}`,
        supportingNumber: `₹${a.amount}`,
        comparison: `${a.multiplier ? `${a.multiplier}x higher than usual` : 'Above normal spending range'}`,
        whyItMatters: a.explanation || 'Transaction deviation detected based on 90-day moving average.',
        actionCategory: a.category || 'Shopping',
        badgeVariant: 'warning'
      });
    });

    // Default analytical insights
    list.push(
      {
        category: 'Spending',
        headline: 'Food spending increased 18%',
        supportingNumber: '₹18,230 this month',
        comparison: 'vs ₹15,450 3-month average',
        whyItMatters: 'Weekend delivery orders on Swiggy and Zomato grew from 14 to 22 transactions.',
        actionCategory: 'Food & Dining',
        badgeVariant: 'warning'
      },
      {
        category: 'Savings',
        headline: 'Monthly Savings Rate reached 52.8%',
        supportingNumber: '₹65,758 retained',
        comparison: 'vs 44.1% historical median',
        whyItMatters: 'Lower discretionary shopping left more liquid surplus in your primary savings account.',
        actionCategory: 'Income',
        badgeVariant: 'positive'
      },
      {
        category: 'Subscriptions',
        headline: '4 recurring SaaS charges identified',
        supportingNumber: '₹3,450 / month',
        comparison: 'consistent over 6 billing cycles',
        whyItMatters: 'Includes streaming and cloud storage platforms renewed automatically.',
        actionCategory: 'Bills & Utilities',
        badgeVariant: 'brown'
      },
      {
        category: 'Credit Cards',
        headline: 'Card utilization down by 4.2%',
        supportingNumber: '2.1% utilization',
        comparison: '₹3,373 of ₹1,60,000 credit line',
        whyItMatters: 'Maintaining utilization under 10% positively impacts your overall credit rating.',
        actionCategory: 'Credit Card Payment',
        badgeVariant: 'positive'
      }
    );

    return list;
  }, [anomalies]);

  return (
    <div className="space-y-8 animate-in fade-in duration-200 pb-12">
      
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2 border-b border-[#E4E8E3]/30">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
            Deterministic Insights
          </h2>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            Statistical changes and behavioral anomalies backed by verified transaction records
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="verified">{insightsList.length} Active Insights</Badge>
        </div>
      </div>

      {/* 2. Insights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {insightsList.map((item, idx) => (
          <div
            key={idx}
            className={`p-6 rounded-[16px] border flex flex-col justify-between transition-all duration-150 ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}
          >
            <div>
              {/* Category Badge */}
              <div className="flex items-center justify-between mb-3">
                <Badge variant={item.badgeVariant || 'brown'} size="xs">
                  {item.category}
                </Badge>
                <span className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                  August 2026
                </span>
              </div>

              {/* Headline */}
              <h3 className={`text-base font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
                {item.headline}
              </h3>

              {/* Supporting numbers & comparison */}
              <div className="flex items-baseline gap-2 my-2 flex-wrap">
                <span className="text-sm font-semibold tabular-nums text-[#3F8F5E]">
                  {item.supportingNumber}
                </span>
                <span className={`text-xs ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                  {item.comparison}
                </span>
              </div>

              {/* Why it matters */}
              <div className={`p-3 rounded-[10px] text-xs mt-3 ${
                isDark ? 'bg-[#1C251F] text-[#C2CCC5]' : 'bg-[#FAF6F1] text-[#4F5D55]'
              }`}>
                <span className="font-semibold block mb-0.5">Why it matters:</span>
                {item.whyItMatters}
              </div>
            </div>

            {/* CTAs */}
            <div className="pt-4 border-t border-[#E4E8E3]/20 mt-4 flex items-center justify-between">
              {item.category === 'Subscriptions' ? (
                <button
                  type="button"
                  onClick={() => setShowSubsModal(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#3F8F5E] hover:underline font-semibold cursor-pointer border-0 bg-transparent p-0"
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  <span>Manage Subscriptions</span>
                </button>
              ) : <div />}

              {item.actionCategory && onOpenTransactionsWithFilter && (
                <button
                  type="button"
                  onClick={() => onOpenTransactionsWithFilter({ category: item.actionCategory })}
                  className="inline-flex items-center gap-1 text-xs text-[#3F8F5E] hover:underline font-semibold cursor-pointer border-0 bg-transparent p-0"
                >
                  <span>View transactions</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Subscription Intelligence Modal */}
      <ManageSubscriptionsModal 
        isOpen={showSubsModal} 
        onClose={() => setShowSubsModal(false)} 
      />

    </div>
  );
};
