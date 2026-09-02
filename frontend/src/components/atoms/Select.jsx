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
  const { style } = useTheme();

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#5EEAD4]/40 border-0 transition-all cursor-pointer ${style(
          'neu-inset-dark text-[#F4F7FA]',
          'neu-inset-light text-[#17202A]'
        )} disabled:opacity-50 ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
};
