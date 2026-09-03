import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { 
  AlertCircle, 
  CheckCircle2, 
  HelpCircle, 
  ArrowRight, 
  ShieldCheck, 
  RefreshCw, 
  Tag, 
  Layers,
  ArrowLeftRight,
  Check,
  X
} from 'lucide-react';

export const ReviewCenterView = () => {
  const { theme } = useTheme();
  const { categories, authFetch, fetchData } = useFinance();
  const isDark = theme === 'dark';

  const [queueItems, setQueueItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCatModalItem, setSelectedCatModalItem] = useState(null);
  const [chosenCategory, setChosenCategory] = useState('');
  const [createRuleCheckbox, setCreateRuleCheckbox] = useState(true);

  // Fetch real review queue items from backend
  const fetchReviewQueue = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/review-queue');
      if (res.ok) {
        const data = await res.json();
        // Flatten critical, important, review, informational lists
        const combined = [
          ...(data.critical || []),
          ...(data.important || []),
          ...(data.review || []),
          ...(data.informational || [])
        ];
        if (combined.length > 0) {
          setQueueItems(combined);
        } else {
          setQueueItems([]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch review queue:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviewQueue();
  }, []);

  // Resolve item handler calling real backend
  const handleResolve = async (item, action, newCat = null) => {
    try {
      const payload = {
        transaction_id: item.id,
        action: action, // 'CONFIRM', 'RECATEGORIZE', 'MARK_TRANSFER', 'IGNORE'
        new_category: newCat || item.category || item.suggestedCategory || 'General',
        create_rule: createRuleCheckbox
      };

      const res = await authFetch('/api/review-queue/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setQueueItems(prev => prev.filter(q => q.id !== item.id));
        setSelectedCatModalItem(null);
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to resolve review item:', err);
      // Fallback local remove
      setQueueItems(prev => prev.filter(q => q.id !== item.id));
      setSelectedCatModalItem(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200 pb-12">
      
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2 border-b border-[#E4E8E3]/30">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
            Needs Review Queue
          </h2>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            {queueItems.length} items require confirmation to ensure 100% mathematical certainty
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchReviewQueue} loading={loading} icon={RefreshCw}>
            Refresh
          </Button>
          <Badge variant={queueItems.length === 0 ? 'positive' : 'warning'}>
            {queueItems.length === 0 ? 'Queue Clean' : `${queueItems.length} Action Items`}
          </Badge>
        </div>
      </div>

      {/* 2. Work Queue List */}
      {queueItems.length > 0 ? (
        <div className="space-y-4">
          {queueItems.map(item => (
            <div
              key={item.id}
              className={`p-6 rounded-[16px] border flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all ${
                isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
              }`}
            >
              <div className="space-y-2 max-w-xl">
                <div className="flex items-center gap-2">
                  <Badge variant={item.type === 'RECONCILIATION_WARNING' ? 'warning' : 'brown'} size="xs">
                    {item.type ? item.type.replace('_', ' ') : 'NEEDS REVIEW'}
                  </Badge>
                  <span className={`text-xs font-bold ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
                    {item.title || item.reason}
                  </span>
                </div>

                {item.raw_text && (
                  <pre className="text-[11px] font-mono p-2 rounded bg-black/10 dark:bg-white/5 overflow-x-auto">
                    {item.raw_text}
                  </pre>
                )}

                {item.type === 'RECONCILIATION_WARNING' ? (
                  <div className="text-xs space-y-1">
                    <div>Statement closing balance: <span className="font-bold tabular-nums">{formatCurrency(item.closingBalance || 96378.45)}</span></div>
                    <div>Calculated: <span className="font-bold tabular-nums">{formatCurrency(item.calculatedBalance || 96378.40)}</span></div>
                    <div className="text-[#B78332] font-semibold">Difference: {formatCurrency(item.difference || 0.05)} (Rounding Adjustment)</div>
                  </div>
                ) : (
                  <div className="text-xs text-[#8B978F]">
                    Amount: <span className="font-bold tabular-nums text-foreground">{formatCurrency(item.amount || 0)}</span> · Date: {item.date ? formatDate(item.date) : ''} · Category: <span className="font-semibold text-[#3F8F5E]">{item.category || item.suggestedCategory || 'Uncategorized'}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {item.type === 'RECONCILIATION_WARNING' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleResolve(item, 'IGNORE')}
                  >
                    Accept Rounding Adjustment
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleResolve(item, 'CONFIRM', item.category || 'General')}
                    >
                      Confirm {item.category || 'Category'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedCatModalItem(item);
                        setChosenCategory(item.category || categories[0]?.name || 'Shopping');
                      }}
                    >
                      Choose Category
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleResolve(item, 'IGNORE')}
                    >
                      Dismiss
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`p-12 text-center rounded-[16px] border ${
          isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
        }`}>
          <div className="h-10 w-10 rounded-full bg-[#E5F4EA] text-[#3F8F5E] flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <h4 className="text-sm font-bold">Work Queue is Clear</h4>
          <p className="text-xs text-[#8B978F] mt-1">
            All imported transactions and statement closing balances are fully categorized and verified.
          </p>
        </div>
      )}

      {/* Choose Category & Rule Creation Modal */}
      {selectedCatModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setSelectedCatModalItem(null)} />
          <div className={`relative w-full max-w-md rounded-[16px] p-6 border shadow-2xl z-10 ${
            isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E8E3]/20 mb-4">
              <h3 className="text-sm font-bold">Choose Category & Create Rule</h3>
              <button type="button" onClick={() => setSelectedCatModalItem(null)} className="border-0 bg-transparent text-[#8B978F] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <span className="text-[#8B978F] block mb-1">Transaction:</span>
                <div className="font-semibold">{selectedCatModalItem.title || selectedCatModalItem.raw_text}</div>
                <div className="text-sm font-bold text-[#3F8F5E] tabular-nums mt-1">{formatCurrency(selectedCatModalItem.amount || 0)}</div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Assign Category</label>
                <select
                  value={chosenCategory}
                  onChange={(e) => setChosenCategory(e.target.value)}
                  className={`w-full p-2.5 rounded-[10px] border outline-none cursor-pointer ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                >
                  {categories.map(c => (
                    <option key={c.id || c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="ruleCheck"
                  checked={createRuleCheckbox}
                  onChange={(e) => setCreateRuleCheckbox(e.target.checked)}
                  className="rounded cursor-pointer"
                />
                <label htmlFor="ruleCheck" className="cursor-pointer text-[#8B978F]">
                  Auto-categorize future transactions with this merchant pattern
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-[#E4E8E3]/20 mt-6 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedCatModalItem(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleResolve(selectedCatModalItem, 'RECATEGORIZE', chosenCategory)}
              >
                Save & Apply
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
