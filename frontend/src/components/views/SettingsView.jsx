import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { NetworkLogo } from '../atoms/NetworkLogo';
import { EditCardModal } from '../organisms/EditCardModal';
import { AddAccountModal } from '../organisms/AddAccountModal';
import { AddCardModal } from '../organisms/AddCardModal';
import { EditCategoryModal } from '../organisms/EditCategoryModal';
import { TelemetryTerminal } from '../organisms/TelemetryTerminal';
import { formatCurrency } from '../../utils/formatters';
import { 
  Settings as SettingsIcon, 
  Moon, 
  Sun, 
  Landmark, 
  Plus, 
  Trash2, 
  Pencil, 
  AlertTriangle, 
  CreditCard,
  PlusCircle,
  Tag
} from 'lucide-react';

export const SettingsView = () => {
  const { theme, setTheme, style } = useTheme();
  const { 
    cards, 
    rules, 
    categories, 
    accounts, 
    transactions,
    addRule, 
    deleteRule, 
    fetchData,
    setTransactions 
  } = useFinance();

  // Modals state
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);
  const [cardToEdit, setCardToEdit] = useState(null);
  const [categoryToEdit, setCategoryToEdit] = useState(null);
  const [isPurging, setIsPurging] = useState(false);
  const { toast, confirm } = useToast();

  // Categories Local States
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState('');

  // Form states for rule engine
  const [ruleKeyword, setRuleKeyword] = useState('');
  const [ruleCategory, setRuleCategory] = useState(categories[0]?.name || 'Dining');

  useEffect(() => {
    if (categories.length > 0 && !categories.find(c => c.name === ruleCategory)) {
      setRuleCategory(categories[0]?.name);
    }
  }, [categories, ruleCategory]);

  const accountsByBank = useMemo(() => {
    const groups = [];
    const index = new Map();
    for (const acc of accounts) {
      const key = acc.bank?.name || 'Other';
      if (!index.has(key)) {
        index.set(key, groups.length);
        groups.push({ bank: key, items: [] });
      }
      groups[index.get(key)].items.push(acc);
    }
    return groups;
  }, [accounts]);

  // Handle Add Category
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setCategoryLoading(true);
    setCategoryError('');

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim() })
      });

      if (res.ok) {
        toast.success(`Category '${newCategoryName.trim()}' added.`);
        setNewCategoryName('');
        await fetchData();
      } else {
        const data = await res.json();
        setCategoryError(data.detail || 'Failed to create category.');
        toast.error(data.detail || 'Failed to create category.', 'Category Error');
      }
    } catch (err) {
      setCategoryError('Network error while creating category.');
      toast.error('Network error while creating category.', 'Connection Error');
    } finally {
      setCategoryLoading(false);
    }
  };

  // Handle Delete Category
  const handleDeleteCategory = async (cat) => {
    if (cat.name.toLowerCase() === 'others') {
      toast.warning("The default 'Others' category cannot be deleted.", 'Protected Category');
      return;
    }

    const isConfirmed = await confirm({
      title: 'Delete Category',
      message: `Are you sure you want to delete '${cat.name}'? Existing transactions will be reassigned to 'Others'.`,
      confirmText: 'Delete Category',
      isDanger: true
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`Category '${cat.name}' deleted.`);
        await fetchData();
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Failed to delete category.', 'Delete Error');
      }
    } catch (err) {
      console.error("Error deleting category:", err);
      toast.error('Failed to delete category due to network error.', 'Error');
    }
  };

  const handleCreateRule = (e) => {
    e.preventDefault();
    if (!ruleKeyword.trim()) return;
    addRule(ruleKeyword, ruleCategory);
    toast.success(`Rule created: "${ruleKeyword.trim()}" ➔ ${ruleCategory}`);
    setRuleKeyword('');
  };

  const handleDeleteCard = async (cardId, cardName) => {
    const isConfirmed = await confirm({
      title: 'Delete Credit Card',
      message: `Are you sure you want to delete card '${cardName}'?`,
      confirmText: 'Delete Card',
      isDanger: true
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/cards/${cardId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`Card '${cardName}' deleted.`);
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to delete card.', 'Delete Error');
      }
    } catch (err) {
      console.error("Error deleting card:", err);
      toast.error('Connection error while deleting card.', 'Error');
    }
  };

  const handleDeleteAccount = async (accountId, accountName) => {
    const isConfirmed = await confirm({
      title: 'Delete Account',
      message: `Are you sure you want to delete account '${accountName}'? All associated transactions will be removed.`,
      confirmText: 'Delete Account',
      isDanger: true
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`Account '${accountName}' deleted.`);
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to delete account.', 'Delete Error');
      }
    } catch (err) {
      console.error("Error deleting account:", err);
      toast.error('Connection error while deleting account.', 'Error');
    }
  };

  const handlePurgeAll = async () => {
    const isConfirmed = await confirm({
      title: 'Reset & Purge All Transactions',
      message: 'Are you sure you want to purge all transaction logs? This resets all balances to ₹0.00 and cannot be undone.',
      confirmText: 'Purge Everything',
      isDanger: true
    });

    if (!isConfirmed) return;

    setIsPurging(true);
    try {
      const res = await fetch('/api/transactions/purge', { method: 'DELETE' });
      if (res.ok) {
        setTransactions([]);
        await fetchData();
        toast.success('All transactions purged successfully.', 'Database Reset');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to purge transactions.', 'Error');
      }
    } catch (err) {
      console.error("Error purging transactions:", err);
      toast.error('Network connection error while purging data.', 'Error');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 max-w-5xl mx-auto pb-16">
      
      <div className="flex items-center gap-2">
        <SettingsIcon className={`h-5 w-5 ${style('text-[#FF7E67]', 'text-[#4A90E2]')}`} />
        <h2 className="text-base font-bold">System Configuration & Preferences</h2>
      </div>

      {/* 1. Theme & Appearance */}
      <div className={`p-6 rounded-2xl border-0 flex flex-col gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Appearance & Design System
        </h3>

        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-bold">Neumorphic Interface Theme</span>
            <span className="text-xs text-slate-400 font-normal">Toggle between Dark and Light neumorphic aesthetics</span>
          </div>

          <div className={`flex items-center p-1 rounded-xl gap-1 ${style('neu-inset-dark', 'neu-inset-light')}`}>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer ${
                theme === 'dark'
                  ? style('neu-flat-dark text-amber-400', 'bg-slate-800 text-white')
                  : 'text-slate-400'
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              Dark
            </button>
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer ${
                theme === 'light'
                  ? style('neu-flat-light text-indigo-600', 'bg-white text-black')
                  : 'text-slate-400'
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              Light
            </button>
          </div>
        </div>
      </div>

      {/* 2. Connected Bank Accounts Management */}
      <div className={`p-6 rounded-2xl border-0 flex flex-col gap-5 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${style('text-slate-200', 'text-slate-700')}`}>
                Connected Bank Accounts ({accounts.length})
              </h3>
              <span className="text-xs text-slate-400 font-normal">
                Manage your liquid savings, current, and depository accounts
              </span>
            </div>
          </div>
          <Button 
            variant="primary" 
            size="sm" 
            onClick={() => setIsAddAccountOpen(true)}
            icon={PlusCircle}
          >
            Add Bank Account
          </Button>
        </div>

        {accounts.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 italic">
            No bank accounts added yet. Click &quot;Add Bank Account&quot; to link an account.
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {accountsByBank.map(group => (
              <div key={group.bank} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {group.bank}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${style('bg-slate-800/50 text-slate-500', 'bg-slate-200 text-slate-500')}`}>
                    {group.items.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {group.items.map(acc => {
                    const bal = parseFloat(acc.balance || 0);
                    const isLiability = String(acc.classification || '').toUpperCase() === 'LIABILITY' || bal < 0;

                    return (
                      <div
                        key={acc.id}
                        className={`p-4 rounded-2xl flex items-center gap-3 min-w-0 border-0 ${style('neu-inset-dark', 'neu-inset-light')}`}
                      >
                        <div className={`p-2.5 rounded-xl shrink-0 ${style('bg-[#181828] text-slate-400', 'bg-white text-slate-500')}`}>
                          <Landmark className="h-4 w-4" />
                        </div>

                        <div className="flex flex-col min-w-0 flex-1 gap-1.5">
                          <span className={`text-sm font-semibold truncate ${style('text-slate-100', 'text-slate-800')}`} title={acc.name}>
                            {acc.name}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${style('bg-indigo-500/10 text-indigo-300', 'bg-indigo-100 text-indigo-600')}`}>
                              {acc.subtype || 'Account'}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                              isLiability
                                ? 'bg-red-500/10 text-red-400'
                                : 'bg-emerald-500/10 text-emerald-400'
                            }`}>
                              {acc.classification || (isLiability ? 'Liability' : 'Asset')}
                            </span>
                          </div>
                        </div>

                        <span className={`text-sm font-bold tabular-nums shrink-0 ${isLiability ? 'text-red-400' : 'text-emerald-400'}`}>
                          {formatCurrency(bal)}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleDeleteAccount(acc.id, acc.name)}
                          className={`p-2 rounded-xl shrink-0 border-0 cursor-pointer transition-colors ${style('text-slate-500 hover:text-red-400 hover:bg-red-500/10', 'text-slate-400 hover:text-red-500 hover:bg-red-50')}`}
                          title="Delete Account"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Registered Credit Cards Management */}
      <div className={`p-6 rounded-2xl border-0 flex flex-col gap-5 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-indigo-400" />
            <div>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${style('text-slate-200', 'text-slate-700')}`}>
                Registered Credit Cards ({cards.length})
              </h3>
              <span className="text-xs text-slate-400 font-normal">
                Manage billing statements, reward currencies & spend caps
              </span>
            </div>
          </div>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => setIsAddCardOpen(true)}
            icon={PlusCircle}
          >
            Register Card
          </Button>
        </div>

        {cards.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 italic">
            No credit cards registered yet. Click &quot;Register Card&quot; to add a new card.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {cards.map(card => (
              <div 
                key={card.id}
                className={`p-3.5 px-4 rounded-xl flex items-center justify-between border-0 ${style('neu-inset-dark', 'neu-inset-light')}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <NetworkLogo network={card.network} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold truncate">{card.card_name}</span>
                    <span className="text-xs text-slate-400 font-normal">
                      Statement Day: <strong className={style('text-slate-200', 'text-slate-700')}>{card.statement_date}</strong> • Credit Limit: <strong className={style('text-slate-200', 'text-slate-700')}>{formatCurrency(card.monthly_cap || 100000, false)}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCardToEdit(card)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-0 bg-transparent cursor-pointer transition-colors"
                    title="Edit Card"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCard(card.id, card.card_name)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 border-0 bg-transparent cursor-pointer transition-colors"
                    title="Delete Card"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Spend Categories Management */}
      <div className={`p-6 rounded-2xl border-0 flex flex-col gap-5 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-amber-400" />
            <div>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${style('text-slate-200', 'text-slate-700')}`}>
                Spend Categories ({categories.length})
              </h3>
              <span className="text-xs text-slate-400 font-normal">
                Add, rename, and manage classification categories across transactions
              </span>
            </div>
          </div>
        </div>

        {/* Add Category Form */}
        <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row gap-3 items-center">
          <input
            type="text"
            placeholder="New Category Name (e.g. Healthcare, Education, Travel)"
            value={newCategoryName}
            onChange={e => setNewCategoryName(e.target.value)}
            disabled={categoryLoading}
            className={`w-full sm:flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
          />

          <Button type="submit" variant="primary" size="sm" loading={categoryLoading} icon={Plus}>
            Add Category
          </Button>
        </form>

        {categoryError && (
          <div className="p-3 rounded-xl bg-red-950/20 text-red-400 text-xs border border-red-500/20 font-medium">
            {categoryError}
          </div>
        )}

        {/* Category List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
          {categories.map(cat => {
            const count = transactions.filter(t => t.category === cat.name).length;
            const isOthers = cat.name.toLowerCase() === 'others';

            return (
              <div 
                key={cat.id}
                className={`p-2.5 px-3 rounded-xl flex items-center justify-between border-0 transition-all ${style('neu-inset-dark', 'neu-inset-light')}`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-xs font-bold truncate">
                    {cat.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold px-1.5 py-0.5 rounded-md bg-slate-800/30">
                    {count} txs
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCategoryToEdit(cat)}
                    className="p-1 rounded-lg text-slate-400 hover:text-amber-300 border-0 bg-transparent cursor-pointer transition-colors"
                    title="Rename Category"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  {!isOthers && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat)}
                      className="p-1 rounded-lg text-slate-400 hover:text-red-400 border-0 bg-transparent cursor-pointer transition-colors"
                      title="Delete Category"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Category Override Rules Engine */}
      <div className={`p-6 rounded-2xl border-0 flex flex-col gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Category Override Rules ({rules.length})
        </h3>
        <p className="text-xs text-slate-400 font-normal">
          Transactions matching these keywords will be automatically assigned to the designated category.
        </p>

        {/* Add Rule Form */}
        <form onSubmit={handleCreateRule} className="flex flex-col sm:flex-row gap-3 items-center">
          <input
            type="text"
            placeholder="Keyword (e.g. UBER, ZOMATO, NETFLIX)"
            value={ruleKeyword}
            onChange={e => setRuleKeyword(e.target.value)}
            className={`w-full sm:w-1/2 rounded-xl px-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
          />

          <select
            value={ruleCategory}
            onChange={e => setRuleCategory(e.target.value)}
            className={`w-full sm:w-1/3 rounded-xl px-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
          >
            {categories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          <Button type="submit" variant="primary" size="sm" icon={Plus}>
            Add Rule
          </Button>
        </form>

        {/* Rules List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
          {rules.map(rule => (
            <div 
              key={rule.id}
              className={`p-2.5 px-3 rounded-xl flex items-center justify-between border-0 ${style('neu-inset-dark', 'neu-inset-light')}`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono font-bold ${style('text-slate-200', 'text-slate-700')}`}>
                  {rule.keyword}
                </span>
                <span className="text-xs text-slate-400">&rarr;</span>
                <span className="text-xs font-semibold text-emerald-400">
                  {rule.category}
                </span>
              </div>

              <button
                type="button"
                onClick={() => deleteRule(rule.id)}
                className="text-slate-400 hover:text-red-400 border-0 bg-transparent cursor-pointer p-1"
                title="Delete Rule"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 6. System & Telemetry Live Logs */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Backend System & AI Telemetry Logs
        </h3>
        <TelemetryTerminal title="Backend System Live Logs" endpoint="/api/backend/logs" isCollapsible={true} defaultExpanded={true} />
      </div>

      {/* 7. Danger Zone / Data Management */}
      <div className={`p-6 rounded-2xl border border-red-500/20 bg-red-950/10 flex flex-col gap-4 transition-all`}>
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="h-4 w-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">
            Danger Zone
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className={`text-xs font-bold ${style('text-slate-100', 'text-slate-800')}`}>
              Purge All Transaction Data
            </span>
            <span className="text-xs text-slate-400 font-normal">
              Permanently deletes all parsed statements and transactions, resetting all balances to ₹0.00.
            </span>
          </div>

          <Button
            variant="danger"
            onClick={handlePurgeAll}
            loading={isPurging}
            icon={Trash2}
          >
            Purge All Data
          </Button>
        </div>
      </div>

      {/* Add Bank Account Modal */}
      <AddAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
      />

      {/* Register Credit Card Modal */}
      <AddCardModal
        isOpen={isAddCardOpen}
        onClose={() => setIsAddCardOpen(false)}
      />

      {/* Edit Credit Card Modal */}
      <EditCardModal
        isOpen={!!cardToEdit}
        onClose={() => setCardToEdit(null)}
        card={cardToEdit}
      />

      {/* Edit Category Modal */}
      <EditCategoryModal
        isOpen={!!categoryToEdit}
        onClose={() => setCategoryToEdit(null)}
        category={categoryToEdit}
      />

    </div>
  );
};
