import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../atoms/Button';
import { CreditCard, X } from 'lucide-react';
import { extractErrorMessage } from '../../utils/formatters';

export const EditCardModal = ({ isOpen, onClose, card }) => {
  const { theme } = useTheme();
  const { banks, accounts, fetchData, authFetch } = useFinance();
  const { toast } = useToast();
  const isDark = theme === 'dark';

  const [cardName, setCardName] = useState('');
  const [bankId, setBankId] = useState('');
  const [network, setNetwork] = useState('Visa');
  const [rewardCurrency, setRewardCurrency] = useState('Reward Points');
  const [creditLimit, setCreditLimit] = useState('0');
  const [statementDate, setStatementDate] = useState('1');
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (card) {
      setCardName(card.name || card.card_name || '');
      setBankId(card.bank_id || banks[0]?.id || '');
      setNetwork(card.network || 'Visa');
      setRewardCurrency(card.reward_currency || 'Reward Points');
      setCreditLimit(card.credit_limit ? String(card.credit_limit) : '0');
      setStatementDate(card.statement_date ? String(card.statement_date) : '1');
      setAccountId(card.account_id || '');
      setError('');
    }
  }, [card, banks]);

  if (!isOpen || !card) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cardName.trim()) {
      setError('Card name cannot be empty.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await authFetch(`/api/cards/${card.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_name: cardName.trim(),
          bank_id: bankId || banks[0]?.id,
          network: network,
          reward_currency: rewardCurrency,
          credit_limit: creditLimit ? parseFloat(creditLimit) : 0,
          statement_date: parseInt(statementDate) || 1,
          is_active: true,
          account_id: accountId || null
        })
      });

      if (res.ok) {
        toast?.success?.(`Card '${cardName.trim()}' updated successfully.`);
        await fetchData();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(extractErrorMessage(data.detail, 'Failed to update card.'));
      }
    } catch (err) {
      console.error('Failed to update card:', err);
      setError('Network error while updating card.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className={`relative w-full max-w-md rounded-[16px] p-6 border shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 ${
        isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-[#E4E8E3]/20 mb-4">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-[8px] ${
              isDark ? 'bg-[#1C251F] text-[#7FC39A]' : 'bg-[#F1F8F4] text-[#3F8F5E]'
            }`}>
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Edit Credit Card</h3>
              <p className="text-[11px] text-[#8B978F]">Update limit and billing parameters</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#8B978F] hover:text-foreground border-0 bg-transparent cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-[8px] text-xs bg-[#FBEAEA] text-[#C85C5C] font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold block mb-1">Card Name</label>
            <input
              type="text"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              className={`w-full px-3 py-2 text-xs rounded-[10px] border outline-none ${
                isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
              }`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">Bank</label>
              <select
                value={bankId}
                onChange={(e) => setBankId(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-[10px] border outline-none cursor-pointer ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              >
                {banks.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold block mb-1">Network</label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-[10px] border outline-none cursor-pointer ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              >
                <option value="Visa">Visa</option>
                <option value="Mastercard">Mastercard</option>
                <option value="RuPay">RuPay</option>
                <option value="Amex">American Express</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">Credit Limit (₹)</label>
              <input
                type="number"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-[10px] border outline-none ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              />
            </div>

            <div>
              <label className="font-semibold block mb-1">Statement Day (1-31)</label>
              <input
                type="number"
                min="1"
                max="31"
                value={statementDate}
                onChange={(e) => setStatementDate(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-[10px] border outline-none ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">Reward Currency</label>
              <select
                value={rewardCurrency}
                onChange={(e) => setRewardCurrency(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-[10px] border outline-none cursor-pointer ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              >
                <option value="Reward Points">Reward Points</option>
                <option value="Cashback">Cashback</option>
                <option value="Miles">Miles</option>
              </select>
            </div>

            <div>
              <label className="font-semibold block mb-1">Linked Account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-[10px] border outline-none cursor-pointer ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              >
                <option value="">None / Unlinked</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.subtype || a.classification})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E4E8E3]/20 flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={loading}>
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
