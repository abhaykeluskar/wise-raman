import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const TimeframePills = ({ activeTimeframe = '1m', onSelect }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const timeframes = [
    { key: '1w', label: '1w' },
    { key: '1m', label: '1m' },
    { key: '1y', label: '1y' },
    { key: 'all', label: 'All' }
  ];

  return (
    <div className={`inline-flex items-center p-0.5 rounded-[8px] border gap-0.5 ${
      isDark ? 'bg-white/5 border-[#2A352D]' : 'bg-black/5 border-[#E4E8E3]'
    }`}>
      {timeframes.map(tf => {
        const isActive = activeTimeframe === tf.key;
        return (
          <button
            key={tf.key}
            type="button"
            onClick={() => onSelect(tf.key)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-[6px] transition-all border-0 cursor-pointer ${
              isActive
                ? 'bg-[#3F8F5E] text-white shadow-xs'
                : isDark ? 'text-[#8B978F] hover:text-[#F1F5F2]' : 'text-[#7B877F] hover:text-[#1D2822]'
            }`}
          >
            {tf.label}
          </button>
        );
      })}
    </div>
  );
};
