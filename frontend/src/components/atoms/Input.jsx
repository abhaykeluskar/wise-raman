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
  icon: Icon,
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
      <div className="relative flex items-center w-full">
        {Icon && (
          <div className="absolute left-3 flex items-center pointer-events-none text-[#8B978F]">
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`w-full rounded-[10px] py-2 text-xs transition-all border-none outline-none disabled:opacity-50 ${
            Icon ? 'pl-9 pr-3' : 'px-3'
          } ${
            isDark
              ? 'bg-[#171E19] text-[#F1F5F2] border-[#2A352D] placeholder-[#5E6962] focus:border-[#5BAE78] focus:ring-1 focus:ring-[#5BAE78]/30'
              : 'bg-[#FFFFFF] text-[#1D2822] border-[#E4E8E3] placeholder-[#A8B0AA] focus:border-[#5BAE78] focus:ring-1 focus:ring-[#5BAE78]/30 shadow-xs'
          } ${className}`}
          {...props}
        />
      </div>
    </div>
  );
};
