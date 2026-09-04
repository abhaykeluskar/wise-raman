import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Badge } from '../atoms/Badge';
import { CreditCard, Landmark, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CheckCircle2, AlertCircle } from 'lucide-react';

export const TransactionRow = ({
  transaction,
  onClick,
  isSelected = false,
  className = ''
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const amount = parseFloat(transaction.amount || 0);
  const isIncome = transaction.flow === 'INFLOW' || transaction.type === 'CREDIT' || amount > 0;
  const isTransfer = transaction.category === 'Transfer' || transaction.type === 'TRANSFER' || Boolean(transaction.transfer_link_id);
  const displayAmount = Math.abs(amount);

  return (
    <div
      onClick={() => onClick && onClick(transaction)}
      className={`group flex items-center justify-between p-3.5 sm:px-4 sm:py-3 transition-colors duration-150 cursor-pointer border-b select-none ${
        isDark ? 'border-[#2A352D]' : 'border-[#E4E8E3]'
      } ${
        isSelected
          ? isDark
            ? 'bg-[rgba(91,174,120,0.12)]'
            : 'bg-[#F1F8F4]'
          : isDark
            ? 'hover:bg-[#1C251F]'
            : 'hover:bg-[#FBFCFA]'
      } ${className}`}
    >
      {/* Left: Date, Description, Merchant, Category */}
      <div className="flex items-center gap-3 min-w-0 pr-3">
        {/* Date block */}
        <div className="hidden sm:flex flex-col items-center justify-center w-12 shrink-0 text-center">
          <span className={`text-[11px] font-semibold ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
            {transaction.date ? formatDate(transaction.date).split(' ')[0] : '—'}
          </span>
          <span className={`text-[10px] uppercase font-bold ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            {transaction.date ? formatDate(transaction.date).split(' ')[1] : ''}
          </span>
        </div>

        {/* Primary Info */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold truncate ${
              isDark ? 'text-[#F1F5F2] group-hover:text-[#7FC39A]' : 'text-[#1D2822] group-hover:text-[#3F8F5E]'
            }`}>
              {transaction.merchant || transaction.description || '-'}
            </span>
            {transaction.verified && (
              <CheckCircle2 className="h-3 w-3 text-[#3F8F5E] shrink-0" title="Verified transaction" />
            )}
            {transaction.transfer_link_id && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#3F8F5E]/15 text-[#3F8F5E]" title="Linked Transfer / Card Payment Pair">
                <ArrowLeftRight className="h-2.5 w-2.5" />
                <span>Linked</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="sm:hidden text-[11px] text-[#8B978F]">
              {transaction.date ? formatDate(transaction.date) : ''} ·
            </span>
            {transaction.category && (
              <span className={`text-[11px] ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                {transaction.category}
              </span>
            )}
            {transaction.account_name && (
              <>
                <span className="text-[#8B978F] text-[10px]">·</span>
                <span className={`text-[11px] truncate max-w-[140px] ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                  {transaction.account_name}
                </span>
              </>
            )}
            {transaction.payment_rail && transaction.payment_rail !== 'OTHER' && (
              <Badge variant="neutral" size="xs">
                {transaction.payment_rail}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Right: Amount (Always right-aligned) */}
      <div className="flex flex-col items-end shrink-0 pl-2">
        <div className={`tabular-nums text-xs sm:text-sm font-semibold tracking-tight ${
          isTransfer
            ? isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'
            : isIncome
              ? 'text-[#3F8F5E]'
              : isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'
        }`}>
          {isTransfer ? '' : isIncome ? '+' : '-'}{formatCurrency(displayAmount)}
        </div>
        <span className={`text-[10px] uppercase font-bold tracking-wider mt-0.5 ${
          isTransfer
            ? 'text-[#8B978F]'
            : isIncome
              ? 'text-[#3F8F5E]'
              : 'text-[#8B978F]'
        }`}>
          {isTransfer ? 'Transfer' : isIncome ? 'Income' : 'Debit'}
        </span>
      </div>
    </div>
  );
};
