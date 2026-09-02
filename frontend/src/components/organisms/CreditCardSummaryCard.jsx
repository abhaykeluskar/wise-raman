import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { Badge } from '../atoms/Badge';
import { NetworkLogo } from '../atoms/NetworkLogo';
import { formatCurrency } from '../../utils/formatters';
import { getNextDueDate, cardTotalAmountDue } from '../../utils/analytics';
import { CreditCard, Calendar } from 'lucide-react';

export const CreditCardSummaryCard = ({ onSelectCard }) => {
  const { style } = useTheme();
  const { cards, accounts, transactions, statements } = useFinance();

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
    <div className={`p-6 rounded-3xl border-0 flex flex-col justify-between transition-all duration-300 min-h-[320px] ${style('neu-flat-dark', 'neu-flat-light')}`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CreditCard className={`h-4 w-4 ${style('text-[#5EEAD4]', 'text-[#0F766E]')}`} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Credit Cards Summary
            </h3>
          </div>
          <Badge variant="brand">
            {cards.length} Active Cards
          </Badge>
        </div>

        {cardStats.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 italic">
            No credit cards registered. Add cards in Settings.
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-h-[260px] overflow-y-auto pr-1 pb-1 custom-scrollbar">
            {cardStats.map(c => (
              <div 
                key={c.id}
                onClick={() => onSelectCard && onSelectCard(c.id)}
                className={`p-3.5 rounded-2xl flex items-center justify-between gap-3 border-0 transition-all cursor-pointer ${style('neu-inset-dark hover:brightness-110', 'neu-inset-light hover:brightness-95')}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <NetworkLogo network={c.network} />
                  <div className="flex flex-col min-w-0">
                    <span className={`text-xs font-bold truncate ${style('text-[#F4F7FA]', 'text-[#17202A]')}`}>
                      {c.card_name}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1 font-normal truncate mt-0.5">
                      <Calendar className="h-3 w-3 shrink-0" /> Due {c.dueDayText} ({c.diffDays}d)
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end justify-center shrink-0 whitespace-nowrap pl-2">
                  <span className="text-sm font-black text-rose-400 tabular-nums">
                    {formatCurrency(c.totalPayment)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800/10 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Total Payment Due
        </span>
        <span className="text-lg font-black text-rose-400 tabular-nums">
          {formatCurrency(totalOutstanding)}
        </span>
      </div>
    </div>
  );
};
