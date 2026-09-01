import React, { useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../utils/formatters';
import { Landmark, PiggyBank, Receipt, CreditCard, Activity } from 'lucide-react';
import { Badge } from '../atoms/Badge';

export const BankAccountsView = () => {
  const { theme, style } = useTheme();
  const { accounts, banks, transactions } = useFinance();

  // Filter for ASSET (Savings/Current) and LIABILITY (Loan, exclude Credit Cards)
  const assetAccounts = useMemo(() => accounts.filter(a => a.classification === 'ASSET' && a.bank?.name !== 'Historical Archive'), [accounts]);
  const archiveAccounts = useMemo(() => accounts.filter(a => a.bank?.name === 'Historical Archive'), [accounts]);
  
  const loanAccounts = useMemo(() => accounts.filter(a => a.classification === 'LIABILITY' && a.subtype === 'LOAN'), [accounts]);

  const totalAssets = assetAccounts.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);
  const totalLoans = loanAccounts.reduce((sum, a) => sum + Math.abs(parseFloat(a.balance || 0)), 0);

  const getBankName = (bankId) => banks.find(b => b.id === bankId)?.name || 'Unknown Bank';

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 pb-12">
      {/* Header Banner */}
      <div className={`p-5 sm:p-6 rounded-3xl border-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-2xl flex items-center justify-center ${style('neu-flat-dark text-[#10b981]', 'neu-flat-light text-[#10b981]')}`}>
            <Landmark className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${style('text-white', 'text-slate-800')}`}>
                Bank & Loan Accounts
              </h1>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                {assetAccounts.length} Active
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Savings, current, salary accounts and active bank balances
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Total Assets Summary */}
        <div className={`p-6 rounded-2xl flex flex-col justify-between border-0 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex items-center gap-2 mb-4">
            <PiggyBank className={`h-5 w-5 ${style('text-[#10b981]', 'text-[#10b981]')}`} />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Total Liquid Assets</h3>
          </div>
          <h2 className={`text-4xl font-extrabold ${style('text-white', 'text-slate-800')}`}>
            {formatCurrency(totalAssets)}
          </h2>
          <p className="text-xs text-slate-500 mt-2">Across {assetAccounts.length} savings/current accounts</p>
        </div>

        {/* Total Loans Summary */}
        <div className={`p-6 rounded-2xl flex flex-col justify-between border-0 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex items-center gap-2 mb-4">
            <Receipt className={`h-5 w-5 ${style('text-[#ef4444]', 'text-[#ef4444]')}`} />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Total Outstanding Loans</h3>
          </div>
          <h2 className={`text-4xl font-extrabold ${style('text-white', 'text-slate-800')}`}>
            {formatCurrency(totalLoans)}
          </h2>
          <p className="text-xs text-slate-500 mt-2">Across {loanAccounts.length} active loan accounts</p>
        </div>
      </div>

      {/* Asset Accounts List */}
      <h3 className={`text-lg font-bold mt-4 ${style('text-white', 'text-slate-800')}`}>Savings & Current Accounts</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {assetAccounts.length === 0 && (
          <p className="text-slate-500 text-sm italic">No asset accounts found.</p>
        )}
        {assetAccounts.map(acc => (
          <div key={acc.id} className={`p-5 rounded-2xl flex items-center justify-between border-0 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-slate-400" />
                <span className="font-bold text-sm">{getBankName(acc.bank_id)}</span>
                <Badge variant="primary">{acc.subtype}</Badge>
              </div>
              <span className="text-xs text-slate-500">{acc.name}</span>
            </div>
            <div className="text-right">
              <span className={`text-lg font-bold ${style('text-[#10b981]', 'text-[#10b981]')}`}>
                {formatCurrency(acc.balance || 0)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Loan Accounts List */}
      <h3 className={`text-lg font-bold mt-4 ${style('text-white', 'text-slate-800')}`}>Loan Accounts</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loanAccounts.length === 0 && (
          <p className="text-slate-500 text-sm italic">No active loan accounts found.</p>
        )}
        {loanAccounts.map(acc => (
          <div key={acc.id} className={`p-5 rounded-2xl flex flex-col gap-3 border-0 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#ef4444]" />
                <span className="font-bold text-sm">{getBankName(acc.bank_id)}</span>
                <Badge variant="danger">LOAN</Badge>
              </div>
              <span className={`text-lg font-bold ${style('text-[#ef4444]', 'text-[#ef4444]')}`}>
                {formatCurrency(Math.abs(acc.balance || 0))}
              </span>
            </div>
            <div className="flex justify-between items-center bg-black/10 rounded-lg p-3">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Loan Plan</span>
                <span className={`text-xs font-medium ${style('text-slate-200', 'text-slate-700')}`}>{acc.name}</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Current EMI</span>
                <span className={`text-sm font-bold ${style('text-[#EAEAEA]', 'text-slate-800')}`}>{formatCurrency(acc.monthly_cap || 0)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Historical Archive Accounts List */}
      {archiveAccounts.length > 0 && (
        <>
          <h3 className={`text-lg font-bold mt-4 ${style('text-white', 'text-slate-800')}`}>Historical Archive & Legacy Data</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {archiveAccounts.map(acc => (
              <div key={acc.id} className={`p-5 rounded-2xl flex items-center justify-between border-0 transition-all ${style('neu-flat-dark', 'neu-flat-light')} opacity-75`}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-slate-400" />
                    <span className="font-bold text-sm">{getBankName(acc.bank_id)}</span>
                    <Badge variant="neutral">ARCHIVE</Badge>
                  </div>
                  <span className="text-xs text-slate-500">{acc.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">2,289 Stored Records</span>
                  <span className="text-xs font-semibold text-slate-400">Isolated from Active Spends</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
};
