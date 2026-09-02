import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, maskAccountNumber } from '../../utils/formatters';
import { Badge } from '../atoms/Badge';
import { PiggyBank, Landmark, ArrowDownLeft } from 'lucide-react';

export const SavingsAssetsCard = () => {
  const { style } = useTheme();
  const { accounts } = useFinance();

  const liquidAccounts = accounts.filter(
    a => (a.subtype === 'SAVINGS' || a.subtype === 'CURRENT') && a.bank?.name !== 'Historical Archive'
  );

  const totalLiquidAssets = liquidAccounts.reduce(
    (sum, a) => sum + parseFloat(a.balance || 0), 
    0
  );

  return (
    <div className={`p-6 rounded-2xl border-0 flex flex-col justify-between transition-all duration-300 min-h-[320px] ${style('neu-flat-dark', 'neu-flat-light')}`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Savings & Liquid Assets
            </h3>
          </div>
          <Badge variant="success">
            {liquidAccounts.length} Connected
          </Badge>
        </div>

        {liquidAccounts.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 italic">
            No savings accounts connected yet. Import a statement to link accounts.
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
            {liquidAccounts.map(acc => {
              const bankName = acc.bank?.name || 'Bank';
              const maskedNumber = maskAccountNumber(acc.id ? acc.id.toString().slice(-4) : '7788');
              const bal = parseFloat(acc.balance || 0);

              return (
                <div 
                  key={acc.id}
                  className={`p-3 rounded-xl flex items-center justify-between border-0 transition-all ${style('neu-inset-dark', 'neu-inset-light')}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 ${style('bg-slate-800/40 text-slate-300', 'bg-slate-200 text-slate-700')}`}>
                      <Landmark className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold truncate">
                        {acc.name}
                      </span>
                      <span className="text-xs text-slate-400 font-normal truncate">
                        {bankName} ({maskedNumber})
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="text-xs font-bold text-emerald-400 tabular-nums">
                      {formatCurrency(bal)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      {acc.subtype}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800/10 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Total Liquid Assets
        </span>
        <span className="text-lg font-black text-emerald-400 tabular-nums">
          {formatCurrency(totalLiquidAssets)}
        </span>
      </div>
    </div>
  );
};
