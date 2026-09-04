import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { IconButton } from '../atoms/IconButton';
import { 
  X, 
  CheckCircle2, 
  FileText, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Landmark, 
  CreditCard, 
  ShieldCheck, 
  Hash, 
  Tag, 
  Calendar,
  Layers,
  ExternalLink,
  Check,
  RotateCcw,
  ArrowLeftRight,
  Link,
  Unlink,
  Search,
  Sparkles,
  AlertCircle,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';

export const TransactionDetailDrawer = ({
  transaction,
  isOpen,
  onClose,
  onViewSource
}) => {
  const { theme } = useTheme();
  const { accounts, categories, authFetch, fetchData } = useFinance();
  const isDark = theme === 'dark';

  const [selectedCategory, setSelectedCategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Transfer / Card Payment Linking States
  const [linkDetails, setLinkDetails] = useState(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [activeTab, setActiveTab] = useState('suggestions'); // 'suggestions' | 'search'
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [searchAccount, setSearchAccount] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');

  // Fetch link details whenever transaction changes
  const fetchLinkDetails = async () => {
    if (!transaction?.id) return;
    setLoadingLink(true);
    try {
      const res = await authFetch(`/api/transfers/link-details/${transaction.id}`);
      if (res.ok) {
        const data = await res.json();
        setLinkDetails(data);
        if (data.is_linked) {
          setEditAmount(data.amount ? data.amount.toString() : '');
          setEditDate(data.transfer_date || '');
        }
      }
    } catch (err) {
      console.error('Failed to fetch transfer link details:', err);
    } finally {
      setLoadingLink(false);
    }
  };

  useEffect(() => {
    if (isOpen && transaction?.id) {
      fetchLinkDetails();
      setShowLinkPanel(false);
      setShowUnlinkConfirm(false);
      setShowEditModal(false);
      setStatusMsg(null);
    }
  }, [isOpen, transaction?.id]);

  if (!isOpen || !transaction) return null;

  const amount = parseFloat(transaction.amount || 0);
  const isIncome = transaction.flow === 'INFLOW' || transaction.type === 'CREDIT' || amount > 0;
  const isTransfer = transaction.category === 'Transfer' || transaction.type === 'TRANSFER' || linkDetails?.is_linked;
  const displayAmount = Math.abs(amount);

  // Handle Category update
  const handleCategoryChange = async (newCat) => {
    setIsSaving(true);
    try {
      const res = await authFetch(`/api/transactions/${transaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCat })
      });
      if (res.ok) {
        setSaveSuccess(true);
        transaction.category = newCat;
        await fetchData();
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch (err) {
      console.error('Failed to update category:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Mark as Transfer
  const handleMarkTransfer = async () => {
    const newCat = isTransfer ? 'General' : 'Transfer';
    await handleCategoryChange(newCat);
  };

  // Fetch match candidates
  const fetchCandidates = async () => {
    if (!transaction?.id) return;
    setLoadingCandidates(true);
    try {
      const res = await authFetch(`/api/transfers/candidates?transaction_id=${transaction.id}`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data);
      }
    } catch (err) {
      console.error('Failed to fetch candidates:', err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleOpenLinkPanel = () => {
    const nextState = !showLinkPanel;
    setShowLinkPanel(nextState);
    if (nextState && candidates.length === 0) {
      fetchCandidates();
    }
  };

  // Handle Search candidate transactions
  const handleSearchTransactions = async (q = searchQuery, accId = searchAccount) => {
    if (!transaction?.id) return;
    setLoadingSearch(true);
    try {
      let url = `/api/transfers/searchable-transactions?exclude_id=${transaction.id}`;
      if (accId) url += `&account_id=${accId}`;
      if (q.trim()) url += `&query=${encodeURIComponent(q.trim())}`;
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (err) {
      console.error('Failed to search transactions:', err);
    } finally {
      setLoadingSearch(false);
    }
  };

  // Link transactions
  const handleLinkTransactions = async (counterpartTxId, customAmount = null) => {
    setActionLoading(true);
    try {
      const payload = {
        from_transaction_id: transaction.amount < 0 ? transaction.id : counterpartTxId,
        to_transaction_id: transaction.amount < 0 ? counterpartTxId : transaction.id,
        amount: customAmount ? parseFloat(customAmount) : undefined
      };
      const res = await authFetch('/api/transfers/link-existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setStatusMsg({ type: 'success', text: 'Transactions successfully linked as transfer pair!' });
        setShowLinkPanel(false);
        await fetchLinkDetails();
        await fetchData();
        setTimeout(() => setStatusMsg(null), 3500);
      } else {
        const err = await res.json();
        setStatusMsg({ type: 'error', text: err.detail || 'Failed to link transactions' });
      }
    } catch (err) {
      console.error('Link error:', err);
      setStatusMsg({ type: 'error', text: 'Failed to link transactions' });
    } finally {
      setActionLoading(false);
    }
  };

  // Unlink transactions
  const handleUnlinkTransactions = async () => {
    if (!linkDetails?.transfer_link_id) return;
    setActionLoading(true);
    try {
      const res = await authFetch(`/api/transfers/links/${linkDetails.transfer_link_id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setStatusMsg({ type: 'success', text: 'Transfer link removed. Normal classification restored.' });
        setShowUnlinkConfirm(false);
        setLinkDetails({ is_linked: false });
        await fetchData();
        setTimeout(() => setStatusMsg(null), 3500);
      } else {
        const err = await res.json();
        setStatusMsg({ type: 'error', text: err.detail || 'Failed to unlink' });
      }
    } catch (err) {
      console.error('Unlink error:', err);
      setStatusMsg({ type: 'error', text: 'Failed to unlink' });
    } finally {
      setActionLoading(false);
    }
  };

  // Edit Link
  const handleEditLink = async (newCounterpartId = null) => {
    if (!linkDetails?.transfer_link_id) return;
    setActionLoading(true);
    try {
      const payload = {
        current_transaction_id: transaction.id,
        new_counterpart_transaction_id: newCounterpartId || undefined,
        amount: editAmount ? parseFloat(editAmount) : undefined,
        transfer_date: editDate || undefined
      };
      const res = await authFetch(`/api/transfers/links/${linkDetails.transfer_link_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setStatusMsg({ type: 'success', text: 'Transfer link updated successfully!' });
        setShowEditModal(false);
        await fetchLinkDetails();
        await fetchData();
        setTimeout(() => setStatusMsg(null), 3500);
      } else {
        const err = await res.json();
        setStatusMsg({ type: 'error', text: err.detail || 'Failed to update link' });
      }
    } catch (err) {
      console.error('Edit link error:', err);
      setStatusMsg({ type: 'error', text: 'Failed to update link' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className={`w-screen max-w-md border-l flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200 ${
          isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
        }`}>
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-[#2A352D]/20">
            <div className="flex items-center justify-between mb-4">
              <span className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                Transaction Provenance
              </span>
              <IconButton
                icon={X}
                onClick={onClose}
                size="sm"
                variant="ghost"
                title="Close drawer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold tracking-tight">
                {transaction.merchant || transaction.description || 'Transaction'}
              </h2>
              <div className={`tabular-nums text-3xl font-[650] tracking-tight mt-1 ${
                isTransfer ? (isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]') : isIncome ? 'text-[#3F8F5E]' : (isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]')
              }`}>
                {isTransfer ? '' : isIncome ? '+' : '-'}{formatCurrency(displayAmount)}
              </div>
              <span className={`text-xs mt-1 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                {transaction.date ? formatDate(transaction.date) : 'Unknown Date'}
              </span>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
            
            {/* Quick Actions Strip */}
            <div className="flex items-center gap-2">
              <select
                value={transaction.category || ''}
                onChange={(e) => handleCategoryChange(e.target.value)}
                disabled={isSaving}
                className={`flex-1 text-xs px-3 py-1.5 rounded-[10px] border outline-none cursor-pointer ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              >
                <option value="">Change Category...</option>
                {categories.map(c => (
                  <option key={c.id || c.name} value={c.name}>{c.name}</option>
                ))}
              </select>

              <Button
                variant={isTransfer ? 'secondary' : 'brown'}
                size="sm"
                onClick={handleMarkTransfer}
                disabled={isSaving}
              >
                {isTransfer ? 'Unmark Transfer' : 'Mark as Transfer'}
              </Button>
            </div>

            {saveSuccess && (
              <div className="p-2 rounded-[8px] text-xs font-semibold bg-[#E2F1E8] text-[#285A3A] flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />
                <span>Transaction updated successfully.</span>
              </div>
            )}

            {statusMsg && (
              <div className={`p-2.5 rounded-[8px] text-xs font-medium flex items-center gap-2 ${
                statusMsg.type === 'success' 
                  ? 'bg-[#E2F1E8] text-[#285A3A] border border-[#C6E4D2]' 
                  : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
              }`}>
                {statusMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                <span>{statusMsg.text}</span>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TRANSFER & CREDIT CARD PAYMENT LINKING (ADD / EDIT / DELETE)  */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className={`p-4 rounded-[12px] border transition-all ${
              linkDetails?.is_linked 
                ? (isDark ? 'bg-[#18231C] border-[#2F4F38]' : 'bg-[#F2F9F5] border-[#C2E3D0]')
                : (isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]')
            }`}>
              
              {/* STATE A: ALREADY LINKED */}
              {linkDetails?.is_linked ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-[#3F8F5E]/20 text-[#3F8F5E]">
                        <ArrowLeftRight className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-bold tracking-tight">
                        Linked Transfer Pair
                      </span>
                    </div>
                    <Badge variant="positive" size="xs">
                      Double-Entry Active
                    </Badge>
                  </div>

                  <p className={`text-[11px] ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
                    Bound to counterpart leg with net ₹0 economic spending delta.
                  </p>

                  {/* Counterpart Card */}
                  {linkDetails.counterpart && (
                    <div className={`p-3 rounded-[8px] border text-xs space-y-1.5 ${
                      isDark ? 'bg-[#121914] border-[#2A352D]' : 'bg-white border-[#E4E8E3]'
                    }`}>
                      <div className="flex items-center justify-between font-semibold">
                        <span className="truncate">{linkDetails.counterpart.account_name}</span>
                        <span className="tabular-nums font-bold text-[#3F8F5E]">
                          {linkDetails.counterpart.amount > 0 ? '+' : '-'}{formatCurrency(Math.abs(linkDetails.counterpart.amount))}
                        </span>
                      </div>
                      <div className={`text-[11px] truncate ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                        {linkDetails.counterpart.description || linkDetails.counterpart.raw_narration || 'Counterpart Leg'}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#8B978F] pt-1 border-t border-[#2A352D]/10">
                        <span>Date: {formatDate(linkDetails.counterpart.date)}</span>
                        {linkDetails.counterpart.reference_id && (
                          <span className="font-mono truncate max-w-[140px]">Ref: {linkDetails.counterpart.reference_id}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Edit Form */}
                  {showEditModal && (
                    <div className={`p-3 rounded-[8px] border space-y-3 mt-2 ${
                      isDark ? 'bg-[#141C16] border-[#2A352D]' : 'bg-white border-[#E4E8E3]'
                    }`}>
                      <span className="text-xs font-bold block">Edit Linked Transfer</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold block text-[#8B978F] mb-1">Transfer Amount (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            className={`w-full text-xs px-2.5 py-1.5 rounded-[6px] border outline-none ${
                              isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold block text-[#8B978F] mb-1">Transfer Date</label>
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className={`w-full text-xs px-2.5 py-1.5 rounded-[6px] border outline-none ${
                              isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                            }`}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button variant="secondary" size="xs" onClick={() => setShowEditModal(false)}>
                          Cancel
                        </Button>
                        <Button 
                          variant="brown" 
                          size="xs" 
                          disabled={actionLoading}
                          onClick={() => handleEditLink()}
                        >
                          {actionLoading ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Unlink Confirmation */}
                  {showUnlinkConfirm && (
                    <div className="p-3 rounded-[8px] bg-rose-500/10 border border-rose-500/20 text-xs space-y-2 mt-2">
                      <div className="flex items-center gap-1.5 font-bold text-rose-600">
                        <AlertCircle className="h-4 w-4" />
                        <span>Confirm Unlink</span>
                      </div>
                      <p className="text-[11px] text-rose-500/90 leading-relaxed">
                        Unlinking removes the transfer association and restores regular expense/income reporting. Both transactions remain in your statements.
                      </p>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button variant="secondary" size="xs" onClick={() => setShowUnlinkConfirm(false)}>
                          Cancel
                        </Button>
                        <Button 
                          variant="danger" 
                          size="xs" 
                          disabled={actionLoading}
                          onClick={handleUnlinkTransactions}
                        >
                          {actionLoading ? 'Unlinking...' : 'Yes, Unlink'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Link Management Action Buttons */}
                  {!showEditModal && !showUnlinkConfirm && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => { setShowEditModal(true); setShowUnlinkConfirm(false); }}
                        className="flex-1 flex items-center justify-center gap-1.5"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Edit Link</span>
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => { setShowUnlinkConfirm(true); setShowEditModal(false); }}
                        className="flex-1 flex items-center justify-center gap-1.5 text-rose-600 hover:text-rose-700"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Unlink</span>
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                /* STATE B: UNLINKED TRANSACTION */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded ${isDark ? 'bg-[#2A352D]' : 'bg-[#E4E8E3]'}`}>
                        <ArrowLeftRight className="h-4 w-4 text-[#8B978F]" />
                      </div>
                      <div>
                        <span className="text-xs font-bold block">Credit Card / Transfer Link</span>
                        <span className={`text-[10px] ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                          Link with counterpart entry to prevent double counting
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="brown"
                    size="xs"
                    onClick={handleOpenLinkPanel}
                    className="w-full flex items-center justify-center gap-1.5"
                  >
                    <Link className="h-3.5 w-3.5" />
                    <span>{showLinkPanel ? 'Close Matcher' : 'Link to Credit Card / Transfer'}</span>
                  </Button>

                  {/* Expandable Matcher Panel */}
                  {showLinkPanel && (
                    <div className={`p-3 rounded-[10px] border mt-2 space-y-3 animate-in fade-in duration-150 ${
                      isDark ? 'bg-[#141C16] border-[#2A352D]' : 'bg-white border-[#E4E8E3]'
                    }`}>
                      {/* Sub-tabs */}
                      <div className="flex items-center gap-1 p-0.5 rounded-[8px] bg-black/5 dark:bg-white/5 text-[11px] font-semibold">
                        <button
                          type="button"
                          onClick={() => { setActiveTab('suggestions'); if (candidates.length === 0) fetchCandidates(); }}
                          className={`flex-1 py-1 px-2 rounded-[6px] text-center transition-all ${
                            activeTab === 'suggestions' 
                              ? 'bg-white dark:bg-[#1E2821] shadow-xs text-[#3F8F5E] font-bold' 
                              : 'text-[#8B978F]'
                          }`}
                        >
                          Smart Suggestions ({candidates.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => { setActiveTab('search'); if (searchResults.length === 0) handleSearchTransactions(); }}
                          className={`flex-1 py-1 px-2 rounded-[6px] text-center transition-all ${
                            activeTab === 'search' 
                              ? 'bg-white dark:bg-[#1E2821] shadow-xs text-[#3F8F5E] font-bold' 
                              : 'text-[#8B978F]'
                          }`}
                        >
                          Manual Search
                        </button>
                      </div>

                      {/* TAB 1: SUGGESTIONS */}
                      {activeTab === 'suggestions' && (
                        <div className="space-y-2">
                          {loadingCandidates ? (
                            <div className="py-6 text-center text-xs text-[#8B978F] flex items-center justify-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin text-[#3F8F5E]" />
                              <span>Searching matching transactions...</span>
                            </div>
                          ) : candidates.length === 0 ? (
                            <div className="py-4 text-center text-xs text-[#8B978F]">
                              No automatic counterpart matches found within ±20 days. Use <strong>Manual Search</strong> to pick any transaction.
                            </div>
                          ) : (
                            candidates.map(cand => (
                              <div
                                key={cand.transaction_id}
                                className={`p-2.5 rounded-[8px] border text-xs flex flex-col gap-1.5 transition-all ${
                                  isDark ? 'bg-[#18231C] border-[#2A352D] hover:border-[#3F8F5E]' : 'bg-[#F9FCFA] border-[#E4E8E3] hover:border-[#3F8F5E]'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-[11px] truncate max-w-[180px]">
                                    {cand.account_name}
                                  </span>
                                  <span className="tabular-nums font-bold text-[#3F8F5E]">
                                    {cand.amount > 0 ? '+' : '-'}{formatCurrency(cand.abs_amount)}
                                  </span>
                                </div>
                                <div className={`text-[10px] truncate ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                                  {cand.description || cand.raw_narration}
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-[#8B978F] pt-1">
                                  <span>{formatDate(cand.date)} ({cand.days_difference === 0 ? 'Same day' : `${cand.days_difference}d apart`})</span>
                                  <Badge variant={cand.confidence_tier === 'HIGH' ? 'positive' : 'neutral'} size="xs">
                                    {cand.score}% Match
                                  </Badge>
                                </div>
                                <Button
                                  variant="brown"
                                  size="xs"
                                  disabled={actionLoading}
                                  onClick={() => handleLinkTransactions(cand.transaction_id)}
                                  className="w-full mt-1"
                                >
                                  {actionLoading ? 'Linking...' : 'Link This Transaction'}
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* TAB 2: MANUAL SEARCH */}
                      {activeTab === 'search' && (
                        <div className="space-y-2">
                          <div className="space-y-1.5">
                            <select
                              value={searchAccount}
                              onChange={(e) => { setSearchAccount(e.target.value); handleSearchTransactions(searchQuery, e.target.value); }}
                              className={`w-full text-xs px-2.5 py-1.5 rounded-[6px] border outline-none ${
                                isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                              }`}
                            >
                              <option value="">All Other Accounts</option>
                              {accounts.filter(a => a.id !== transaction.account_id).map(a => (
                                <option key={a.id} value={a.id}>{a.name} ({a.subtype})</option>
                              ))}
                            </select>

                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                placeholder="Search by description, UTR, ref..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSearchTransactions(); }}
                                className={`flex-1 text-xs px-2.5 py-1.5 rounded-[6px] border outline-none ${
                                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                                }`}
                              />
                              <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => handleSearchTransactions()}
                                disabled={loadingSearch}
                              >
                                <Search className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          {/* Results list */}
                          <div className="max-h-48 overflow-y-auto space-y-1.5 pt-1">
                            {loadingSearch ? (
                              <div className="py-4 text-center text-xs text-[#8B978F] flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-[#3F8F5E]" />
                                <span>Loading...</span>
                              </div>
                            ) : searchResults.length === 0 ? (
                              <div className="py-4 text-center text-[11px] text-[#8B978F]">
                                No unlinked counterpart transactions found.
                              </div>
                            ) : (
                              searchResults.map(res => (
                                <div
                                  key={res.transaction_id}
                                  className={`p-2 rounded-[6px] border text-xs flex items-center justify-between gap-2 ${
                                    isDark ? 'bg-[#18231C] border-[#2A352D]' : 'bg-[#F9FCFA] border-[#E4E8E3]'
                                  }`}
                                >
                                  <div className="truncate flex-1">
                                    <div className="font-semibold text-[11px] truncate">{res.account_name}</div>
                                    <div className={`text-[10px] truncate ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                                      {res.description}
                                    </div>
                                    <div className="text-[9px] text-[#8B978F]">{formatDate(res.date)}</div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="tabular-nums font-bold text-[11px]">
                                      {formatCurrency(Math.abs(res.amount))}
                                    </div>
                                    <Button
                                      variant="brown"
                                      size="xs"
                                      disabled={actionLoading}
                                      onClick={() => handleLinkTransactions(res.transaction_id)}
                                      className="mt-1"
                                    >
                                      Link
                                    </Button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Metadata Grid */}
            <div>
              <h3 className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                Details
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Category</span>
                  <Badge variant={isIncome ? 'positive' : 'brown'}>
                    {transaction.category || 'General'}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Account</span>
                  <span className="font-semibold">{transaction.account_name || 'Primary Account'}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Payment Rail</span>
                  <span className="font-mono text-[11px]">{transaction.payment_rail || 'UPI / Card'}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Merchant</span>
                  <span className="font-medium">{transaction.merchant || '—'}</span>
                </div>

                {transaction.reference && (
                  <div className="flex items-center justify-between text-xs">
                    <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Reference</span>
                    <span className="font-mono text-[11px] select-all">{transaction.reference}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Financial Event Classification */}
            <div className={`p-4 rounded-[12px] border ${
              isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                  Financial Event
                </span>
                <Badge variant={isIncome ? 'positive' : isTransfer ? 'neutral' : 'brown'} size="xs">
                  {isIncome ? 'INCOME' : isTransfer ? 'TRANSFER' : 'PURCHASE'}
                </Badge>
              </div>
              <p className={`text-xs ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
                {isIncome
                  ? 'Inflow credited to your balance. Verified economic benefit.'
                  : isTransfer
                    ? 'Internal movement between accounts. Economic impact is net ₹0.'
                    : 'Outflow recognized as operating expenditure in category analysis.'}
              </p>
            </div>

            {/* Deterministic Evidence Section */}
            <div className={`p-4 rounded-[12px] border ${
              isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#F1F8F4] border-[#C6E4D2]'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-[#3F8F5E]" />
                <span className={`text-xs font-bold ${isDark ? 'text-[#7FC39A]' : 'text-[#285A3A]'}`}>
                  Deterministic Evidence
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Source Statement</span>
                  <span className="font-medium">{transaction.statement_name || 'Bank Statement (PDF)'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className={isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}>Reconciliation</span>
                  <span className="text-[#3F8F5E] font-semibold">✓ Verified Matched</span>
                </div>

                {transaction.raw_text && (
                  <div className="mt-2 pt-2 border-t border-[#2A352D]/20">
                    <span className={`text-[10px] uppercase font-bold tracking-wider block mb-1 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                      Raw Line in Statement
                    </span>
                    <pre className="text-[10px] font-mono p-2 rounded bg-black/10 overflow-x-auto whitespace-pre-wrap">
                      {transaction.raw_text}
                    </pre>
                  </div>
                )}
              </div>

              {onViewSource && (
                <button
                  type="button"
                  onClick={() => onViewSource(transaction)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-[8px] text-xs font-semibold text-[#3F8F5E] hover:underline cursor-pointer border-0 bg-transparent"
                >
                  <span>View in source documents</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className={`p-4 border-t flex items-center justify-between gap-3 ${
            isDark ? 'border-[#2A352D]' : 'border-[#E4E8E3]'
          }`}>
            <Button variant="secondary" size="sm" onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
