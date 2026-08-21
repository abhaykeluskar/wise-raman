import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const StatDeckCard = ({
  title,
  value,
  sublabel,
  valueColor = '',
  icon: Icon
}) => {
  const { style } = useTheme();

  return (
    <div className={`p-4 rounded-xl border-0 flex flex-col justify-between transition-all ${style('neu-inset-dark', 'neu-inset-light')}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          {title}
        </span>
        {Icon && <Icon className="h-4 w-4 text-slate-400 opacity-60" />}
      </div>
      <div className="mt-2">
        <h4 className={`text-xl font-black tracking-tight tabular-nums ${valueColor || style('text-[#EAEAEA]', 'text-[#2D3436]')}`}>
          {value}
        </h4>
        {sublabel && (
          <span className="text-xs text-slate-400 mt-0.5 block font-normal">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
};
