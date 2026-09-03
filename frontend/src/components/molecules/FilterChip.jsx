import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Check, ChevronDown } from 'lucide-react';

export const FilterChip = ({
  label,
  value,
  active = false,
  onClick,
  onClear,
  hasDropdown = false,
  className = ''
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border cursor-pointer select-none ${
        active
          ? isDark
            ? 'bg-[rgba(91,174,120,0.2)] text-[#7FC39A] border-[#5BAE78]/50'
            : 'bg-[#E2F1E8] text-[#285A3A] border-[#A5D5B9]'
          : isDark
            ? 'bg-[#171E19] text-[#C2CCC5] border-[#2A352D] hover:bg-[#1C251F] hover:text-[#F1F5F2]'
            : 'bg-[#FFFFFF] text-[#4F5D55] border-[#E4E8E3] hover:bg-[#F1F8F4] hover:text-[#1D2822] shadow-xs'
      } ${className}`}
    >
      <span>{label}</span>
      {value && value !== 'ALL' && (
        <span className={`font-semibold ${active ? (isDark ? 'text-white' : 'text-[#1D2822]') : ''}`}>
          : {value}
        </span>
      )}
      {hasDropdown && (
        <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
      )}
    </button>
  );
};
