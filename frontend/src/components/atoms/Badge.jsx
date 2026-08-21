import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const Badge = ({ children, variant = 'default', className = '' }) => {
  const { style } = useTheme();

  const getVariantStyles = () => {
    switch (variant) {
      case 'visa':
        return style('bg-blue-600/15 text-blue-400 border border-blue-500/30', 'bg-blue-600 text-white');
      case 'mastercard':
        return style('bg-amber-600/15 text-amber-400 border border-amber-500/30', 'bg-amber-600 text-white');
      case 'rupay':
        return style('bg-emerald-600/15 text-emerald-400 border border-emerald-500/30', 'bg-emerald-600 text-white');
      case 'success':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
      case 'danger':
        return 'bg-red-500/10 text-red-400 border border-red-500/30';
      case 'warning':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
      case 'accent':
        return style('bg-[#FF7E67]/15 text-[#FF7E67] border border-[#FF7E67]/30', 'bg-[#4A90E2]/15 text-[#4A90E2] border border-[#4A90E2]/30');
      default:
        return style('bg-slate-800/40 text-slate-400 border border-slate-700/40', 'bg-slate-200 text-slate-700');
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider ${getVariantStyles()} ${className}`}>
      {children}
    </span>
  );
};
