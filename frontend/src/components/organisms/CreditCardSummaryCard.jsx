import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { Badge } from '../atoms/Badge';
import { NetworkLogo } from '../atoms/NetworkLogo';
import { formatCurrency } from '../../utils/formatters';
import { getNextDueDate } from '../../utils/analytics';
import { CreditCard, Calendar } from 'lucide-react';

export const CreditCardSummaryCard = ({ onSelectCard }) => {
  const { style } = useTheme();
  const { cards, accounts, transactions } = useFinance();

  // Compute total payment per card in current cycle
  const cardStats = React.useMemo(() => {
    const today = new Date();

    return cards.map(card => {
      const allCardTxs = transactions.filter(t => String(t.account_id) === String(card.account_id));
      const totalDebits = allCardTxs.filter(t => parseFloat(t.amount) < 0).reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

      const isBillPaymentTx = (t) => {
        const desc = (t.description || '').toUpperCase();
        return t.transaction_type === 'CC_PAYMENT_RECEIVED' || 
          desc.includes('PAYMENT') || 
          desc.includes('MB/IB') || 
          desc.includes('AUTODEBIT') || 
          desc.includes('BILLDESK') || 
          desc.includes('NEFT') || 
          desc.includes('IMPS');
      };

      const credits = allCardTxs.filter(t => parseFloat(t.amount) > 0);
      const refundsAndCashbacks = credits
        .filter(t => !isBillPaymentTx(t))
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      const totalPayment = Math.max(0, totalDebits - refundsAndCashbacks);
      const due = getNextDueDate(card, today);

      return {
        ...card,
        totalPayment,
        dueDayText: due.formattedDate,
        diffDays: due.daysRemaining
      };
    });
  }, [cards, accounts, transactions]);

  const totalOutstanding = cardStats.reduce((sum, c) => sum + c.totalPayment, 0);

  return (
    <div className={`p-6 rounded-2xl border-0 flex flex-col justify-between transition-all duration-300 min-h-[320px] ${style('neu-flat-dark', 'neu-flat-light')}`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CreditCard className={`h-4 w-4 ${style('text-[#FF7E67]', 'text-[#4A90E2]')}`} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Credit Cards Summary
            </h3>
          </div>
          <Badge variant="accent">
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
                className={`p-3 rounded-xl flex items-center justify-between gap-3 border-0 transition-all cursor-pointer ${style('neu-inset-dark hover:brightness-110', 'neu-inset-light hover:brightness-95')}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <NetworkLogo network={c.network} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold truncate">
                      {c.card_name}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1 font-normal truncate">
                      <Calendar className="h-3 w-3 shrink-0" /> Due {c.dueDayText} ({c.diffDays}d)
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0 whitespace-nowrap pl-2">
                  <span className="text-xs font-bold text-red-400 tabular-nums">
                    {formatCurrency(c.totalPayment)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    Total Due
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
        <span className="text-lg font-black text-red-400 tabular-nums">
          {formatCurrency(totalOutstanding)}
        </span>
      </div>
    </div>
  );
};
