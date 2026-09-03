import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Search, X } from 'lucide-react';

export const SearchField = ({
  value,
  onChange,
  onClear,
  placeholder = 'Search merchant, description, reference...',
  className = '',
  autoFocus = false
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className={`relative flex items-center w-full ${className}`}>
      <Search className={`absolute left-3.5 h-4 w-4 pointer-events-none ${
        isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
      }`} />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`w-full pl-10 pr-9 py-2 text-xs rounded-[10px] transition-all border outline-none ${
          isDark
            ? 'bg-[#171E19] text-[#F1F5F2] border-[#2A352D] placeholder-[#5E6962] focus:border-[#5BAE78] focus:ring-1 focus:ring-[#5BAE78]/30'
            : 'bg-[#FFFFFF] text-[#1D2822] border-[#E4E8E3] placeholder-[#A8B0AA] focus:border-[#5BAE78] focus:ring-1 focus:ring-[#5BAE78]/30 shadow-xs'
        }`}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className={`absolute right-2.5 p-1 rounded-full border-0 bg-transparent cursor-pointer transition-colors ${
            isDark ? 'text-[#8B978F] hover:text-[#F1F5F2]' : 'text-[#7B877F] hover:text-[#1D2822]'
          }`}
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};
