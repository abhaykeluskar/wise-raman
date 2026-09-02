import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const TimeframePills = ({ activeTimeframe = '1m', onSelect }) => {
  const { style } = useTheme();
  const timeframes = [
    { key: '1w', label: '1w' },
    { key: '1m', label: '1m' },
    { key: '1y', label: '1y' },
    { key: 'all', label: 'All' }
  ];

  return (
    <div className={`inline-flex items-center p-1 rounded-xl gap-1 border-0 ${style('neu-inset-dark', 'neu-inset-light')}`}>
      {timeframes.map(tf => {
        const isActive = activeTimeframe === tf.key;
        return (
          <button
            key={tf.key}
            type="button"
            onClick={() => onSelect(tf.key)}
            className={`px-3 py-1 text-xxs font-bold rounded-lg transition-all border-0 cursor-pointer ${
              isActive
                ? style(
                    'neu-flat-dark text-[#5EEAD4] shadow-[0_0_10px_rgba(94,234,212,0.15)]',
                    'bg-[#5EEAD4] text-[#0A0E14]',
                    'neu-flat-light text-[#0F766E]',
                    'bg-[#0F766E] text-white'
                  )
                : style('text-slate-400 hover:text-slate-200', 'text-slate-600 hover:text-slate-900')
            }`}
          >
            {tf.label}
          </button>
        );
      })}
    </div>
  );
};
