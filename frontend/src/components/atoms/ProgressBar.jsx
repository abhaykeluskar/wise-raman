import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const ProgressBar = ({ progress = 0, colorGradient = 'from-indigo-500 to-indigo-600', height = 'h-3', className = '' }) => {
  const { style } = useTheme();
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div className={`w-full ${height} rounded-full overflow-hidden ${style('neu-inset-dark', 'bg-slate-100')} ${className}`}>
      <div 
        className={`h-full bg-gradient-to-r ${colorGradient} rounded-full transition-all duration-500`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};
