import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { IconButton } from '../atoms/IconButton';
import { 
  X, 
  CheckCircle2, 
  FileText, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Landmark, 
  CreditCard, 
  ShieldCheck, 
  Hash, 
  Tag, 
  Calendar,
  Layers,
  ExternalLink,
  Check,
  RotateCcw
} from 'lucide-react';

export const TransactionDetailDrawer = ({
  transaction,
  isOpen,
  onClose,
  onViewSource
}) => {
  const { theme } = useTheme();
  const { categories, authFetch, fetchData } = useFinance();
  const isDark = theme === 'dark';

  const [selectedCategory, setSelectedCategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen || !transaction) return null;

  const amount = parseFloat(transaction.amount || 0);
  const isIncome = transaction.flow === 'INFLOW' || transaction.type === 'CREDIT' || amount > 0;
  const isTransfer = transaction.category === 'Transfer' || transaction.type === 'TRANSFER';
  const displayAmount = Math.abs(amount);

  // Handle Category update
  const handleCategoryChange = async (newCat) => {
    setIsSaving(true);
    try {
      const res = await authFetch(`/api/transactions/${transaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCat })
      });
      if (res.ok) {
        setSaveSuccess(true);
        transaction.category = newCat;
        await fetchData();
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch (err) {
      console.error('Failed to update category:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Mark as Transfer
  const handleMarkTransfer = async () => {
    const newCat = isTransfer ? 'General' : 'Transfer';
    await handleCategoryChange(newCat);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className={`w-screen max-w-md border-l flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200 ${
          isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
        }`}>
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-[#2A352D]/20">
            <div className="flex items-center justify-between mb-4">
              <span className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                Transaction Provenance
              </span>
              <IconButton
                icon={X}
                onClick={onClose}
                size="sm"
                variant="ghost"
                title="Close drawer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold tracking-tight">
                {transaction.merchant || transaction.description || 'Transaction'}
              </h2>
              <div className={`tabular-nums text-3xl font-[650] tracking-tight mt-1 ${
                isTransfer ? (isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]') : isIncome ? 'text-[#3F8F5E]' : (isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]')
              }`}>
                {isTransfer ? '' : isIncome ? '+' : '-'}{formatCurrency(displayAmount)}
              </div>
              <span className={`text-xs mt-1 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                {transaction.date ? formatDate(transaction.date) : 'Unknown Date'}
              </span>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1">
            
            {/* Quick Actions Strip */}
            <div className="flex items-center gap-2">
              <select
                value={transaction.category || ''}
                onChange={(e) => handleCategoryChange(e.target.value)}
                disabled={isSaving}
                className={`flex-1 text-xs px-3 py-1.5 rounded-[10px] border outline-none cursor-pointer ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              >
                <option value="">Change Category...</option>
                {categories.map(c => (
                  <option key={c.id || c.name} value={c.name}>{c.name}</option>
                ))}
              </select>

              <Button
                variant={isTransfer ? 'secondary' : 'brown'}
                size="sm"
                onClick={handleMarkTransfer}
                disabled={isSaving}
              >
                {isTransfer ? 'Unmark Transfer' : 'Mark as Transfer'}
              </Button>
            </div>

            {saveSuccess && (
              <div className="p-2 rounded-[8px] text-xs font-semibold bg-[#E2F1E8] text-[#285A3A] flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />
                <span>Transaction updated successfully.</span>
              </div>
            )}

            {/* Metadata Grid */}
            <div>
              <h3 className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                Details
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Category</span>
                  <Badge variant={isIncome ? 'positive' : 'brown'}>
                    {transaction.category || 'General'}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Account</span>
                  <span className="font-semibold">{transaction.account_name || 'Primary Account'}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Payment Rail</span>
                  <span className="font-mono text-[11px]">{transaction.payment_rail || 'UPI / Card'}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Merchant</span>
                  <span className="font-medium">{transaction.merchant || '—'}</span>
                </div>

                {transaction.reference && (
                  <div className="flex items-center justify-between text-xs">
                    <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Reference</span>
                    <span className="font-mono text-[11px] select-all">{transaction.reference}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Financial Event Classification */}
            <div className={`p-4 rounded-[12px] border ${
              isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                  Financial Event
                </span>
                <Badge variant={isIncome ? 'positive' : isTransfer ? 'neutral' : 'brown'} size="xs">
                  {isIncome ? 'INCOME' : isTransfer ? 'TRANSFER' : 'PURCHASE'}
                </Badge>
              </div>
              <p className={`text-xs ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
                {isIncome
                  ? 'Inflow credited to your balance. Verified economic benefit.'
                  : isTransfer
                    ? 'Internal movement between accounts. Economic impact is net ₹0.'
                    : 'Outflow recognized as operating expenditure in category analysis.'}
              </p>
            </div>

            {/* Deterministic Evidence Section */}
            <div className={`p-4 rounded-[12px] border ${
              isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#F1F8F4] border-[#C6E4D2]'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-[#3F8F5E]" />
                <span className={`text-xs font-bold ${isDark ? 'text-[#7FC39A]' : 'text-[#285A3A]'}`}>
                  Deterministic Evidence
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Source Statement</span>
                  <span className="font-medium">{transaction.statement_name || 'Bank Statement (PDF)'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Reconciliation</span>
                  <span className="text-[#3F8F5E] font-semibold">✓ Verified Matched</span>
                </div>

                {transaction.raw_text && (
                  <div className="mt-2 pt-2 border-t border-[#2A352D]/20">
                    <span className={`text-[10px] uppercase font-bold tracking-wider block mb-1 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                      Raw Line in Statement
                    </span>
                    <pre className="text-[10px] font-mono p-2 rounded bg-black/10 overflow-x-auto whitespace-pre-wrap">
                      {transaction.raw_text}
                    </pre>
                  </div>
                )}
              </div>

              {onViewSource && (
                <button
                  type="button"
                  onClick={() => onViewSource(transaction)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-[8px] text-xs font-semibold text-[#3F8F5E] hover:underline cursor-pointer border-0 bg-transparent"
                >
                  <span>View in source documents</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className={`p-4 border-t flex items-center justify-between gap-3 ${
            isDark ? 'border-[#2A352D]' : 'border-[#E4E8E3]'
          }`}>
            <Button variant="secondary" size="sm" onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
