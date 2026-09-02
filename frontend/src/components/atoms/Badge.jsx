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
        return style('bg-emerald-500/15 text-emerald-400 border border-emerald-500/30', 'bg-emerald-600/15 text-emerald-700 border border-emerald-600/30');
      case 'danger':
        return style('bg-red-500/15 text-red-400 border border-red-500/30', 'bg-red-600/15 text-red-700 border border-red-600/30');
      case 'warning':
        return style('bg-amber-500/15 text-amber-400 border border-amber-500/30', 'bg-amber-600/15 text-amber-700 border border-amber-600/30');
      case 'brand':
      case 'accent':
      case 'mint':
        return style('bg-[#5EEAD4]/15 text-[#5EEAD4] border border-[#5EEAD4]/30', 'bg-[#0F766E]/15 text-[#0F766E] border border-[#0F766E]/30');
      case 'ai':
      case 'violet':
        return style('bg-[#A78BFA]/15 text-[#A78BFA] border border-[#A78BFA]/30', 'bg-[#7C3AED]/15 text-[#7C3AED] border border-[#7C3AED]/30');
      case 'primary':
        return style('bg-indigo-500/15 text-indigo-300 border border-indigo-500/30', 'bg-indigo-100 text-indigo-700 border border-indigo-200');
      case 'neutral':
        return style('bg-slate-800/50 text-slate-300 border border-slate-700/50', 'bg-slate-200 text-slate-700 border border-slate-300');
      default:
        return style('bg-slate-800/40 text-slate-300 border border-slate-700/40', 'bg-slate-200 text-slate-700');
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider ${getVariantStyles()} ${className}`}>
      {children}
    </span>
  );
};
