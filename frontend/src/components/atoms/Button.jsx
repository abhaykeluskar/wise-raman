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
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const getVariantClasses = () => {
    switch (variant) {
      case 'primary':
        return 'bg-[#3F8F5E] text-white hover:bg-[#327349] active:bg-[#285A3A] font-semibold shadow-xs';
      case 'brand':
      case 'green':
        return 'bg-[#5BAE78] text-white hover:bg-[#3F8F5E] active:bg-[#327349] font-semibold shadow-xs';
      case 'brown':
      case 'earth':
        return isDark
          ? 'bg-[#875F43] text-white hover:bg-[#694A36] font-semibold'
          : 'bg-[#A77B58] text-white hover:bg-[#875F43] font-semibold';
      case 'secondary':
        return isDark
          ? 'bg-[#1C251F] text-[#F1F5F2] border border-[#2A352D] hover:bg-[#253229]'
          : 'bg-[#FBFCFA] text-[#1D2822] border border-[#E4E8E3] hover:bg-[#F1F8F4] hover:border-[#C6E4D2]';
      case 'tertiary':
      case 'ghost':
        return isDark
          ? 'bg-transparent text-[#C2CCC5] hover:text-[#5BAE78] hover:bg-[#1C251F]'
          : 'bg-transparent text-[#4F5D55] hover:text-[#3F8F5E] hover:bg-[#F1F8F4]';
      case 'ai':
        return isDark
          ? 'bg-[rgba(138,120,168,0.2)] text-[#C5B5DD] border border-[#8A78A8]/40 hover:bg-[rgba(138,120,168,0.3)]'
          : 'bg-[#F0ECF5] text-[#6E5A8D] border border-[#8A78A8]/30 hover:bg-[#E7E0EF]';
      case 'danger':
        return isDark
          ? 'bg-[rgba(200,92,92,0.18)] text-[#E58585] border border-[#C85C5C]/40 hover:bg-[#C85C5C] hover:text-white'
          : 'bg-[#FBEAEA] text-[#C85C5C] border border-[#C85C5C]/30 hover:bg-[#C85C5C] hover:text-white';
      default:
        return isDark
          ? 'bg-[#1C251F] text-[#F1F5F2] border border-[#2A352D] hover:bg-[#253229]'
          : 'bg-[#FBFCFA] text-[#1D2822] border border-[#E4E8E3] hover:bg-[#F1F8F4]';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'xs':
        return 'px-2.5 py-1 text-[11px] rounded-[8px]';
      case 'sm':
        return 'px-3 py-1.5 text-xs rounded-[10px]';
      case 'lg':
        return 'px-5 py-2.5 text-sm font-medium rounded-[12px]';
      default:
        return 'px-3.5 py-2 text-xs font-medium rounded-[10px]';
    }
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 transition-all duration-150 border-0 cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed ${getVariantClasses()} ${getSizeClasses()} ${className}`}
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
