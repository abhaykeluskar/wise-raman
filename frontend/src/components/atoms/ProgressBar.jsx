import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const ProgressBar = ({ 
  progress = 0, 
  color = 'bg-[#3F8F5E]', 
  height = 'h-1.5', 
  className = '' 
}) => {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div className={`w-full ${height} rounded-full overflow-hidden bg-black/5 dark:bg-white/10 ${className}`}>
      <div 
        className={`h-full ${color} rounded-full transition-all duration-300`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};
