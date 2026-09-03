import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const Select = ({
  label,
  value,
  onChange,
  children,
  disabled = false,
  className = '',
  ...props
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <span className={`text-[11px] font-medium tracking-wide ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full rounded-[10px] px-3 py-2 text-xs transition-all border outline-none cursor-pointer disabled:opacity-50 ${
          isDark
            ? 'bg-[#171E19] text-[#F1F5F2] border-[#2A352D] focus:border-[#5BAE78] focus:ring-1 focus:ring-[#5BAE78]/30'
            : 'bg-[#FFFFFF] text-[#1D2822] border-[#E4E8E3] focus:border-[#5BAE78] focus:ring-1 focus:ring-[#5BAE78]/30 shadow-xs'
        } ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
};
