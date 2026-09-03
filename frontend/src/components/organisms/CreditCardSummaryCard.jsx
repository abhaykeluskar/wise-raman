import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { Badge } from '../atoms/Badge';
import { NetworkLogo } from '../atoms/NetworkLogo';
import { formatCurrency } from '../../utils/formatters';
import { getNextDueDate, cardTotalAmountDue } from '../../utils/analytics';
import { CreditCard, Calendar } from 'lucide-react';

export const CreditCardSummaryCard = ({ onSelectCard }) => {
  const { theme } = useTheme();
  const { cards, accounts, transactions, statements } = useFinance();
  const isDark = theme === 'dark';

  const cardStats = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return cards.map(card => {
      const allCardTxs = transactions.filter(t => String(t.account_id) === String(card.account_id));
      const dueAmt = cardTotalAmountDue({
        transactions: allCardTxs,
        statements,
        accountId: card.account_id
      });
      const stmtDue = dueAmt.statement?.due_date;
      let due;
      if (stmtDue) {
        const dueDate = new Date(stmtDue);
        dueDate.setHours(0, 0, 0, 0);
        due = {
          formattedDate: dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          daysRemaining: Math.round((dueDate - today) / (1000 * 60 * 60 * 24))
        };
      } else {
        due = getNextDueDate(card, today);
      }

      return {
        ...card,
        totalPayment: dueAmt.amount,
        dueDayText: due.formattedDate,
        diffDays: due.daysRemaining
      };
    });
  }, [cards, accounts, transactions, statements]);

  const totalOutstanding = cardStats.reduce((sum, c) => sum + c.totalPayment, 0);

  return (
    <div className={`p-6 rounded-[16px] border flex flex-col justify-between transition-all duration-150 min-h-[320px] ${
      isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[#3F8F5E]" />
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Credit Cards Summary
            </h3>
          </div>
          <Badge variant="brown">
            {cards.length} Active Cards
          </Badge>
        </div>

        {cardStats.length === 0 ? (
          <div className={`py-8 text-center text-xs italic ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            No credit cards registered. Add cards in Settings.
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
            {cardStats.map(c => (
              <div 
                key={c.id}
                onClick={() => onSelectCard && onSelectCard(c.id)}
                className={`p-3 rounded-[10px] border flex items-center justify-between gap-3 transition-all cursor-pointer ${
                  isDark 
                    ? 'bg-[#1C251F] border-[#2A352D] hover:bg-[#202922]' 
                    : 'bg-[#FBFCFA] border-[#E4E8E3] hover:bg-[#F1F8F4]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <NetworkLogo network={c.network} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold truncate">
                      {c.card_name}
                    </span>
                    <span className={`text-[11px] flex items-center gap-1 font-medium truncate mt-0.5 ${
                      isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
                    }`}>
                      <Calendar className="h-3 w-3 shrink-0" /> Due {c.dueDayText} ({c.diffDays}d)
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end justify-center shrink-0 whitespace-nowrap pl-2">
                  <span className="text-xs font-bold text-[#C85C5C] tabular-nums">
                    {formatCurrency(c.totalPayment)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-[#E4E8E3]/20 flex items-center justify-between">
        <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
          Total Payment Due
        </span>
        <span className="text-base font-bold text-[#C85C5C] tabular-nums">
          {formatCurrency(totalOutstanding)}
        </span>
      </div>
    </div>
  );
};
