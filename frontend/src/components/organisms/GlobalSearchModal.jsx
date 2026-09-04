import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Badge } from '../atoms/Badge';
import { 
  Search, 
  X, 
  ArrowRight, 
  Landmark, 
  CreditCard, 
  ListFilter, 
  TrendingUp, 
  Activity, 
  FileText, 
  Sparkles,
  ChevronRight
} from 'lucide-react';

export const GlobalSearchModal = ({
  isOpen,
  onClose,
  onNavigate,
  onSelectTransaction
}) => {
  const { theme } = useTheme();
  const { transactions, accounts, cards } = useFinance();
  const isDark = theme === 'dark';

  const [query, setQuery] = useState('');

  // Reset query on open
  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  // Keyboard shortcut listener (Escape to close)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Views navigation targets
  const navigationItems = [
    { label: 'Dashboard Overview', key: 'dashboard', icon: TrendingUp },
    { label: 'Transaction Ledger', key: 'transactions', icon: ListFilter },
    { label: 'Bank Accounts & Balances', key: 'accounts', icon: Landmark },
    { label: 'Credit Cards & Limits', key: 'cards', icon: CreditCard },
    { label: 'Cash Flow Analysis', key: 'cashflow', icon: TrendingUp },
    { label: 'Financial Health & Invariants', key: 'health', icon: Activity },
    { label: 'Financial Copilot (AI)', key: 'copilot', icon: Sparkles },
    { label: 'Source Documents & Statements', key: 'documents', icon: FileText },
    { label: 'Salary Payslips & Tax Breakdown', key: 'payslips', icon: FileText },
    { label: 'Household OS (Loans, Goals, Vehicles, Trips)', key: 'household', icon: Landmark },
    { label: 'Needs Review Work Queue', key: 'review', icon: ListFilter },
    { label: 'Financial Reports (Audit)', key: 'reports', icon: FileText },
  ];

  // Filtered navigation matches
  const filteredNav = useMemo(() => {
    if (!query.trim()) return navigationItems.slice(0, 4);
    const q = query.toLowerCase();
    return navigationItems.filter(item => item.label.toLowerCase().includes(q));
  }, [query]);

  // Filtered transactions matches (up to 5)
  const filteredTx = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return transactions.filter(t => {
      const desc = (t.description || '').toLowerCase();
      const merch = (t.merchant || '').toLowerCase();
      const cat = (t.category || '').toLowerCase();
      const ref = (t.reference || '').toLowerCase();
      return desc.includes(q) || merch.includes(q) || cat.includes(q) || ref.includes(q);
    }).slice(0, 5);
  }, [transactions, query]);

  // Filtered accounts matches
  const filteredAccounts = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return accounts.filter(a => a.name.toLowerCase().includes(q)).slice(0, 3);
  }, [accounts, query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className={`relative w-full max-w-2xl rounded-[16px] border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
        isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
      }`}>
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-[#E4E8E3]/20 gap-3">
          <Search className="h-5 w-5 text-[#8B978F] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transactions, merchants, accounts, or jump to workspace..."
            autoFocus
            className="flex-1 bg-transparent border-0 outline-none text-sm placeholder-[#8B978F]"
          />
          <kbd className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded border border-[#8B978F]/30 text-[#8B978F] font-mono">
            ESC
          </kbd>
        </div>

        {/* Results Body */}
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4">
          
          {/* Workspaces / Navigation Matches */}
          {filteredNav.length > 0 && (
            <div>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-3 mb-1 block ${
                isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
              }`}>
                Workspaces
              </span>
              <div className="space-y-0.5">
                {filteredNav.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => { onNavigate(item.key); onClose(); }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-xs font-medium transition-colors border-0 cursor-pointer text-left ${
                        isDark ? 'hover:bg-[#1C251F] text-[#F1F5F2]' : 'hover:bg-[#F1F8F4] text-[#1D2822]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-[#5BAE78]" />
                        <span>{item.label}</span>
                      </div>
                      <ChevronRight className="h-3 w-3 text-[#8B978F]" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Accounts Matches */}
          {filteredAccounts.length > 0 && (
            <div>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-3 mb-1 block ${
                isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
              }`}>
                Accounts
              </span>
              <div className="space-y-0.5">
                {filteredAccounts.map(acc => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => { onNavigate('accounts'); onClose(); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-xs font-medium transition-colors border-0 cursor-pointer text-left ${
                      isDark ? 'hover:bg-[#1C251F]' : 'hover:bg-[#F1F8F4]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Landmark className="h-4 w-4 text-[#3F8F5E]" />
                      <span>{acc.name}</span>
                      <span className="text-[10px] text-[#8B978F]">({acc.account_type || '-'})</span>
                    </div>
                    <span className="tabular-nums font-semibold">{formatCurrency(parseFloat(acc.balance || 0))}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Transactions Matches */}
          {filteredTx.length > 0 && (
            <div>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-3 mb-1 block ${
                isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
              }`}>
                Transactions
              </span>
              <div className="space-y-0.5">
                {filteredTx.map(tx => (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => {
                      if (onSelectTransaction) onSelectTransaction(tx);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-xs font-medium transition-colors border-0 cursor-pointer text-left ${
                      isDark ? 'hover:bg-[#1C251F]' : 'hover:bg-[#F1F8F4]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <span className="text-[11px] text-[#8B978F] shrink-0">{tx.date ? formatDate(tx.date) : '-'}</span>
                      <span className="font-semibold truncate">{tx.merchant || tx.description || '-'}</span>
                      <Badge variant="neutral" size="xs">{tx.category || '-'}</Badge>
                    </div>
                    <span className={`tabular-nums font-semibold shrink-0 ${
                      parseFloat(tx.amount || 0) > 0 ? 'text-[#3F8F5E]' : ''
                    }`}>
                      {parseFloat(tx.amount || 0) > 0 ? '+' : '-'}
                      {formatCurrency(Math.abs(parseFloat(tx.amount || 0)))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {query.trim() && filteredNav.length === 0 && filteredAccounts.length === 0 && filteredTx.length === 0 && (
            <div className="p-8 text-center text-xs text-[#8B978F]">
              No transactions, accounts, or workspaces matching "{query}".
            </div>
          )}
        </div>

        {/* Footer tip */}
        <div className="px-4 py-2.5 border-t border-[#E4E8E3]/20 flex items-center justify-between text-[11px] text-[#8B978F]">
          <span>Tip: Use <strong>⌘K</strong> or <strong>Ctrl+K</strong> to open global search anytime</span>
          <span>WiseRaman OS</span>
        </div>
      </div>
    </div>
  );
};
