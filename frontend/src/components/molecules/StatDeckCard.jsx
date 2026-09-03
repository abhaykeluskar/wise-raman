import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const StatDeckCard = ({
  title,
  value,
  sublabel,
  valueColor = '',
  icon: Icon
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className={`p-4 rounded-[12px] border flex flex-col justify-between transition-all ${
      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
    }`}>
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${
          isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
        }`}>
          {title}
        </span>
        {Icon && <Icon className={`h-4 w-4 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`} />}
      </div>
      <div className="mt-2">
        <h4 className={`text-xl font-bold tracking-tight tabular-nums ${
          valueColor || (isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]')
        }`}>
          {value}
        </h4>
        {sublabel && (
          <span className={`text-xs mt-0.5 block font-medium ${
            isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
          }`}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
};
