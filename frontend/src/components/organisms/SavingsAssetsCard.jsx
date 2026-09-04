import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, maskAccountNumber } from '../../utils/formatters';
import { Badge } from '../atoms/Badge';
import { PiggyBank, Landmark } from 'lucide-react';

export const SavingsAssetsCard = () => {
  const { theme } = useTheme();
  const { accounts } = useFinance();
  const isDark = theme === 'dark';

  const liquidAccounts = accounts.filter(
    a => (a.subtype === 'SAVINGS' || a.subtype === 'CURRENT') && a.bank?.name !== 'Historical Archive'
  );

  const totalLiquidAssets = liquidAccounts.reduce(
    (sum, a) => sum + parseFloat(a.balance || 0), 
    0
  );

  return (
    <div className={`p-6 rounded-[16px] border flex flex-col justify-between transition-all duration-150 min-h-[320px] ${
      isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-[#3F8F5E]" />
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Savings & Liquid Assets
            </h3>
          </div>
          <Badge variant="verified">
            {liquidAccounts.length} Connected
          </Badge>
        </div>

        {liquidAccounts.length === 0 ? (
          <div className={`py-8 text-center text-xs italic ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            No savings accounts connected yet. Import a statement to link accounts.
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
            {liquidAccounts.map(acc => {
              const bankName = acc.bank?.name || '-';
              const maskedNumber = maskAccountNumber(acc.account_number || (acc.id ? acc.id.toString().slice(-4) : ''));
              const bal = parseFloat(acc.balance || 0);

              return (
                <div 
                  key={acc.id}
                  className={`p-3 rounded-[10px] border flex items-center justify-between transition-colors ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-[8px] bg-black/5 dark:bg-white/5 shrink-0">
                      <Landmark className={`h-3.5 w-3.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold truncate">
                        {acc.name}
                      </span>
                      <span className={`text-[11px] font-medium truncate ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                        {bankName} ({maskedNumber})
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="text-xs font-bold text-[#3F8F5E] tabular-nums">
                      {formatCurrency(bal)}
                    </span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                      {acc.subtype}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-[#E4E8E3]/20 flex items-center justify-between">
        <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
          Total Liquid Assets
        </span>
        <span className="text-base font-bold text-[#3F8F5E] tabular-nums">
          {formatCurrency(totalLiquidAssets)}
        </span>
      </div>
    </div>
  );
};
