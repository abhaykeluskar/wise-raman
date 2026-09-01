import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';
import { CreditCard, X, PlusCircle } from 'lucide-react';

export const AddCardModal = ({ isOpen, onClose }) => {
  const { style } = useTheme();
  const { banks, accounts, fetchData , authFetch} = useFinance();

  const [cardName, setCardName] = useState('');
  const [bankId, setBankId] = useState(banks[0]?.id || '');
  const [network, setNetwork] = useState('Visa');
  const [rewardCurrency, setRewardCurrency] = useState('Cashback');
  const [monthlyCap, setMonthlyCap] = useState('');
  const [statementDate, setStatementDate] = useState('1');
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (!bankId && banks.length > 0) {
      setBankId(banks[0].id);
    }
  }, [banks, bankId]);

  const handleClose = () => {
    setCardName('');
    setMonthlyCap('');
    setAccountId('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cardName.trim()) {
      setError('Please provide a card name.');
      return;
    }
    if (!bankId) {
      setError('Please select a bank.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        card_name: cardName.trim(),
        bank_id: bankId,
        network,
        reward_currency: rewardCurrency,
        monthly_cap: monthlyCap ? parseFloat(monthlyCap) : null,
        statement_date: parseInt(statementDate) || 1,
        account_id: accountId ? accountId : null,
        is_active: true
      };

      const res = await authFetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await fetchData();
        handleClose();
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to register credit card.');
      }
    } catch (err) {
      setError('Network error while connecting to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className={`w-full max-w-md p-6 rounded-2xl flex flex-col gap-4 border-0 shadow-2xl transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-3 border-slate-800/10">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${style('neu-inset-dark text-[#FF7E67]', 'neu-inset-light text-[#4A90E2]')}`}>
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                Register New Credit Card
              </h3>
              <span className="text-xs text-slate-400 font-normal">
                Set billing cycles, network type and reward caps
              </span>
            </div>
          </div>

          <button 
            type="button" 
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-xl border-0 bg-transparent cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-xl bg-red-950/20 text-red-400 text-xs border border-red-500/20">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          
          <Input
            label="Card Name"
            value={cardName}
            onChange={e => setCardName(e.target.value)}
            placeholder="e.g. SBI Cashback Visa"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Bank / Issuer"
              value={bankId}
              onChange={e => setBankId(e.target.value)}
              required
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
              <option value="Diners">Diners Club</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Reward Currency"
              value={rewardCurrency}
              onChange={e => setRewardCurrency(e.target.value)}
            >
              <option value="Cashback">Cashback (₹)</option>
              <option value="Reward Points">Reward Points</option>
              <option value="NeuCoins">NeuCoins</option>
              <option value="Edge Miles">Edge Miles / Travel Miles</option>
            </Select>

            <Input
              label="Statement Billing Day (1-31)"
              type="number"
              min="1"
              max="31"
              value={statementDate}
              onChange={e => setStatementDate(e.target.value)}
              required
            />
          </div>

          <Input
            label="Total Credit Limit (₹)"
            type="number"
            value={monthlyCap}
            onChange={e => setMonthlyCap(e.target.value)}
            placeholder="e.g. 500000"
            required
          />

          <div className="flex items-center justify-end gap-3 mt-2 pt-3 border-t border-slate-800/10">
            <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading} icon={PlusCircle}>
              Register Card
            </Button>
          </div>

        </form>

      </div>
    </div>
  );
};
