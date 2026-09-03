import React, { useState, useMemo, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { SearchField } from '../molecules/SearchField';
import { FilterChip } from '../molecules/FilterChip';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { TransactionDetailDrawer } from '../organisms/TransactionDetailDrawer';
import { 
  Download, 
  Upload, 
  Filter, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight, 
  ArrowUpRight, 
  ArrowDownLeft, 
  FileSpreadsheet,
  Calendar,
  Layers,
  RotateCcw,
  Trash2
} from 'lucide-react';

export const TransactionLedgerView = ({ onOpenUploadModal, onViewSource }) => {
  const { theme } = useTheme();
  const { transactions, accounts, categories, ledgerFocus, clearLedgerFocus, authFetch, fetchData } = useFinance();
  const { confirm, toast } = useToast();
  const isDark = theme === 'dark';

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedRail, setSelectedRail] = useState('ALL');
  const [flowFilter, setFlowFilter] = useState('ALL'); // 'ALL' | 'INCOME' | 'EXPENSE' | 'TRANSFER'
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // Selected transaction for slide-over detail drawer
  const [activeTxForDrawer, setActiveTxForDrawer] = useState(null);

  // Sync ledger focus from deep links
  useEffect(() => {
    if (!ledgerFocus?.ts) return;
    if (ledgerFocus.search) setSearchQuery(ledgerFocus.search);
    if (ledgerFocus.category) setSelectedCategory(ledgerFocus.category);
    if (ledgerFocus.account) setSelectedAccount(ledgerFocus.account);
    if (ledgerFocus.flow) setFlowFilter(ledgerFocus.flow);
  }, [ledgerFocus]);

  // Unique months from transactions
  const availableMonths = useMemo(() => {
    const s = new Set();
    transactions.forEach(t => {
      if (t.date && t.date.length >= 7) {
        s.add(t.date.substring(0, 7));
      }
    });
    return Array.from(s).sort().reverse();
  }, [transactions]);

  // Unique rails
  const availableRails = useMemo(() => {
    const s = new Set();
    transactions.forEach(t => {
      if (t.payment_rail) s.add(t.payment_rail);
    });
    return Array.from(s);
  }, [transactions]);

  const hasActiveFilters = searchQuery !== '' || selectedAccount !== 'ALL' || selectedCategory !== 'ALL' || selectedRail !== 'ALL' || flowFilter !== 'ALL' || selectedMonth !== 'ALL' || selectedDate !== '';

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedAccount('ALL');
    setSelectedCategory('ALL');
    setSelectedRail('ALL');
    setFlowFilter('ALL');
    setSelectedMonth('ALL');
    setSelectedDate('');
    setPage(1);
    clearLedgerFocus();
  };

  // Delete transaction handler
  const handleDeleteTx = async (txId, e) => {
    e?.stopPropagation();
    const ok = await confirm({
      title: 'Delete Transaction',
      message: 'Are you sure you want to delete this transaction permanently? This will adjust your current account balance accordingly.',
      confirmText: 'Delete Transaction',
      isDanger: true
    });
    if (!ok) return;

    try {
      const res = await authFetch(`/api/transactions/${txId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchData();
        toast.success('Transaction deleted.');
      }
    } catch (err) {
      console.error('Failed to delete transaction:', err);
    }
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Account filter
      if (selectedAccount !== 'ALL' && String(tx.account_id) !== String(selectedAccount)) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'ALL' && tx.category !== selectedCategory) {
        return false;
      }

      // Payment Rail filter
      if (selectedRail !== 'ALL' && tx.payment_rail !== selectedRail) {
        return false;
      }

      // Flow filter
      const amt = parseFloat(tx.amount || 0);
      const isIncome = tx.flow === 'INFLOW' || tx.type === 'CREDIT' || amt > 0;
      const isTransfer = tx.category === 'Transfer' || tx.type === 'TRANSFER';

      if (flowFilter === 'INCOME' && (!isIncome || isTransfer)) return false;
      if (flowFilter === 'EXPENSE' && (isIncome || isTransfer)) return false;
      if (flowFilter === 'TRANSFER' && !isTransfer) return false;

      // Month filter
      if (selectedMonth !== 'ALL' && tx.date && !tx.date.startsWith(selectedMonth)) {
        return false;
      }

      // Date filter
      if (selectedDate && tx.date && !tx.date.startsWith(selectedDate)) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const desc = (tx.description || '').toLowerCase();
        const merch = (tx.merchant || '').toLowerCase();
        const ref = (tx.reference || '').toLowerCase();
        const cat = (tx.category || '').toLowerCase();
        if (!desc.includes(q) && !merch.includes(q) && !ref.includes(q) && !cat.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, selectedAccount, selectedCategory, selectedRail, flowFilter, selectedMonth, selectedDate, searchQuery]);

  // Summary strip metrics
  const summary = useMemo(() => {
    let income = 0;
    let expenses = 0;
    let transfers = 0;

    filteredTransactions.forEach(tx => {
      const amt = Math.abs(parseFloat(tx.amount || 0));
      const isIncome = tx.flow === 'INFLOW' || tx.type === 'CREDIT' || parseFloat(tx.amount || 0) > 0;
      const isTransfer = tx.category === 'Transfer' || tx.type === 'TRANSFER';

      if (isTransfer) {
        transfers += amt;
      } else if (isIncome) {
        income += amt;
      } else {
        expenses += amt;
      }
    });

    return { income, expenses, transfers };
  }, [filteredTransactions]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredTransactions.slice(start, start + PAGE_SIZE);
  }, [filteredTransactions, page]);

  // CSV Export handler
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) return;
    const headers = ['Date', 'Merchant', 'Description', 'Category', 'Account', 'Payment Rail', 'Amount', 'Type'];
    const rows = filteredTransactions.map(tx => [
      tx.date || '',
      `"${(tx.merchant || '').replace(/"/g, '""')}"`,
      `"${(tx.description || '').replace(/"/g, '""')}"`,
      tx.category || '',
      tx.account_name || '',
      tx.payment_rail || '',
      tx.amount || 0,
      tx.type || ''
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `wiseraman_transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200 pb-12">
      
      {/* 1. Header with metadata & Workspace Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E4E8E3]/30">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
            Transactions
          </h2>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            {transactions.length.toLocaleString()} transactions across {accounts.length} connected accounts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCSV}
            icon={Download}
          >
            Export CSV
          </Button>
          {onOpenUploadModal && (
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenUploadModal}
              icon={Upload}
            >
              Import Statement
            </Button>
          )}
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="space-y-3">
        <SearchField
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          onClear={() => setSearchQuery('')}
          placeholder="Search merchant, description, reference, category..."
        />

        {/* Filter Chips row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {/* Flow Filters */}
          <FilterChip
            label="All Flows"
            active={flowFilter === 'ALL'}
            onClick={() => { setFlowFilter('ALL'); setPage(1); }}
          />
          <FilterChip
            label="Income"
            active={flowFilter === 'INCOME'}
            onClick={() => { setFlowFilter('INCOME'); setPage(1); }}
          />
          <FilterChip
            label="Expenses"
            active={flowFilter === 'EXPENSE'}
            onClick={() => { setFlowFilter('EXPENSE'); setPage(1); }}
          />
          <FilterChip
            label="Transfers"
            active={flowFilter === 'TRANSFER'}
            onClick={() => { setFlowFilter('TRANSFER'); setPage(1); }}
          />

          {/* Month Filter */}
          {availableMonths.length > 0 && (
            <select
              value={selectedMonth}
              onChange={(e) => { setSelectedMonth(e.target.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer outline-none ${
                selectedMonth !== 'ALL'
                  ? isDark ? 'bg-[rgba(91,174,120,0.2)] text-[#7FC39A] border-[#5BAE78]/50 font-semibold' : 'bg-[#E2F1E8] text-[#285A3A] border-[#A5D5B9] font-semibold'
                  : isDark ? 'bg-[#171E19] text-[#C2CCC5] border-[#2A352D]' : 'bg-[#FFFFFF] text-[#4F5D55] border-[#E4E8E3]'
              }`}
            >
              <option value="ALL">All Months</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}

          {/* Account Filter */}
          {accounts.length > 0 && (
            <select
              value={selectedAccount}
              onChange={(e) => { setSelectedAccount(e.target.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer outline-none ${
                selectedAccount !== 'ALL'
                  ? isDark ? 'bg-[rgba(91,174,120,0.2)] text-[#7FC39A] border-[#5BAE78]/50 font-semibold' : 'bg-[#E2F1E8] text-[#285A3A] border-[#A5D5B9] font-semibold'
                  : isDark ? 'bg-[#171E19] text-[#C2CCC5] border-[#2A352D]' : 'bg-[#FFFFFF] text-[#4F5D55] border-[#E4E8E3]'
              }`}
            >
              <option value="ALL">All Accounts</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          )}

          {/* Category Filter */}
          {categories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer outline-none ${
                selectedCategory !== 'ALL'
                  ? isDark ? 'bg-[rgba(91,174,120,0.2)] text-[#7FC39A] border-[#5BAE78]/50 font-semibold' : 'bg-[#E2F1E8] text-[#285A3A] border-[#A5D5B9] font-semibold'
                  : isDark ? 'bg-[#171E19] text-[#C2CCC5] border-[#2A352D]' : 'bg-[#FFFFFF] text-[#4F5D55] border-[#E4E8E3]'
              }`}
            >
              <option value="ALL">All Categories</option>
              {categories.map(c => (
                <option key={c.id || c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}

          {/* Payment Rail Filter */}
          {availableRails.length > 0 && (
            <select
              value={selectedRail}
              onChange={(e) => { setSelectedRail(e.target.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer outline-none ${
                selectedRail !== 'ALL'
                  ? isDark ? 'bg-[rgba(91,174,120,0.2)] text-[#7FC39A] border-[#5BAE78]/50 font-semibold' : 'bg-[#E2F1E8] text-[#285A3A] border-[#A5D5B9] font-semibold'
                  : isDark ? 'bg-[#171E19] text-[#C2CCC5] border-[#2A352D]' : 'bg-[#FFFFFF] text-[#4F5D55] border-[#E4E8E3]'
              }`}
            >
              <option value="ALL">All Payment Rails</option>
              {availableRails.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}

          {/* Date Picker Input */}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value); setPage(1); }}
            className={`px-2.5 py-1 rounded-full text-xs border outline-none cursor-pointer ${
              selectedDate
                ? isDark ? 'bg-[rgba(91,174,120,0.2)] text-[#7FC39A] border-[#5BAE78]/50 font-semibold' : 'bg-[#E2F1E8] text-[#285A3A] border-[#A5D5B9] font-semibold'
                : isDark ? 'bg-[#171E19] text-[#C2CCC5] border-[#2A352D]' : 'bg-[#FFFFFF] text-[#4F5D55] border-[#E4E8E3]'
            }`}
          />

          {/* Reset Filters Chip */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-[#C85C5C] bg-[#FBEAEA]/30 hover:bg-[#FBEAEA]/60 border border-[#C85C5C]/30 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Summary Strip (Section 13) */}
      <div className={`px-5 py-3 rounded-[12px] border flex flex-wrap items-center justify-between gap-4 text-xs ${
        isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
      }`}>
        <span className={`font-semibold ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
          Showing {filteredTransactions.length} of {transactions.length} transactions
        </span>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <span className="text-[#8B978F]">Income:</span>
            <span className="font-semibold text-[#3F8F5E] tabular-nums">
              +{formatCurrency(summary.income)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[#8B978F]">Expenses:</span>
            <span className={`font-semibold tabular-nums ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
              -{formatCurrency(summary.expenses)}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-[#8B978F]">Transfers:</span>
            <span className="font-semibold text-[#A77B58] tabular-nums">
              {formatCurrency(summary.transfers)}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Transaction Table */}
      <div className={`rounded-[16px] border overflow-hidden ${
        isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
      }`}>
        {/* Table Header */}
        <div className={`hidden sm:grid grid-cols-12 gap-4 px-4 py-3 border-b text-[11px] font-bold uppercase tracking-wider ${
          isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#8B978F]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#7B877F]'
        }`}>
          <div className="col-span-2">Date</div>
          <div className="col-span-4">Description / Merchant</div>
          <div className="col-span-2">Category</div>
          <div className="col-span-2">Account / Rail</div>
          <div className="col-span-2 text-right">Amount / Actions</div>
        </div>

        {/* Rows */}
        {paginatedTransactions.length > 0 ? (
          <div className="divide-y divide-[#E4E8E3]/20">
            {paginatedTransactions.map((tx) => (
              <div
                key={tx.id}
                onClick={() => setActiveTxForDrawer(tx)}
                className={`group px-4 py-3 transition-colors duration-150 cursor-pointer ${
                  isDark ? 'hover:bg-[#1C251F]' : 'hover:bg-[#F1F8F4]/40'
                }`}
              >
                {/* Desktop Grid Layout */}
                <div className="hidden sm:grid grid-cols-12 gap-4 items-center text-xs">
                  {/* Date */}
                  <div className="col-span-2 text-xs font-medium">
                    <span className={isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}>
                      {tx.date ? formatDate(tx.date) : '—'}
                    </span>
                  </div>

                  {/* Description / Merchant */}
                  <div className="col-span-4 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold truncate ${
                        isDark ? 'text-[#F1F5F2] group-hover:text-[#7FC39A]' : 'text-[#1D2822] group-hover:text-[#3F8F5E]'
                      }`}>
                        {tx.merchant || tx.description || 'Unknown'}
                      </span>
                      {tx.verified && (
                        <CheckCircle2 className="h-3 w-3 text-[#3F8F5E] shrink-0" title="Verified" />
                      )}
                    </div>
                    {tx.merchant && tx.description && tx.merchant !== tx.description && (
                      <span className="text-[11px] text-[#8B978F] truncate block">
                        {tx.description}
                      </span>
                    )}
                  </div>

                  {/* Category */}
                  <div className="col-span-2">
                    <Badge variant={tx.category === 'Transfer' ? 'neutral' : 'brown'} size="xs">
                      {tx.category || 'General'}
                    </Badge>
                  </div>

                  {/* Account / Rail */}
                  <div className="col-span-2 text-[11px]">
                    <div className="font-medium truncate">{tx.account_name || 'Account'}</div>
                    <div className="text-[10px] font-mono text-[#8B978F]">{tx.payment_rail || 'OTHER'}</div>
                  </div>

                  {/* Amount / Action */}
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <div className={`tabular-nums font-semibold ${
                      tx.category === 'Transfer' || tx.type === 'TRANSFER'
                        ? isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'
                        : tx.flow === 'INFLOW' || tx.type === 'CREDIT' || parseFloat(tx.amount || 0) > 0
                          ? 'text-[#3F8F5E]'
                          : isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'
                    }`}>
                      {tx.category === 'Transfer' ? '' : (tx.flow === 'INFLOW' || tx.type === 'CREDIT' || parseFloat(tx.amount || 0) > 0) ? '+' : '-'}
                      {formatCurrency(Math.abs(parseFloat(tx.amount || 0)))}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteTx(tx.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[#8B978F] hover:text-[#C85C5C] transition-opacity cursor-pointer border-0 bg-transparent"
                      title="Delete transaction"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Mobile Card Layout */}
                <div className="sm:hidden flex items-center justify-between">
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs truncate">
                        {tx.merchant || tx.description}
                      </span>
                      {tx.verified && <CheckCircle2 className="h-3 w-3 text-[#3F8F5E]" />}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#8B978F] mt-0.5">
                      <span>{tx.date ? formatDate(tx.date) : ''}</span>
                      <span>·</span>
                      <span>{tx.category || 'General'}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`tabular-nums text-xs font-semibold ${
                      parseFloat(tx.amount || 0) > 0 ? 'text-[#3F8F5E]' : ''
                    }`}>
                      {parseFloat(tx.amount || 0) > 0 ? '+' : '-'}
                      {formatCurrency(Math.abs(parseFloat(tx.amount || 0)))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <h4 className="text-sm font-bold">Nothing here yet</h4>
            <p className={`text-xs mt-1 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              No transactions match your current search or filter criteria.
            </p>
          </div>
        )}

        {/* Pagination Controls */}
        <div className={`p-4 border-t flex items-center justify-between gap-4 text-xs ${
          isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
        }`}>
          <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>
            Page {page} of {totalPages} ({filteredTransactions.length} records)
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="xs"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              icon={ChevronLeft}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="xs"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              icon={ChevronRight}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* 5. Slide-over Transaction Detail Drawer */}
      <TransactionDetailDrawer
        transaction={activeTxForDrawer}
        isOpen={!!activeTxForDrawer}
        onClose={() => setActiveTxForDrawer(null)}
        onViewSource={onViewSource}
      />

    </div>
  );
};
