import React, { useState, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { Badge } from '../atoms/Badge';
import { NetworkLogo } from '../atoms/NetworkLogo';
import { Button } from '../atoms/Button';
import { StatDeckCard } from '../molecules/StatDeckCard';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { EditCardModal } from '../organisms/EditCardModal';
import { 
  CreditCard as CreditCardIcon, 
  Plus, 
  Trash2, 
  Pencil, 
  X, 
  Sparkles, 
  ShieldCheck,
  Calendar,
  Wallet,
  Gauge
} from 'lucide-react';

export const CardPortfolioView = ({ initialCardId }) => {
  const { style } = useTheme();
  const { cards, accounts, transactions, statements, banks, fetchData } = useFinance();

  const [selectedCardId, setSelectedCardId] = useState(() => {
    return initialCardId || (cards[0]?.id ?? null);
  });

  const [showAddCard, setShowAddCard] = useState(false);
  const [cardToEdit, setCardToEdit] = useState(null);

  // Add Card form states
  const [newCardName, setNewCardName] = useState('');
  const [newCardBank, setNewCardBank] = useState('');
  const [newCardNetwork, setNewCardNetwork] = useState('Visa');
  const [newCardCreditLimit, setNewCardCreditLimit] = useState('');
  const [newCardStatementDate, setNewCardStatementDate] = useState('1');
  const [newCardAccountId, setNewCardAccountId] = useState('');

  // Month Filter
  const [selectedMonth, setSelectedMonth] = useState('ALL');

  // Active card
  const activeCard = cards.find(c => c.id === selectedCardId) || cards[0];

  // Available Months for active card
  const availableMonths = useMemo(() => {
    if (!activeCard) return [];
    const months = new Set();
    const cardTxs = transactions.filter(t => String(t.account_id) === String(activeCard.account_id));
    cardTxs.forEach(tx => {
      if (tx.date) months.add(tx.date.substring(0, 7));
    });
    return Array.from(months).sort().reverse();
  }, [activeCard, transactions]);

  // Calculate card-specific credit utilization & payment metrics
  const {
    activeTransactions,
    totalGrossSpends,
    totalPayment,
    openingBalance,
    creditLimit,
    availableLimit,
    utilizationPercent,
    safeSpend30,
    remainingUnder30,
    stmtDay,
    dueDay,
    dueDateText,
    isStatementVerified
  } = useMemo(() => {
    if (!activeCard) {
      return {
        activeTransactions: [],
        totalGrossSpends: 0,
        totalPayment: 0,
        openingBalance: 0,
        creditLimit: 100000,
        availableLimit: 100000,
        utilizationPercent: 0,
        safeSpend30: 30000,
        remainingUnder30: 30000,
        stmtDay: 1,
        dueDay: 21,
        dueDateText: 'Day 21',
        isStatementVerified: false
      };
    }

    const cardAcc = accounts.find(a => String(a.id) === String(activeCard.account_id));
    let allCardTxs = transactions.filter(t => String(t.account_id) === String(activeCard.account_id));
    
    if (selectedMonth !== 'ALL') {
      allCardTxs = allCardTxs.filter(t => t.date && t.date.startsWith(selectedMonth));
    }
    
    // Purchases & debits
    const cardTxs = allCardTxs.filter(t => parseFloat(t.amount) < 0 && !t.is_excluded_from_spending);
    const totalSpends = cardTxs.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
    const totalDebits = allCardTxs.filter(t => parseFloat(t.amount) < 0).reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

    // Identify Bill Payments vs Refunds & Cashbacks
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

    // 1. Calculated Total Payment Due
    const computedPayment = Math.max(0, totalDebits - refundsAndCashbacks);

    // 2. Check for latest persisted statement metadata from official PDF
    let stmtsForCard = (statements || []).filter(s => String(s.account_id) === String(activeCard.account_id));
    if (selectedMonth !== 'ALL') {
      stmtsForCard = stmtsForCard.filter(s => s.statement_date && s.statement_date.startsWith(selectedMonth));
    }
    const latestStmt = stmtsForCard[0]; // Assuming ordered by date or we just take the first matching

    let finalPayment = computedPayment;
    let openBal = 0;
    let dueTxt = '';
    let isVerified = false;

    if (latestStmt && parseFloat(latestStmt.total_amount_due) > 0) {
      finalPayment = parseFloat(latestStmt.total_amount_due);
      openBal = parseFloat(latestStmt.previous_dues) || 0;
      dueTxt = formatDate(latestStmt.due_date, 'short');
      isVerified = true;
    }

    const limit = activeCard.monthly_cap ? parseFloat(activeCard.monthly_cap) : 100000;
    const avail = Math.max(0, limit - finalPayment);
    const util = limit > 0 ? (finalPayment / limit) * 100 : 0;
    const safe30 = limit * 0.30;
    const rem30 = Math.max(0, safe30 - finalPayment);

    const sDay = parseInt(activeCard.statement_date) || 1;
    let dDay = sDay + 20;
    if (dDay > 30) dDay -= 30;

    return {
      activeTransactions: cardTxs,
      totalGrossSpends: totalSpends,
      totalPayment: finalPayment,
      openingBalance: openBal,
      creditLimit: limit,
      availableLimit: avail,
      utilizationPercent: util,
      safeSpend30: safe30,
      remainingUnder30: rem30,
      stmtDay: sDay,
      dueDay: dDay,
      dueDateText: dueTxt || `Day ${dDay}`,
      isStatementVerified: isVerified
    };
  }, [activeCard, accounts, transactions, statements]);

  const { toast, confirm } = useToast();

  // Handlers
  const handleAddCard = async (e) => {
    e.preventDefault();
    if (!newCardName.trim()) return;

    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_name: newCardName.trim(),
          bank_id: newCardBank || banks[0]?.id,
          network: newCardNetwork,
          reward_currency: 'Credit',
          monthly_cap: newCardCreditLimit ? parseFloat(newCardCreditLimit) : null,
          statement_date: parseInt(newCardStatementDate) || 1,
          is_active: true,
          account_id: newCardAccountId || null
        })
      });

      if (res.ok) {
        toast.success(`Card '${newCardName.trim()}' registered successfully.`);
        setShowAddCard(false);
        setNewCardName('');
        setNewCardCreditLimit('');
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to register card.', 'Registration Error');
      }
    } catch (err) {
      console.error("Error creating card:", err);
      toast.error('Network connection error while saving card.', 'Error');
    }
  };

  const handleDeleteCard = async (cardId, cardName) => {
    const isConfirmed = await confirm({
      title: 'Delete Credit Card',
      message: `Are you sure you want to remove '${cardName}' from your portfolio? Associated statements and history will remain intact.`,
      confirmText: 'Delete Card',
      isDanger: true
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/cards/${cardId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`Card '${cardName}' removed.`);
        fetchData();
        setSelectedCardId(cards.find(c => c.id !== cardId)?.id || null);
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to delete card.', 'Delete Error');
      }
    } catch (err) {
      console.error("Error deleting card:", err);
      toast.error('Failed to delete card.', 'Network Error');
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 pb-12">
      
      {/* 1. Card Tabs Navigation Bar */}
      {cards.length === 0 ? (
        <div className={`p-8 rounded-2xl text-center border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <CreditCardIcon className="h-8 w-8 mx-auto text-slate-500 mb-2" />
          <h3 className="text-sm font-bold">No Registered Cards</h3>
          <p className="text-xs text-slate-500 mt-1">Register your credit cards to track billing cycles and credit limits.</p>
          <div className="mt-4 flex justify-center">
            <Button variant="primary" onClick={() => setShowAddCard(true)} icon={Plus}>
              Register Credit Card
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full custom-scrollbar">
            {cards.map(c => {
              const isSelected = activeCard?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCardId(c.id)}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all border-0 cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? style('neu-flat-dark text-[#FF7E67]', 'bg-[#FF7E67] text-white', 'neu-flat-light text-[#4A90E2]', 'bg-[#4A90E2] text-white')
                      : style('text-slate-400 hover:text-slate-200', 'text-slate-600 hover:text-slate-900')
                  }`}
                >
                  {c.card_name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className={`rounded-xl px-3 py-2 text-xs font-bold focus:outline-none border-0 cursor-pointer ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
            >
              <option value="ALL">All Months</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</option>
              ))}
            </select>

            <Button variant="primary" size="sm" onClick={() => setShowAddCard(!showAddCard)} icon={Plus}>
              Add Card
            </Button>
          </div>
        </div>
      )}

      {/* Register New Card Form (Collapsible) */}
      {showAddCard && (
        <form onSubmit={handleAddCard} className={`p-6 rounded-2xl flex flex-col gap-4 border-0 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex justify-between items-center border-b pb-2 border-slate-800/10">
            <h3 className="text-sm font-bold">Register New Credit Card</h3>
            <button type="button" onClick={() => setShowAddCard(false)} className="text-slate-500 hover:text-red-400 border-0 bg-transparent cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Card Name</span>
              <input
                type="text"
                placeholder="e.g. Amazon Pay ICICI"
                value={newCardName}
                onChange={e => setNewCardName(e.target.value)}
                required
                className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bank / Issuer</span>
              <select
                value={newCardBank}
                onChange={e => setNewCardBank(e.target.value)}
                className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
              >
                {banks.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Network</span>
              <select
                value={newCardNetwork}
                onChange={e => setNewCardNetwork(e.target.value)}
                className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
              >
                <option value="Visa">Visa</option>
                <option value="Mastercard">Mastercard</option>
                <option value="RuPay">RuPay</option>
                <option value="Amex">American Express</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Credit Limit (₹)</span>
              <input
                type="number"
                placeholder="e.g. 500000"
                value={newCardCreditLimit}
                onChange={e => setNewCardCreditLimit(e.target.value)}
                required
                className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Statement Billing Day</span>
              <input
                type="number"
                min="1"
                max="31"
                value={newCardStatementDate}
                onChange={e => setNewCardStatementDate(e.target.value)}
                required
                className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Linked Account</span>
              <select
                value={newCardAccountId}
                onChange={e => setNewCardAccountId(e.target.value)}
                className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
              >
                <option value="">Auto-link / Default</option>
                {accounts.filter(a => a.subtype === 'CREDIT_CARD').map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.bank?.name})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <Button variant="secondary" onClick={() => setShowAddCard(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Save Card</Button>
          </div>
        </form>
      )}

      {/* 2. Standardized 4-Tier Card View */}
      {activeCard && (
        <div className="flex flex-col gap-6">

          {/* Tier 1: Card Header Bar */}
          <div className={`p-4 px-6 rounded-2xl flex items-center justify-between border-0 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
            <div className="flex items-center gap-3">
              <NetworkLogo network={activeCard.network} />
              <h2 className="text-sm font-bold tracking-tight">
                {activeCard.card_name}
              </h2>
              <span className="text-slate-400 text-xs font-medium hidden sm:inline">
                • Statement Day: <strong className="text-slate-300">{stmtDay}</strong> • {isStatementVerified ? 'Due Date:' : 'Estimated Due:'} <strong className="text-slate-300">{dueDateText}</strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCardToEdit(activeCard)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-colors border-0 bg-transparent cursor-pointer"
                title="Edit Card Configuration"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDeleteCard(activeCard.id, activeCard.card_name)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors border-0 bg-transparent cursor-pointer"
                title="Delete Card"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Tier 2: Credit Utilization & Spend-to-Limit Ratio with 30% Marker */}
          <div className={`p-6 rounded-2xl border-0 flex flex-col gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gauge className={`h-4 w-4 ${utilizationPercent > 30 ? 'text-amber-400' : 'text-emerald-400'}`} />
                <h3 className="text-base font-bold">
                  Credit Spend-to-Limit Utilization
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                Cycle Statement Date: <strong className="text-slate-200">{stmtDay}th of each month</strong>
              </span>
            </div>

            {/* Custom Progress Bar with 30% Marker */}
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-300">
                  Total Payment: <span className="text-red-400 font-extrabold">{formatCurrency(totalPayment)}</span>
                </span>
                <span className={utilizationPercent > 30 ? 'text-amber-400 font-extrabold' : 'text-emerald-400'}>
                  {utilizationPercent.toFixed(1)}% of {formatCurrency(creditLimit, false)} Limit
                </span>
              </div>

              {/* Progress Track with 30% Line */}
              <div className="relative w-full h-5 rounded-full overflow-hidden bg-slate-950/60 p-0.5 border border-slate-800/80 shadow-inner">
                {/* 30% Milestone Line */}
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400/90 z-20 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                  style={{ left: '30%' }}
                  title="30% Safe Utilization Milestone"
                />
                
                {/* Active Progress Fill */}
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    utilizationPercent > 50 
                      ? 'bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500' 
                      : utilizationPercent > 30 
                        ? 'bg-gradient-to-r from-emerald-500 to-amber-400' 
                        : 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, utilizationPercent))}%` }}
                />
              </div>

              {/* Threshold Labels */}
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium px-0.5">
                <span>0% Utilized</span>
                <span className="text-amber-400 font-bold flex items-center gap-1">
                  ▲ 30% Recommended Cap ({formatCurrency(safeSpend30, false)})
                </span>
                <span>100% Limit ({formatCurrency(creditLimit, false)})</span>
              </div>
            </div>
          </div>

          {/* Tier 3: 3-Column KPI Stat Deck */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatDeckCard
              title="Credit Utilization"
              value={`${utilizationPercent.toFixed(1)}%`}
              sublabel={utilizationPercent <= 30 ? "✓ Healthy (<30% CIBIL guideline)" : "⚠ Above 30% recommended buffer"}
              valueColor={utilizationPercent <= 30 ? "text-emerald-400" : "text-amber-400"}
              icon={Gauge}
            />
            <StatDeckCard
              title="Available Limit"
              value={formatCurrency(availableLimit, false)}
              sublabel={`Out of ${formatCurrency(creditLimit, false)} total limit`}
              icon={ShieldCheck}
            />
            <StatDeckCard
              title="Total Payment"
              value={formatCurrency(totalPayment)}
              sublabel={isStatementVerified ? `Verified Due on ${dueDateText}` : `Statement Day ${stmtDay} • Due Day ${dueDay}`}
              valueColor="text-red-400"
              icon={Wallet}
            />
          </div>

          {/* Tier 4: Matching Transactions Ledger (Data Table) */}
          <div className={`p-6 rounded-2xl border-0 flex flex-col gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Matching Transactions Ledger ({activeTransactions.length})
            </h4>

            {activeTransactions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 italic">
                No transactions recorded on this credit card yet. Import a statement to view matching debits.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="hidden md:block overflow-x-auto">
<table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={`border-b ${style('border-slate-800/80 text-slate-400', 'border-slate-200 text-slate-600')}`}>
                      <th className="py-3 px-4 font-semibold">Date</th>
                      <th className="py-3 px-4 font-semibold">Merchant Description</th>
                      <th className="py-3 px-4 font-semibold">Category / Spend Type</th>
                      <th className="py-3 px-4 font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {activeTransactions.map(tx => {
                      const amt = Math.abs(parseFloat(tx.amount));
                      return (
                        <tr key={tx.id} className={`transition-colors ${style('hover:bg-slate-800/30', 'hover:bg-slate-50')}`}>
                          <td className="py-3 px-4 whitespace-nowrap text-slate-400">
                            {formatDate(tx.date, 'short')}
                          </td>
                          <td className="py-3 px-4 font-medium truncate max-w-xs" title={tx.description}>
                            {tx.description}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${style('bg-slate-800/40 text-slate-300', 'bg-slate-200 text-slate-700')}`}>
                              {tx.category || 'Retail'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-extrabold text-red-400">
                            {formatCurrency(amt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
</div>

                {/* Mobile Cards */}
                <div className="md:hidden flex flex-col gap-3">
                  {activeTransactions.map(tx => {
                    const amt = Math.abs(parseFloat(tx.amount));
                    return (
                      <div key={tx.id} className={`p-4 rounded-xl flex flex-col gap-2 ${style('bg-slate-800/30', 'bg-slate-50')}`}>
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col gap-1">
                            <span className="font-bold text-sm text-slate-200 truncate max-w-[200px]" title={tx.description}>{tx.description}</span>
                            <span className="text-xs text-slate-400">{formatDate(tx.date, 'short')}</span>
                          </div>
                          <span className="font-extrabold text-sm text-red-400">
                            {formatCurrency(amt)}
                          </span>
                        </div>
                        <div className="mt-1">
                          <span className={`px-2 py-1 rounded text-[10px] font-semibold ${style('bg-slate-800/60 text-slate-300', 'bg-slate-200 text-slate-700')}`}>
                            {tx.category || 'Retail'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            )}
          </div>

        </div>
      )}

      {/* Edit Card Configuration Modal */}
      {cardToEdit && (
        <EditCardModal
          isOpen={Boolean(cardToEdit)}
          onClose={() => setCardToEdit(null)}
          card={cardToEdit}
        />
      )}

    </div>
  );
};
