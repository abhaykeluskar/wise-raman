import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../atoms/Button';
import { Select } from '../atoms/Select';
import { Input } from '../atoms/Input';
import { CreditCard, X, Check } from 'lucide-react';

export const EditCardModal = ({ isOpen, onClose, card }) => {
  const { style } = useTheme();
  const { banks, accounts, fetchData } = useFinance();
  const { toast } = useToast();

  const [cardName, setCardName] = useState('');
  const [bankId, setBankId] = useState('');
  const [network, setNetwork] = useState('Visa');
  const [rewardCurrency, setRewardCurrency] = useState('Cashback');
  const [monthlyCap, setMonthlyCap] = useState('');
  const [statementDate, setStatementDate] = useState('1');
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (card) {
      setCardName(card.card_name || '');
      setBankId(card.bank_id || banks[0]?.id || '');
      setNetwork(card.network || 'Visa');
      setRewardCurrency(card.reward_currency || 'Cashback');
      setMonthlyCap(card.monthly_cap ? String(card.monthly_cap) : '');
      setStatementDate(card.statement_date ? String(card.statement_date) : '1');
      setAccountId(card.account_id || '');
    }
  }, [card, banks]);

  if (!isOpen || !card) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cardName.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_name: cardName.trim(),
          bank_id: bankId || banks[0]?.id,
          network: network,
          reward_currency: rewardCurrency,
          monthly_cap: monthlyCap ? parseFloat(monthlyCap) : null,
          statement_date: parseInt(statementDate) || 1,
          is_active: true,
          account_id: accountId || null
        })
      });

      if (res.ok) {
        toast.success(`Card '${cardName.trim()}' updated successfully.`);
        await fetchData();
        onClose();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to update card configuration.', 'Update Failed');
      }
    } catch (err) {
      console.error("Error saving card edits:", err);
      toast.error('Failed to update card due to connection error.', 'Network Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className={`w-full max-w-lg p-6 rounded-2xl flex flex-col gap-4 border-0 shadow-2xl transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-3 border-slate-800/10">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${style('neu-inset-dark text-[#FF7E67]', 'neu-inset-light text-[#4A90E2]')}`}>
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                Edit Credit Card Details
              </h3>
              <span className="text-xs text-slate-400 font-normal">
                Update rewards structure, billing day & capping limits
              </span>
            </div>
          </div>

          <button 
            type="button" 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-xl border-0 bg-transparent cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          
          <Input
            label="Card Display Name"
            value={cardName}
            onChange={e => setCardName(e.target.value)}
            placeholder="e.g. SBI Cashback Card"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Bank / Issuer"
              value={bankId}
              onChange={e => setBankId(e.target.value)}
            >
              {banks.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>

            <Select
              label="Payment Network"
              value={network}
              onChange={e => setNetwork(e.target.value)}
            >
              <option value="Visa">Visa</option>
              <option value="Mastercard">Mastercard</option>
              <option value="RuPay">RuPay</option>
              <option value="Amex">American Express</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Total Credit Limit (₹)"
              type="number"
              value={monthlyCap}
              onChange={e => setMonthlyCap(e.target.value)}
              placeholder="e.g. 500000"
              required
            />

            <Input
              label="Statement Billing Day (1 - 31)"
              type="number"
              min="1"
              max="31"
              value={statementDate}
              onChange={e => setStatementDate(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Select
              label="Linked Liability Account"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
            >
              <option value="">Auto-link / Default</option>
              {accounts.filter(a => a.subtype === 'CREDIT_CARD').map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.bank?.name})</option>
              ))}
            </Select>
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-3 mt-3 border-t pt-3 border-slate-800/10">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              icon={Check}
            >
              Save Changes
            </Button>
          </div>

        </form>

      </div>
    </div>
  );
};
