import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const IconButton = ({
  icon: Icon,
  onClick,
  title,
  'aria-label': ariaLabel,
  variant = 'secondary',
  size = 'md',
  disabled = false,
  className = '',
  badge
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const getVariantClasses = () => {
    switch (variant) {
      case 'primary':
        return 'bg-[#3F8F5E] text-white hover:bg-[#327349]';
      case 'ghost':
        return isDark
          ? 'bg-transparent text-[#8B978F] hover:text-[#F1F5F2] hover:bg-[#1C251F]'
          : 'bg-transparent text-[#7B877F] hover:text-[#1D2822] hover:bg-[#F1F8F4]';
      case 'ai':
        return isDark
          ? 'bg-[rgba(138,120,168,0.18)] text-[#C5B5DD] border border-[#8A78A8]/30 hover:bg-[rgba(138,120,168,0.28)]'
          : 'bg-[#F0ECF5] text-[#6E5A8D] border border-[#8A78A8]/20 hover:bg-[#E7E0EF]';
      case 'secondary':
      default:
        return isDark
          ? 'bg-[#171E19] text-[#C2CCC5] border border-[#2A352D] hover:bg-[#1C251F] hover:text-[#F1F5F2]'
          : 'bg-[#FFFFFF] text-[#4F5D55] border border-[#E4E8E3] hover:bg-[#F1F8F4] hover:text-[#1D2822] shadow-xs';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'p-1.5 rounded-[8px]';
      case 'lg':
        return 'p-2.5 rounded-[12px]';
      default:
        return 'p-2 rounded-[10px]';
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || ariaLabel}
      aria-label={ariaLabel || title}
      className={`relative inline-flex items-center justify-center transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${getVariantClasses()} ${getSizeClasses()} ${className}`}
    >
      {Icon && <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />}
      {badge !== undefined && badge !== null && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#3F8F5E] px-1 text-[9px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
};
