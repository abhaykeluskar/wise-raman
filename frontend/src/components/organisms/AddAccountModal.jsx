import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';
import { Landmark, X, PlusCircle, CheckCircle2 } from 'lucide-react';

export const AddAccountModal = ({ isOpen, onClose }) => {
  const { style } = useTheme();
  const { banks, fetchData , authFetch} = useFinance();

  const [name, setName] = useState('');
  const [bankId, setBankId] = useState(banks[0]?.id || '');
  const [accountType, setAccountType] = useState('Savings');
  const [balance, setBalance] = useState('0.00');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Update default bank if banks load late
  React.useEffect(() => {
    if (!bankId && banks.length > 0) {
      setBankId(banks[0].id);
    }
  }, [banks, bankId]);

  const handleClose = () => {
    setName('');
    setBalance('0.00');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide an account name.');
      return;
    }
    if (!bankId) {
      setError('Please select a bank.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await authFetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          bank_id: bankId,
          account_type: accountType,
          balance: parseFloat(balance) || 0.0
        })
      });

      if (res.ok) {
        await fetchData();
        handleClose();
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to create account.');
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
            <div className={`p-2 rounded-xl ${style('neu-inset-dark text-[#5EEAD4]', 'neu-inset-light text-[#0F766E]')}`}>
              <Landmark className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                Add Bank Account
              </h3>
              <span className="text-xs text-slate-400 font-normal">
                Register a new savings, current or loan account
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
            label="Account Display Name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. HDFC Salary Savings"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Bank / Financial Institution"
              value={bankId}
              onChange={e => setBankId(e.target.value)}
              required
            >
              {banks.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>

            <Select
              label="Account Subtype"
              value={accountType}
              onChange={e => setAccountType(e.target.value)}
            >
              <option value="Savings">Savings Account</option>
              <option value="Current">Current Account</option>
              <option value="Loan">Loan / Overdraft</option>
            </Select>
          </div>

          <Input
            label="Starting Balance (₹)"
            type="number"
            step="0.01"
            value={balance}
            onChange={e => setBalance(e.target.value)}
            placeholder="0.00"
          />

          <div className="flex items-center justify-end gap-3 mt-2 pt-3 border-t border-slate-800/10">
            <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading} icon={PlusCircle}>
              Create Account
            </Button>
          </div>

        </form>

      </div>
    </div>
  );
};
