import React, { useState, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { Badge } from '../atoms/Badge';
import { NetworkLogo } from '../atoms/NetworkLogo';
import { Button } from '../atoms/Button';
import { StatDeckCard } from '../molecules/StatDeckCard';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getNextDueDate, cardTotalAmountDue } from '../../utils/analytics';
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
  const { cards, accounts, transactions, statements, banks, fetchData , authFetch} = useFinance();

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
    
    const cardTxs = allCardTxs.filter(t => parseFloat(t.amount) < 0 && !t.is_excluded_from_spending);
    const totalSpends = cardTxs.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

    let stmtsForCard = (statements || []).filter(s => String(s.account_id) === String(activeCard.account_id));
    if (selectedMonth !== 'ALL') {
      stmtsForCard = stmtsForCard.filter(s => s.statement_date && s.statement_date.startsWith(selectedMonth));
    }
    stmtsForCard.sort((a, b) => String(b.statement_date || '').localeCompare(String(a.statement_date || '')));
    const dueInfo = cardTotalAmountDue({
      transactions: allCardTxs,
      statements: stmtsForCard,
      accountId: activeCard.account_id
    });
    const latestStmt = dueInfo.statement;

    const finalPayment = dueInfo.amount;
    const openBal = latestStmt ? parseFloat(latestStmt.previous_dues) || 0 : 0;
    const dueTxt = latestStmt?.due_date ? formatDate(latestStmt.due_date, 'short') : '';
    const isVerified = dueInfo.source === 'statement';

    const limit = activeCard.monthly_cap ? parseFloat(activeCard.monthly_cap) : 100000;
    const avail = Math.max(0, limit - finalPayment);
    const util = limit > 0 ? (finalPayment / limit) * 100 : 0;
    const safe30 = limit * 0.30;
    const rem30 = Math.max(0, safe30 - finalPayment);

    const sDay = parseInt(activeCard.statement_date) || 1;
    const estimatedDue = getNextDueDate(activeCard);
    const dDay = estimatedDue.dueDate.getDate();

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
      dueDateText: dueTxt || estimatedDue.formattedDate,
      isStatementVerified: isVerified
    };
  }, [activeCard, accounts, transactions, statements]);

  const { toast, confirm } = useToast();

  // Handlers
  const handleAddCard = async (e) => {
    e.preventDefault();
    if (!newCardName.trim()) return;

    try {
      const res = await authFetch('/api/cards', {
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
      const res = await authFetch(`/api/cards/${cardId}`, { method: 'DELETE' });
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
      
      {/* Header Banner */}
      <div className={`p-5 sm:p-6 rounded-3xl border-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-2xl flex items-center justify-center ${style('neu-flat-dark text-[#5EEAD4]', 'neu-flat-light text-[#0F766E]')}`}>
            <CreditCardIcon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${style('text-[#F4F7FA]', 'text-[#17202A]')}`}>
                Credit Card Intelligence
              </h1>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#5EEAD4]/15 text-[#5EEAD4] border border-[#5EEAD4]/20">
                {cards.length} Cards
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Billing cycles, statement dues, 30% utilization guardrails, and reward tracking
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddCard(true)}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border-0 cursor-pointer self-start sm:self-auto transition-all ${style('neu-btn-dark text-[#5EEAD4]', 'neu-btn-light text-[#0F766E]')}`}
        >
          <Plus className="h-4 w-4" /> Add Card
        </button>
      </div>

      {/* 1. Card Tabs Navigation Bar */}
      {cards.length === 0 ? (
        <div className={`p-8 rounded-3xl text-center border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
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
          <div className="flex items-center flex-wrap gap-2 max-w-full">
            {cards.map(c => {
              const isSelected = activeCard?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCardId(c.id)}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all border-0 cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? style('neu-flat-dark text-[#5EEAD4] shadow-[0_0_10px_rgba(94,234,212,0.15)]', 'bg-[#0F766E] text-white shadow-md')
                      : style('neu-inset-dark text-slate-400 hover:text-slate-200', 'neu-inset-light text-slate-600 hover:text-slate-900')
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

          {/* Utilization & Spend-to-Limit Ratio */}
          <div className={`p-6 rounded-2xl border-0 flex flex-col gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <NetworkLogo network={activeCard.network} />
                <h3 className="text-base font-bold flex items-center gap-2">
                  {activeCard.card_name} <span className="text-slate-500 font-medium hidden sm:inline">Utilization</span>
                </h3>
              </div>
              <div className="flex items-center gap-3 justify-between sm:justify-end">
                <span className="text-xs font-semibold text-slate-400 shrink-0">
                  Statement Day: <strong className={style('text-slate-200', 'text-slate-700')}>{stmtDay}</strong>
                </span>
                <div className="flex items-center gap-1 border-l border-slate-700/50 pl-3">
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
            </div>

            {/* Payment + Utilisation Chips */}
            <div className="flex flex-wrap gap-3">
              {/* Total Payment chip */}
              <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl ${style('bg-slate-900/60 border border-slate-800/60', 'bg-white/80 border border-slate-200')}`}>
                <Wallet className="h-4 w-4 text-red-400 shrink-0" />
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Payment Due</span>
                  <span className="text-sm font-extrabold text-red-400 tabular-nums">{formatCurrency(totalPayment)}</span>
                </div>
              </div>
              {/* Utilization chip */}
              <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl ${style('bg-slate-900/60 border border-slate-800/60', 'bg-white/80 border border-slate-200')}`}>
                <Gauge className={`h-4 w-4 shrink-0 ${utilizationPercent > 30 ? 'text-amber-400' : 'text-emerald-400'}`} />
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Credit Utilization</span>
                  <span className={`text-sm font-extrabold tabular-nums ${utilizationPercent > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {utilizationPercent.toFixed(1)}%{' '}
                    <span className={`text-xs font-semibold ${style('text-slate-400', 'text-slate-500')}`}>
                      of {formatCurrency(creditLimit, false)} limit
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Progress Bar + Aligned Labels */}
            <div className="flex flex-col gap-2">
              {/* Track */}
              <div className="relative w-full h-4 rounded-full overflow-hidden bg-slate-950/60 p-[3px] border border-slate-800/80 shadow-inner">
                {/* 30% Milestone Line — sits at exactly 30% from left */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400/90 z-20 shadow-[0_0_6px_rgba(251,191,36,0.7)]"
                  style={{ left: '30%' }}
                  title="30% Safe Utilization Milestone"
                />
                {/* Fill */}
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

              {/* Labels — 0% edge, 30% absolutely aligned to marker, 100% edge */}
              <div className="relative flex items-start justify-between text-[10px] font-medium text-slate-500 px-0.5 min-h-[1.25rem]">
                <span className="shrink-0">0%</span>
                {/* This label is absolutely positioned at 30% to perfectly match the bar marker */}
                <span
                  className="absolute -translate-x-1/2 text-amber-400 font-bold whitespace-nowrap flex items-center gap-0.5 leading-tight text-center"
                  style={{ left: '30%' }}
                >
                  ▲ 30% cap
                  <span className={`hidden sm:inline ${style('text-slate-500', 'text-slate-400')}`}>
                    &nbsp;({formatCurrency(safeSpend30, false)})
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap">{formatCurrency(creditLimit, false)}</span>
              </div>
            </div>
          </div>

          {/* Tier 3: 3-Column KPI Stat Deck */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatDeckCard
              title="Credit Utilization"
              value={`${utilizationPercent.toFixed(1)}%`}
              sublabel={utilizationPercent <= 30 ? "✓ Under 30% (bureau rule of thumb, not an RBI cap)" : "⚠ Above 30% recommended buffer"}
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
                            <span className={`font-bold text-sm truncate max-w-[200px] ${style('text-slate-100', 'text-slate-800')}`} title={tx.description}>{tx.description}</span>
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
