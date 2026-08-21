import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Tag, X, Check } from 'lucide-react';

export const EditCategoryModal = ({ isOpen, onClose, category }) => {
  const { style } = useTheme();
  const { fetchData } = useFinance();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (category) {
      setName(category.name || '');
      setError('');
    }
  }, [category]);

  if (!isOpen || !category) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Category name cannot be empty.');
      return;
    }

    if (cleanName.toLowerCase() === category.name.toLowerCase()) {
      onClose();
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName })
      });

      if (res.ok) {
        await fetchData();
        onClose();
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to update category.');
      }
    } catch (err) {
      setError('Network error while updating category.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className={`w-full max-w-sm p-6 rounded-2xl flex flex-col gap-4 border-0 shadow-2xl transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-3 border-slate-800/10">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${style('neu-inset-dark text-amber-400', 'neu-inset-light text-amber-600')}`}>
              <Tag className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                Edit Category
              </h3>
              <span className="text-xs text-slate-400 font-normal">
                Rename category across all transactions
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

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-xl bg-red-950/20 text-red-400 text-xs border border-red-500/20 font-medium">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Category Name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Dining, Utilities, Travel"
            required
            autoFocus
          />

          <div className="flex items-center justify-end gap-3 mt-1 pt-3 border-t border-slate-800/10">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading} icon={Check}>
              Save Changes
            </Button>
          </div>
        </form>

      </div>
    </div>
  );
};
