import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const Divider = ({ orientation = 'horizontal', className = '' }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (orientation === 'vertical') {
    return (
      <div
        className={`w-px h-full self-stretch ${
          isDark ? 'bg-[#2A352D]' : 'bg-[#E4E8E3]'
        } ${className}`}
        role="separator"
      />
    );
  }

  return (
    <div
      className={`w-full h-px ${
        isDark ? 'bg-[#2A352D]' : 'bg-[#E4E8E3]'
      } ${className}`}
      role="separator"
    />
  );
};
