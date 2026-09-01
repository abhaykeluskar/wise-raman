import React, { useState, useMemo, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDate, toLocalDateKey } from '../../utils/formatters';
import { isInternalFlow, matchesPaymentRail } from '../../utils/analytics';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { 
  ListFilter, 
  Search, 
  Pencil, 
  Trash2, 
  Check, 
  X, 
  Sparkles, 
  TrendingDown, 
  CheckCircle2, 
  Landmark,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';

export const TransactionLedgerView = () => {
  const { theme, style } = useTheme();
  const { transactions, accounts, banks, categories, fetchData, setTransactions, ledgerFocus, clearLedgerFocus } = useFinance();

  const [selectedBankId, setSelectedBankId] = useState('ALL');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [flowFilter, setFlowFilter] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState('');
  const [railFilter, setRailFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => {
    if (!ledgerFocus?.ts) return;
    setSelectedMonth(ledgerFocus.month || 'ALL');
    setSelectedCategoryFilter(ledgerFocus.category || 'ALL');
    setSearchQuery(ledgerFocus.search || '');
    setFlowFilter(ledgerFocus.flow || 'ALL');
    setSelectedDate(ledgerFocus.date || '');
    setRailFilter(ledgerFocus.rail || 'ALL');
    setSelectedBankId('ALL');
    setSelectedAccountFilter('ALL');
  }, [ledgerFocus]);

  // Only show banks that have at least one account registered
  const activeBanks = useMemo(() => {
    return banks.filter(b => accounts.some(a => a.bank_id === b.id));
  }, [banks, accounts]);

  // Filter accounts based on selected bank tab
  const availableAccounts = useMemo(() => {
    if (selectedBankId === 'ALL') return accounts;
    return accounts.filter(a => a.bank_id === selectedBankId);
  }, [accounts, selectedBankId]);

  // Available Months for dropdown
  const availableMonths = useMemo(() => {
    const months = new Set();
    transactions.forEach(tx => {
      if (tx.date) {
        // Format: YYYY-MM
        months.add(tx.date.substring(0, 7));
      }
    });
    return Array.from(months).sort().reverse();
  }, [transactions]);

  // Inline editing state
  const [editingTxId, setEditingTxId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // 1. Bank tab filter
      if (selectedBankId !== 'ALL') {
        const acc = accounts.find(a => String(a.id) === String(tx.account_id));
        if (!acc || String(acc.bank_id) !== String(selectedBankId)) return false;
      }

      // 2. Account dropdown filter
      if (selectedAccountFilter !== 'ALL' && String(tx.account_id) !== String(selectedAccountFilter)) {
        return false;
      }

      // 3. Category dropdown filter
      if (selectedCategoryFilter !== 'ALL' && tx.category !== selectedCategoryFilter) {
        return false;
      }
      
      // 4. Month filter
      if (selectedMonth !== 'ALL' && tx.date) {
        if (!tx.date.startsWith(selectedMonth)) return false;
      }

      // 5. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const descMatch = tx.description?.toLowerCase().includes(q);
        const catMatch = tx.category?.toLowerCase().includes(q);
        const subMatch = tx.subcategory?.toLowerCase().includes(q);
        if (!descMatch && !catMatch && !subMatch) return false;
      }

      if (selectedDate) {
        if (toLocalDateKey(tx.date) !== selectedDate) return false;
      }

      const amt = parseFloat(tx.amount);
      const internal = isInternalFlow(tx);
      if (flowFilter === 'OUTFLOW' && !(amt < 0 && !internal)) return false;
      if (flowFilter === 'INFLOW' && !(amt > 0 && !internal)) return false;
      if (flowFilter === 'TRANSFERS' && !internal) return false;

      if (!matchesPaymentRail(tx, accounts, railFilter)) return false;

      return true;
    });
  }, [transactions, accounts, selectedBankId, selectedAccountFilter, selectedCategoryFilter, selectedMonth, searchQuery, selectedDate, flowFilter, railFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const pagedTransactions = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredTransactions.slice(start, start + PAGE_SIZE);
  }, [filteredTransactions, page]);

  useEffect(() => {
    setPage(1);
  }, [selectedBankId, selectedAccountFilter, selectedCategoryFilter, selectedMonth, searchQuery, selectedDate, flowFilter, railFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Bank-specific chart data
  const bankChartData = useMemo(() => {
    const grouped = {};
    filteredTransactions.forEach(tx => {
      if (!tx.date || tx.amount >= 0) return;
      const d = new Date(tx.date);
      const key = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
      const ts = d.getTime();
      
      if (!grouped[key]) {
        grouped[key] = { name: key, timestamp: ts, Spend: 0 };
      }
      grouped[key].Spend += Math.abs(parseFloat(tx.amount));
    });
    return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp).slice(-20);
  }, [filteredTransactions]);

  // Actions
  const handleStartEdit = (tx) => {
    setEditingTxId(tx.id);
    const dateOnly = (tx.date || '').toString().split('T')[0];
    setEditDate(dateOnly);
    setEditDescription(tx.description || '');
    setEditAmount((tx.amount || 0).toString());
    setEditCategory(tx.category || 'Others');
  };

  const handleCancelEdit = () => {
    setEditingTxId(null);
  };

  const handleSaveEdit = async (txId) => {
    try {
      const res = await fetch(`/api/transactions/${txId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editDate,
          description: editDescription,
          amount: parseFloat(editAmount) || 0,
          category: editCategory,
          verified: true
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setTransactions(prev => prev.map(t => t.id === txId ? updated : t));
        setEditingTxId(null);
        fetchData();
      }
    } catch (err) {
      console.error("Error saving manual edit:", err);
    }
  };

  const { toast, confirm } = useToast();

  const handleDeleteTransaction = async (txId) => {
    const isConfirmed = await confirm({
      title: 'Delete Transaction',
      message: 'Are you sure you want to delete this transaction from the ledger?',
      confirmText: 'Delete',
      isDanger: true
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/transactions/${txId}`, { method: 'DELETE' });
      if (res.ok) {
        setTransactions(prev => prev.filter(t => t.id !== txId));
        toast.success('Transaction deleted.');
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to delete transaction.', 'Delete Error');
      }
    } catch (err) {
      console.error("Error deleting transaction:", err);
      toast.error('Connection error while deleting transaction.', 'Error');
    }
  };

  const handleVerify = async (txId, category) => {
    try {
      const res = await fetch(`/api/transactions/${txId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, verified: true })
      });
      if (res.ok) {
        setTransactions(prev => prev.map(t => t.id === txId ? { ...t, verified: true } : t));
      }
    } catch (err) {
      console.error("Error verifying transaction:", err);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 pb-12">
      
      {/* Header Banner */}
      <div className={`p-5 sm:p-6 rounded-3xl border-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-2xl flex items-center justify-center ${style('neu-flat-dark text-[#FF7E67]', 'neu-flat-light text-[#4A90E2]')}`}>
            <ListFilter className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${style('text-white', 'text-slate-800')}`}>
                Transaction Ledger
              </h1>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-orange-500/15 text-orange-400 border border-orange-500/20">
                {filteredTransactions.length} Transactions
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Normalized ledger with UPI intelligence, merchant categorization, and audit trail
            </p>
          </div>
        </div>
      </div>

      {/* 1. Horizontal Bank Navigation Tabs */}
      <div className="flex items-center flex-wrap gap-2 max-w-full">
        <button
          type="button"
          onClick={() => setSelectedBankId('ALL')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all border-0 cursor-pointer whitespace-nowrap ${
            selectedBankId === 'ALL'
              ? style('neu-flat-dark text-[#FF7E67] ring-1 ring-orange-500/30', 'bg-[#FF7E67] text-white shadow-md')
              : style('neu-inset-dark text-slate-400 hover:text-slate-200', 'neu-inset-light text-slate-600 hover:text-slate-900')
          }`}
        >
          All Accounts Ledger
        </button>

        {activeBanks.map(b => {
          const isSelected = selectedBankId === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBankId(b.id)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all border-0 cursor-pointer whitespace-nowrap ${
                isSelected
                  ? style('neu-flat-dark text-[#FF7E67] ring-1 ring-orange-500/30', 'bg-[#FF7E67] text-white shadow-md')
                  : style('neu-inset-dark text-slate-400 hover:text-slate-200', 'neu-inset-light text-slate-600 hover:text-slate-900')
              }`}
            >
              {b.name}
            </button>
          );
        })}
      </div>

      {/* 2. Contextual Spending Trend Chart for Selected Bank */}
      {bankChartData.length > 0 && (
        <div className={`p-6 rounded-2xl border-0 flex flex-col gap-3 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex items-center gap-2">
            <TrendingDown className={`h-4 w-4 ${style('text-[#FF7E67]', 'text-[#4A90E2]')}`} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {selectedBankId === 'ALL' ? 'Overall Recent Spend Velocity' : `${activeBanks.find(b => b.id === selectedBankId)?.name || 'Bank'} Spend Trend`}
            </h3>
          </div>

          <div className="w-full h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bankChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="ledgerSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme === 'dark' ? '#FF7E67' : '#ef4444'} stopOpacity={0.35}/>
                    <stop offset="95%" stopColor={theme === 'dark' ? '#FF7E67' : '#ef4444'} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#1A1A2E' : '#E2E8F0'} />
                <XAxis dataKey="name" stroke="#8d99ae" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="#8d99ae" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: theme === 'dark' ? '#0F0F1A' : '#FFFFFF',
                    borderColor: theme === 'dark' ? '#24243E' : '#A3B1C6',
                    color: theme === 'dark' ? '#EAEAEA' : '#2D3436',
                    borderRadius: '12px',
                    fontSize: '11px'
                  }}
                  formatter={(v) => [`₹${v.toLocaleString()}`, "Spend"]}
                />
                <Area type="monotone" dataKey="Spend" stroke={theme === 'dark' ? '#FF7E67' : '#ef4444'} fill="url(#ledgerSpend)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 3. Search & Filter Bar */}
      {ledgerFocus?.ts && (
        <div className={`px-4 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs font-semibold ${style('neu-inset-dark text-slate-300', 'neu-inset-light text-slate-700')}`}>
          <span>
            Filtered from Stats
            {selectedMonth !== 'ALL' ? ` · ${selectedMonth}` : ''}
            {selectedDate ? ` · ${selectedDate}` : ''}
            {selectedCategoryFilter !== 'ALL' ? ` · ${selectedCategoryFilter}` : ''}
            {flowFilter !== 'ALL' ? ` · ${flowFilter}` : ''}
            {railFilter !== 'ALL' ? ` · ${railFilter}` : ''}
            {searchQuery ? ` · “${searchQuery}”` : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedMonth('ALL');
              setSelectedCategoryFilter('ALL');
              setSearchQuery('');
              setFlowFilter('ALL');
              setSelectedDate('');
              setRailFilter('ALL');
              clearLedgerFocus();
            }}
            className="text-[#FF7E67] border-0 bg-transparent cursor-pointer font-bold"
          >
            Clear
          </button>
        </div>
      )}
      <div className={`p-4 px-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 border-0 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="relative w-full sm:w-72">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search merchant, category, ref..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={`w-full rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap sm:flex-nowrap">
          <select
            value={flowFilter}
            onChange={e => setFlowFilter(e.target.value)}
            className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 cursor-pointer ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
          >
            <option value="ALL">All flows</option>
            <option value="OUTFLOW">Outflow</option>
            <option value="INFLOW">Inflow</option>
            <option value="TRANSFERS">Transfers</option>
          </select>

          {/* Account Filter */}
          <select
            value={selectedAccountFilter}
            onChange={e => setSelectedAccountFilter(e.target.value)}
            className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 cursor-pointer ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
          >
            <option value="ALL">All Accounts</option>
            {availableAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.subtype})</option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategoryFilter}
            onChange={e => setSelectedCategoryFilter(e.target.value)}
            className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 cursor-pointer ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
          >
            <option value="ALL">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          {/* Month Filter */}
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 cursor-pointer ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
          >
            <option value="ALL">All Months</option>
            {availableMonths.map(m => (
              <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. Transactions Data Table */}
      <div className={`p-6 rounded-2xl border-0 flex flex-col gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Transactions Log ({filteredTransactions.length})
          </h4>
          {filteredTransactions.length > 0 && (
            <span className="text-[10px] font-semibold text-slate-500">
              Page {page} of {totalPages} · {PAGE_SIZE} per page
            </span>
          )}
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 italic">
            No matching transactions found. Try adjusting your filters or importing a statement.
          </div>
        ) : (
          <> <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`border-b ${style('border-slate-800/80 text-slate-400', 'border-slate-200 text-slate-600')}`}>
                  <th className="py-3 px-4 font-semibold">Date</th>
                  <th className="py-3 px-4 font-semibold">Description / Merchant</th>
                  <th className="py-3 px-4 font-semibold">Account</th>
                  <th className="py-3 px-4 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold text-right">Amount</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {pagedTransactions.map(tx => {
                  const isEditing = editingTxId === tx.id;
                  const amt = parseFloat(tx.amount);
                  const isIncome = amt > 0;
                  const acc = accounts.find(a => a.id === tx.account_id);

                  if (isEditing) {
                    return (
                      <tr key={tx.id} className={style('bg-slate-800/50', 'bg-slate-100')}>
                        <td className="py-2.5 px-3">
                          <input
                            type="date"
                            value={editDate}
                            onChange={e => setEditDate(e.target.value)}
                            className="rounded-lg px-2 py-1 text-xs border-0 bg-slate-900 text-white"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={editDescription}
                            onChange={e => setEditDescription(e.target.value)}
                            className="w-full rounded-lg px-2 py-1 text-xs border-0 bg-slate-900 text-white"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-xxs">
                          {acc?.name || 'Account'}
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            value={editCategory}
                            onChange={e => setEditCategory(e.target.value)}
                            className="rounded-lg px-2 py-1 text-xs border-0 bg-slate-900 text-white"
                          >
                            {categories.map(c => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            step="0.01"
                            value={editAmount}
                            onChange={e => setEditAmount(e.target.value)}
                            className="w-24 rounded-lg px-2 py-1 text-xs border-0 bg-slate-900 text-white text-right"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center" colSpan={2}>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleSaveEdit(tx.id)}
                              className="p-1 rounded bg-emerald-600 text-white border-0 cursor-pointer"
                              title="Save"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1 rounded bg-slate-700 text-white border-0 cursor-pointer"
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={tx.id} className={`transition-colors ${style('hover:bg-slate-800/30', 'hover:bg-slate-50')}`}>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-400">
                        {formatDate(tx.date, 'short')}
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate font-medium" title={tx.description}>
                        {tx.description}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-xxs">
                        {acc?.name || 'Bank Account'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${style('bg-slate-800/40 text-slate-300', 'bg-slate-200 text-slate-700')}`}>
                          {tx.category || 'Others'}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-right font-extrabold whitespace-nowrap ${isIncome ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isIncome ? `+${formatCurrency(amt)}` : `-${formatCurrency(Math.abs(amt))}`}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {tx.verified ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold" title="AI / Rule Verified">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <button
                            onClick={() => handleVerify(tx.id, tx.category)}
                            className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-emerald-400 border-0 bg-transparent cursor-pointer transition-colors"
                            title="Click to Verify"
                          >
                            <Sparkles className="h-3 w-3" />
                            Verify
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleStartEdit(tx)}
                            className="p-1 text-slate-400 hover:text-slate-200 border-0 bg-transparent cursor-pointer transition-colors"
                            title="Edit Transaction"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTransaction(tx.id)}
                            className="p-1 text-slate-400 hover:text-red-400 border-0 bg-transparent cursor-pointer transition-colors"
                            title="Delete Transaction"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden flex flex-col gap-3">
            {pagedTransactions.map(tx => {
              const isEditing = editingTxId === tx.id;
              const amt = parseFloat(tx.amount);
              const isIncome = amt > 0;
              const acc = accounts.find(a => a.id === tx.account_id);

              if (isEditing) {
                return (
                  <div key={tx.id} className={`p-4 rounded-xl flex flex-col gap-3 ${style('bg-slate-800/50', 'bg-slate-100')}`}>
                    <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border-0 bg-slate-900 text-white" />
                    <input type="text" value={editDescription} onChange={e => setEditDescription(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border-0 bg-slate-900 text-white" placeholder="Description" />
                    <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border-0 bg-slate-900 text-white">
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border-0 bg-slate-900 text-white text-right" placeholder="Amount" />
                    <div className="flex gap-2 justify-end mt-2">
                      <button onClick={() => handleSaveEdit(tx.id)} className="flex-1 p-2 rounded-lg bg-emerald-600 text-white font-bold flex justify-center items-center gap-2 border-0">
                        <Check className="h-4 w-4" /> Save
                      </button>
                      <button onClick={handleCancelEdit} className="flex-1 p-2 rounded-lg bg-slate-700 text-white font-bold flex justify-center items-center gap-2 border-0">
                        <X className="h-4 w-4" /> Cancel
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={tx.id} className={`p-4 rounded-xl flex flex-col gap-2 ${style('bg-slate-800/30', 'bg-slate-50')}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className={`font-bold text-sm truncate max-w-[200px] ${style('text-slate-100', 'text-slate-800')}`} title={tx.description}>{tx.description}</span>
                      <span className="text-xs text-slate-400">{formatDate(tx.date, 'short')} &bull; {acc?.name || 'Bank Account'}</span>
                    </div>
                    <span className={`font-extrabold text-sm ${isIncome ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isIncome ? `+${formatCurrency(amt)}` : `-${formatCurrency(Math.abs(amt))}`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className={`px-2 py-1 rounded text-[10px] font-semibold ${style('bg-slate-800/60 text-slate-300', 'bg-slate-200 text-slate-700')}`}>
                      {tx.category || 'Others'}
                    </span>
                    <div className="flex gap-3 items-center">
                      {tx.verified ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold"><CheckCircle2 className="h-3 w-3" /></span>
                      ) : (
                        <button onClick={() => handleVerify(tx.id, tx.category)} className="text-[10px] text-slate-400 border-0 bg-transparent flex items-center gap-1"><Sparkles className="h-3 w-3" /></button>
                      )}
                      <button onClick={() => handleStartEdit(tx)} className="text-slate-400 border-0 bg-transparent"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDeleteTransaction(tx.id)} className="text-slate-400 hover:text-red-400 border-0 bg-transparent"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={`inline-flex items-center gap-1 min-h-10 px-3 rounded-xl text-xs font-bold border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${style('neu-btn-dark text-slate-300', 'neu-btn-light text-slate-700')}`}
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <span className="text-xs font-semibold text-slate-400">
                {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filteredTransactions.length)} of {filteredTransactions.length}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className={`inline-flex items-center gap-1 min-h-10 px-3 rounded-xl text-xs font-bold border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${style('neu-btn-dark text-slate-300', 'neu-btn-light text-slate-700')}`}
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

        </>
        )}
      </div>

    </div>
  );
};
