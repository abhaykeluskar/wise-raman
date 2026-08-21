import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Loader2 } from 'lucide-react';

export const Button = ({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  icon: Icon
}) => {
  const { style } = useTheme();

  const getVariantClasses = () => {
    switch (variant) {
      case 'primary':
        return style(
          'neu-btn-dark text-[#FF7E67] font-bold hover:brightness-110 active:brightness-95',
          'bg-[#FF7E67] text-white',
          'neu-btn-light text-[#4A90E2] font-bold hover:brightness-105 active:brightness-95',
          'bg-[#4A90E2] text-white'
        );
      case 'secondary':
        return style(
          'neu-btn-dark text-slate-300 font-medium',
          'bg-slate-800 text-slate-200',
          'neu-btn-light text-slate-700 font-medium',
          'bg-slate-200 text-slate-700'
        );
      case 'danger':
        return style(
          'neu-btn-dark text-red-400 font-bold hover:text-red-300',
          'bg-red-600 text-white',
          'neu-btn-light text-red-500 font-bold hover:text-red-600',
          'bg-red-500 text-white'
        );
      case 'ghost':
        return 'bg-transparent text-slate-400 hover:text-slate-200 border-0';
      default:
        return style('neu-btn-dark text-slate-300', 'neu-btn-light text-slate-700');
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-3 py-1.5 text-xxs rounded-xl';
      case 'lg':
        return 'px-6 py-3 text-sm rounded-2xl';
      default:
        return 'px-4 py-2 text-xs rounded-xl';
    }
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 transition-all border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${getVariantClasses()} ${getSizeClasses()} ${className}`}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        Icon && <Icon className="h-3.5 w-3.5" />
      )}
      {children}
    </button>
  );
};
