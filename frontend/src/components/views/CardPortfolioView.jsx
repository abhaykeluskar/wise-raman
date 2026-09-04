import React, { useState, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useDialog } from '../../context/ToastContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { cardTotalAmountDue, getNextDueDate, calculateNextCardDue } from '../../utils/analytics';
import { MetricValue } from '../molecules/MetricValue';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { TransactionRow } from '../molecules/TransactionRow';
import { 
  CreditCard, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  ShieldCheck, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  Percent, 
  Plus,
  Pencil,
  Trash2,
  ListFilter
} from 'lucide-react';

export const CardPortfolioView = ({
  initialCardId,
  onOpenAddCard,
  onOpenEditCard,
  onNavigateLedger
}) => {
  const { theme } = useTheme();
  const { cards, transactions, statements, openInLedger, authFetch, fetchData } = useFinance();
  const { confirm, toast } = useDialog();
  const isDark = theme === 'dark';

  const [selectedCardId, setSelectedCardId] = useState(() => initialCardId || (cards[0]?.id || null));

  // Compute dynamic statement-backed stats for each card
  const cardStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return cards.map(card => {
      const allCardTxs = transactions.filter(t => String(t.account_id) === String(card.account_id));
      const dueAmt = cardTotalAmountDue({
        transactions: allCardTxs,
        statements,
        accountId: card.account_id
      });
      const stmt = dueAmt.statement;
      const stmtDue = stmt?.due_date;
      let due;
      if (stmtDue) {
        const dueDate = new Date(stmtDue);
        dueDate.setHours(0, 0, 0, 0);
        due = {
          formattedDate: dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          daysRemaining: Math.round((dueDate - today) / (1000 * 60 * 60 * 24))
        };
      } else {
        due = getNextDueDate(card, today);
      }

      const rawBal = parseFloat(card.current_balance || card.balance || 0);
      const outstandingVal = dueAmt.amount > 0 
        ? dueAmt.amount 
        : (rawBal !== 0 ? Math.abs(rawBal) : 0);

      const minDueVal = stmt?.minimum_amount_due != null
        ? parseFloat(stmt.minimum_amount_due)
        : Math.round(outstandingVal * 0.05);

      return {
        ...card,
        outstanding: outstandingVal,
        statement: stmt,
        minDue: minDueVal,
        dueDayText: due.formattedDate,
        diffDays: due.daysRemaining
      };
    });
  }, [cards, transactions, statements]);

  const activeCard = useMemo(() => {
    return cardStats.find(c => c.id === selectedCardId) || cardStats[0] || null;
  }, [cardStats, selectedCardId]);

  // Card transactions
  const cardTransactions = useMemo(() => {
    if (!activeCard) return [];
    return transactions.filter(t => t.account_id === activeCard.account_id || t.card_id === activeCard.id);
  }, [transactions, activeCard]);

  // Portfolio Totals
  const totals = useMemo(() => {
    const outstanding = cardStats.reduce((sum, c) => sum + (c.outstanding || 0), 0);
    const limit = cardStats.reduce((sum, c) => sum + parseFloat(c.credit_limit || 0), 0);
    const available = Math.max(0, limit - outstanding);
    const utilRate = limit > 0 ? ((outstanding / limit) * 100).toFixed(1) : '0.0';
    return { outstanding, limit, available, utilRate };
  }, [cardStats]);

  const nextDue = useMemo(() => {
    return calculateNextCardDue(cards);
  }, [cards]);

  const handleViewAllInLedger = () => {
    if (!activeCard) return;
    openInLedger({ account: activeCard.account_id });
    if (onNavigateLedger) onNavigateLedger();
  };

  const handleDeleteCard = async (cardId, e) => {
    e?.stopPropagation();
    const ok = await confirm({
      title: 'Delete Credit Card',
      message: 'Are you sure you want to delete this credit card? Historical statement records will remain in the audit log.',
      confirmText: 'Delete Card',
      isDanger: true
    });
    if (!ok) return;

    try {
      const res = await authFetch(`/api/cards/${cardId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchData();
        toast.success('Credit card removed.');
      }
    } catch (err) {
      console.error('Failed to delete card:', err);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200 pb-12">
      
      {/* 1. Header with Add Card Action */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2 border-b border-[#E4E8E3]/30">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
            Credit Cards & Facilities
          </h2>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            {cards.length} active credit facilities · Combined credit limit: {formatCurrency(totals.limit)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAddCard && (
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenAddCard}
              icon={Plus}
            >
              Add Credit Card
            </Button>
          )}
        </div>
      </div>

      {/* 2. Top Summary Group */}
      <div className={`p-6 rounded-[16px] border ${
        isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
      }`}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:divide-x sm:divide-[#E4E8E3]/20">
          <div>
            <MetricValue
              label="Total Outstanding"
              value={formatCurrency(totals.outstanding)}
              trend={{ value: `${totals.utilRate}%`, direction: 'up', label: 'of total limit', positiveIsGood: false }}
              size="md"
            />
          </div>

          <div className="sm:px-6">
            <MetricValue
              label="Available Credit"
              value={formatCurrency(totals.available)}
              subtext={`Across ${cards.length} credit cards`}
              size="md"
            />
          </div>

          <div className="sm:pl-6 flex flex-col justify-center">
            <span className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Payment Timeline
            </span>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#A77B58]">
              <Clock className="h-4 w-4" />
              <span>{nextDue ? `Next Due: ${nextDue.formattedDate} (${nextDue.card?.card_name || nextDue.card?.name || '-'})` : '-'}</span>
            </div>
            <span className={`text-[11px] mt-1 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              No overdue facilities detected.
            </span>
          </div>
        </div>
      </div>

      {/* 3. Cards Selector & Detail View */}
      {cards.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Card Selection List (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <span className={`text-[11px] font-bold uppercase tracking-wider block mb-2 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Select Facility
            </span>

            {cardStats.map(c => {
              const isSelected = activeCard?.id === c.id;
              const outst = c.outstanding;

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCardId(c.id)}
                  className={`p-4 rounded-[14px] border transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? isDark
                        ? 'bg-[#1C251F] border-[#5BAE78] shadow-sm'
                        : 'bg-[#FAF6F1] border-[#A77B58] shadow-sm'
                      : isDark
                        ? 'bg-[#171E19] border-[#2A352D] hover:border-[#5BAE78]/40'
                        : 'bg-[#FFFFFF] border-[#E4E8E3] hover:border-[#C6E4D2]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold">{c.name || c.card_name || '-'}</span>
                    <Badge variant={isSelected ? 'brown' : 'neutral'} size="xs">
                      {c.network || '-'}
                    </Badge>
                  </div>

                  <div className="flex items-baseline justify-between mt-3">
                    <span className="text-[11px] text-[#8B978F]">Outstanding</span>
                    <span className="tabular-nums text-sm font-bold">
                      {formatCurrency(outst)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Card Detail (8 cols) */}
          {activeCard && (
            <div className={`lg:col-span-8 p-6 rounded-[16px] border flex flex-col justify-between ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-[#E4E8E3]/20">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold">{activeCard.name || activeCard.card_name || '-'}</h3>
                      {onOpenEditCard && (
                        <button
                          type="button"
                          onClick={() => onOpenEditCard(activeCard)}
                          className="p-1 text-[#8B978F] hover:text-[#5BAE78] border-0 bg-transparent cursor-pointer"
                          title="Edit Card Details"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCard(activeCard.id, e)}
                        className="p-1 text-[#8B978F] hover:text-[#C85C5C] border-0 bg-transparent cursor-pointer"
                        title="Delete Card"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="text-xs text-[#8B978F]">
                      Account Ref: {activeCard.account_number_mask || '-'} · Limit: {formatCurrency(activeCard.credit_limit || 0)}
                    </span>
                  </div>
                  <Badge variant="verified">Verified Facility</Badge>
                </div>

                {/* Specific Card Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-6">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#8B978F]">Outstanding</span>
                    <div className="text-xl font-bold tabular-nums mt-0.5">
                      {formatCurrency(activeCard.outstanding)}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#8B978F]">Payment Due</span>
                    <div className="text-xl font-bold tabular-nums text-[#A77B58] mt-0.5">
                      {activeCard.dueDayText || '-'}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#8B978F]">Minimum Due</span>
                    <div className="text-xl font-bold tabular-nums mt-0.5">
                      {formatCurrency(activeCard.minDue || 0)}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#8B978F]">Available</span>
                    <div className="text-xl font-bold tabular-nums text-[#3F8F5E] mt-0.5">
                      {formatCurrency(Math.max(0, parseFloat(activeCard.credit_limit || 0) - activeCard.outstanding))}
                    </div>
                  </div>
                </div>

                {/* Activity List */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                      Recent Card Debits ({cardTransactions.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleViewAllInLedger}
                      className="text-xs text-[#3F8F5E] font-medium hover:underline border-0 bg-transparent p-0 cursor-pointer flex items-center gap-1"
                    >
                      <span>View All in Ledger</span>
                      <ListFilter className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="divide-y divide-[#E4E8E3]/20 -mx-3">
                    {cardTransactions.slice(0, 4).map(tx => (
                      <TransactionRow key={tx.id} transaction={tx} />
                    ))}
                    {cardTransactions.length === 0 && (
                      <div className="p-4 text-xs text-[#8B978F] text-center">
                        No transactions recorded for this card cycle.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E4E8E3]/20 mt-6 flex items-center justify-between text-xs text-[#8B978F]">
                <span>Credit card payments are treated as balance settlements, not additional expenses.</span>
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className={`p-12 text-center rounded-[16px] border ${
          isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
        }`}>
          <h4 className="text-sm font-bold">No Credit Cards Connected</h4>
          <p className="text-xs text-[#8B978F] mt-1 mb-4">
            Import a credit card statement (PDF) or add a card manually to track limits and cycles.
          </p>
          {onOpenAddCard && (
            <Button variant="primary" size="sm" onClick={onOpenAddCard} icon={Plus}>
              Add Credit Card
            </Button>
          )}
        </div>
      )}

    </div>
  );
};
