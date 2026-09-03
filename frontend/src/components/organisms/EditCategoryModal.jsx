import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Tag, X, Check } from 'lucide-react';
import { extractErrorMessage } from '../../utils/formatters';

export const EditCategoryModal = ({ isOpen, onClose, category }) => {
  const { theme } = useTheme();
  const { fetchData, authFetch } = useFinance();
  const isDark = theme === 'dark';

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
      const res = await authFetch(`/api/categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName })
      });

      if (res.ok) {
        await fetchData();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(extractErrorMessage(data.detail, 'Failed to update category.'));
      }
    } catch (err) {
      setError('Network error while updating category.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className={`relative w-full max-w-sm p-6 rounded-[16px] border shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150 ${
        isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
      }`}>
        
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-3 border-[#E4E8E3]/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[8px] bg-[#A77B58]/15 text-[#A77B58]">
              <Tag className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold tracking-tight">
                Edit Category
              </h3>
              <span className={`text-[11px] block ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                Rename category across all transactions
              </span>
            </div>
          </div>

          <button 
            type="button" 
            onClick={onClose}
            className={`p-1 rounded-[6px] border-0 bg-transparent cursor-pointer transition-colors ${
              isDark ? 'text-[#8B978F] hover:text-[#F1F5F2]' : 'text-[#7B877F] hover:text-[#1D2822]'
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-2.5 rounded-[8px] bg-[#C85C5C]/15 text-[#C85C5C] text-xs border border-[#C85C5C]/30 font-medium">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            label="Category Name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Dining, Utilities, Travel"
            required
            autoFocus
          />

          <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-[#E4E8E3]/20">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={loading} icon={Check}>
              Save Changes
            </Button>
          </div>
        </form>

      </div>
    </div>
  );
};
