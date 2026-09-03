import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const Badge = ({ children, variant = 'default', size = 'sm', className = '' }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const getVariantStyles = () => {
    switch (variant) {
      case 'brand':
      case 'green':
        return isDark
          ? 'bg-[rgba(91,174,120,0.18)] text-[#7FC39A] border border-[rgba(91,174,120,0.3)]'
          : 'bg-[#E2F1E8] text-[#285A3A] border border-[#C6E4D2]';
      case 'brown':
      case 'earth':
        return isDark
          ? 'bg-[rgba(167,123,88,0.18)] text-[#D5B99D] border border-[rgba(167,123,88,0.3)]'
          : 'bg-[#F2E8DC] text-[#694A36] border border-[#E5D4C1]';
      case 'positive':
      case 'success':
        return isDark
          ? 'bg-[rgba(63,143,94,0.18)] text-[#7FC39A] border border-[rgba(63,143,94,0.3)]'
          : 'bg-[#E5F4EA] text-[#327349] border border-[#C6E4D2]';
      case 'negative':
      case 'danger':
        return isDark
          ? 'bg-[rgba(200,92,92,0.18)] text-[#E58585] border border-[rgba(200,92,92,0.3)]'
          : 'bg-[#FBEAEA] text-[#C85C5C] border border-[#F5CACA]';
      case 'warning':
        return isDark
          ? 'bg-[rgba(183,131,50,0.18)] text-[#E4BA68] border border-[rgba(183,131,50,0.3)]'
          : 'bg-[#FBF2DD] text-[#8C601E] border border-[#EEDFB8]';
      case 'info':
        return isDark
          ? 'bg-[rgba(91,130,168,0.18)] text-[#8EAFCE] border border-[rgba(91,130,168,0.3)]'
          : 'bg-[#EAF1F7] text-[#3D6084] border border-[#C9DCEB]';
      case 'ai':
      case 'violet':
        return isDark
          ? 'bg-[rgba(138,120,168,0.2)] text-[#C5B5DD] border border-[rgba(138,120,168,0.35)]'
          : 'bg-[#F0ECF5] text-[#6E5A8D] border border-[#DCD3E6]';
      case 'verified':
        return isDark
          ? 'bg-[rgba(91,174,120,0.14)] text-[#7FC39A] border border-[rgba(91,174,120,0.3)] font-semibold'
          : 'bg-[#E2F1E8] text-[#285A3A] border border-[#C6E4D2] font-semibold';
      case 'neutral':
      case 'default':
      default:
        return isDark
          ? 'bg-[#1C251F] text-[#C2CCC5] border border-[#2A352D]'
          : 'bg-[#FBFCFA] text-[#4F5D55] border border-[#E4E8E3]';
    }
  };

  const sizeClasses = size === 'xs'
    ? 'px-1.5 py-0.5 text-[10px]'
    : 'px-2 py-0.5 text-[11px]';

  return (
    <span className={`inline-flex items-center gap-1 rounded-md font-medium tracking-tight whitespace-nowrap select-none ${getVariantStyles()} ${sizeClasses} ${className}`}>
      {children}
    </span>
  );
};
