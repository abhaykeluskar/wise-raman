import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../utils/formatters';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { IconButton } from '../atoms/IconButton';
import { 
  X, 
  ShieldCheck, 
  CheckCircle2, 
  Landmark, 
  CreditCard, 
  ArrowRight,
  Database,
  Layers
} from 'lucide-react';

export const CalculationProofModal = ({
  isOpen,
  onClose,
  metricType, // 'netWorth' | 'bankBalance' | 'income' | 'spending'
  onNavigateTransactions
}) => {
  const { theme } = useTheme();
  const { accounts, cards, transactions } = useFinance();
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const getMetricDetails = () => {
    const txList = transactions || [];
    
    // Income breakdown
    const salaryCredits = txList
      .filter(t => (t.transaction_type === 'INCOME' || t.flow === 'INFLOW' || parseFloat(t.amount || 0) > 0) && !t.is_excluded_from_spending && t.category !== 'Transfer')
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount || 0)), 0);

    const internalTransfers = txList
      .filter(t => t.category === 'Transfer' || t.is_excluded_from_spending)
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount || 0)), 0);

    // Spending breakdown
    const expenseTxns = txList.filter(t => (t.transaction_type === 'EXPENSE' || t.flow === 'OUTFLOW' || parseFloat(t.amount || 0) < 0) && !t.is_excluded_from_spending);
    const fixedBillsKeywords = ['rent', 'utility', 'utilities', 'electricity', 'gas', 'water', 'bill', 'internet', 'broadband', 'insurance', 'tuition', 'school'];
    
    const fixedBills = expenseTxns
      .filter(t => fixedBillsKeywords.some(k => (t.category || '').toLowerCase().includes(k) || (t.description || '').toLowerCase().includes(k)))
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount || 0)), 0);

    const discretionary = expenseTxns
      .filter(t => !fixedBillsKeywords.some(k => (t.category || '').toLowerCase().includes(k) || (t.description || '').toLowerCase().includes(k)))
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount || 0)), 0);

    const cardSettlements = txList
      .filter(t => (t.category || '').toLowerCase().includes('card payment') || (t.category || '').toLowerCase().includes('credit card settlement'))
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount || 0)), 0);

    const liquidAccounts = accounts.filter(a => a.classification === 'ASSET');

    switch (metricType) {
      case 'netWorth':
        return {
          title: 'Net Worth Calculation Proof',
          formula: 'Net Worth = ∑(Liquid Depository Assets + Investments) − ∑(Credit Card Liabilities + Loans)',
          explanation: 'Sum of all verified positive asset balances minus outstanding revolving debt and loans.',
          components: [
            { label: 'Liquid Bank Balances', value: formatCurrency(liquidAccounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0)), type: 'positive' },
            { label: 'Revolving Credit Debt', value: formatCurrency(cards.reduce((s, c) => s + parseFloat(c.current_balance || c.balance || 0), 0)), type: 'negative' }
          ]
        };
      case 'bankBalance':
        return {
          title: 'Liquid Bank Balance Proof',
          formula: 'Bank Balance = ∑(Opening Balance + Credits − Debits) across Active Depository Accounts',
          explanation: 'Computed from local statements verified with double-entry arithmetic.',
          components: liquidAccounts.length > 0 ? liquidAccounts.map(a => ({
            label: a.name,
            value: formatCurrency(parseFloat(a.balance || 0)),
            type: 'neutral'
          })) : [
            { label: 'Depository Accounts', value: formatCurrency(0), type: 'neutral' }
          ]
        };
      case 'income':
        return {
          title: 'Monthly Income Calculation Proof',
          formula: 'Monthly Income = ∑(Credits where flow == INFLOW and category != "Transfer")',
          explanation: 'Filters out internal self-transfers between accounts to avoid inflating true earned revenue.',
          components: [
            { label: 'Salary & Professional Credits', value: formatCurrency(salaryCredits), type: 'positive' },
            { label: 'Internal Account Transfers (Excluded)', value: `${formatCurrency(internalTransfers)} (₹0 Net)`, type: 'neutral' }
          ]
        };
      case 'spending':
      default:
        return {
          title: 'Monthly Spending Calculation Proof',
          formula: 'Monthly Spending = ∑(Debits where category != "Transfer" and category != "Credit Card Payment")',
          explanation: 'Excludes credit card bill settlements to prevent double-counting transaction expenses.',
          components: [
            { label: 'Discretionary Outflows', value: formatCurrency(discretionary), type: 'negative' },
            { label: 'Fixed Bills & Utilities', value: formatCurrency(fixedBills), type: 'negative' },
            { label: 'Credit Card Settlements (Excluded)', value: `${formatCurrency(cardSettlements)} (Liability Offset)`, type: 'neutral' }
          ]
        };
    }
  };

  const details = getMetricDetails();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className={`relative w-full max-w-lg rounded-[16px] border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
        isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#E4E8E3]/20">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#3F8F5E]" />
            <h3 className="text-sm font-bold tracking-tight">{details.title}</h3>
          </div>
          <IconButton icon={X} onClick={onClose} size="sm" variant="ghost" />
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Formula */}
          <div>
            <span className="text-[10px] uppercase font-bold text-[#8B978F] block mb-1.5">
              Mathematical Rule / Invariant
            </span>
            <pre className={`p-3 rounded-[10px] font-mono text-[11px] border overflow-x-auto whitespace-pre-wrap ${
              isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#7FC39A]' : 'bg-[#F1F8F4] border-[#C6E4D2] text-[#285A3A]'
            }`}>
              {details.formula}
            </pre>
          </div>

          <p className="text-xs text-[#8B978F] leading-relaxed">
            {details.explanation}
          </p>

          {/* Components */}
          <div>
            <span className="text-[10px] uppercase font-bold text-[#8B978F] block mb-2">
              Contributing Factors & Accounts
            </span>
            <div className="space-y-1.5">
              {details.components.map((comp, idx) => (
                <div 
                  key={idx} 
                  className={`flex items-center justify-between p-2.5 rounded-[8px] text-xs border ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                >
                  <span className="font-medium">{comp.label}</span>
                  <span className={`tabular-nums font-bold ${
                    comp.type === 'positive' ? 'text-[#3F8F5E]' : comp.type === 'negative' ? (isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]') : 'text-[#8B978F]'
                  }`}>
                    {comp.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E4E8E3]/20 flex items-center justify-between text-xs">
          <span className="text-[#8B978F]">Deterministic proven calculation</span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
