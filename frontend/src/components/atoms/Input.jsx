import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const Input = ({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  required = false,
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
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={`rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#5EEAD4]/40 border-0 transition-all ${style(
          'neu-inset-dark text-[#F4F7FA]',
          'neu-inset-light text-[#17202A]'
        )} disabled:opacity-50 ${className}`}
        {...props}
      />
    </div>
  );
};
