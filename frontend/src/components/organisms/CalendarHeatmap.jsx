import React, { useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Calendar as CalendarIcon } from 'lucide-react';
import { toLocalDateKey } from '../../utils/formatters';

export const CalendarHeatmap = ({ transactions, onDayClick }) => {
  const { theme, style } = useTheme();

  const { heatmapData, maxValue } = useMemo(() => {
    if (!transactions) return { heatmapData: [], maxValue: 0 };
    
    // We want the last 364 days (52 weeks * 7 days)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 364);

    const dataMap = new Map();
    // Initialize 365 days with 0
    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = toLocalDateKey(d);
      dataMap.set(dateStr, 0);
    }

    // Accumulate negative amounts (outflows)
    let maxSpend = 0;
    transactions.forEach(tx => {
      const amt = parseFloat(tx.amount);
      if (amt < 0 && !tx.is_excluded_from_spending) {
        const txDateStr = toLocalDateKey(tx.date);
        if (dataMap.has(txDateStr)) {
          const newTotal = dataMap.get(txDateStr) + Math.abs(amt);
          dataMap.set(txDateStr, newTotal);
          if (newTotal > maxSpend) maxSpend = newTotal;
        }
      }
    });

    const dataArray = Array.from(dataMap.entries()).map(([date, val]) => ({ date, val }));
    return { heatmapData: dataArray, maxValue: maxSpend > 0 ? maxSpend : 1 };
  }, [transactions]);

  const getColor = (val) => {
    if (val === 0) return theme === 'dark' ? 'bg-[#1e1e2d]' : 'bg-slate-100';
    const ratio = val / maxValue;
    // We use shades of coral/red
    if (ratio < 0.1) return theme === 'dark' ? 'bg-[#4a2420]' : 'bg-red-200';
    if (ratio < 0.3) return theme === 'dark' ? 'bg-[#7a3227]' : 'bg-red-300';
    if (ratio < 0.6) return theme === 'dark' ? 'bg-[#ab412e]' : 'bg-red-400';
    return theme === 'dark' ? 'bg-[#FF7E67]' : 'bg-red-500';
  };

  // Group into weeks for rendering columns
  const weeks = [];
  let currentWeek = [];
  if (heatmapData.length > 0) {
    const first = new Date(`${heatmapData[0].date}T12:00:00`);
    const pad = first.getDay();
    for (let i = 0; i < pad; i += 1) {
      currentWeek.push({ date: `pad-${i}`, val: null });
    }
  }
  heatmapData.forEach((day, idx) => {
    currentWeek.push(day);
    if (currentWeek.length === 7 || idx === heatmapData.length - 1) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  return (
    <div className={`p-6 rounded-2xl flex flex-col gap-4 border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
      <div className="flex items-center gap-2">
        <CalendarIcon className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Spend Intensity (Last 365 Days)</h3>
      </div>
      <div className="flex-1 w-full overflow-x-auto pb-2">
        <div className="flex gap-1 min-w-max">
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-1">
              {week.map((day, dIdx) => (
                <div 
                  key={day.date} 
                  role={day.val == null || !onDayClick ? undefined : 'button'}
                  onClick={() => {
                    if (day.val == null || !onDayClick) return;
                    onDayClick(day.date);
                  }}
                  className={`w-3 h-3 rounded-sm ${day.val == null ? 'bg-transparent' : getColor(day.val)} transition-colors duration-200 hover:opacity-80 ${onDayClick && day.val != null ? 'cursor-pointer' : ''}`}
                  title={day.val == null ? undefined : `${day.date}: ₹${day.val.toFixed(0)}${onDayClick ? ' — click to open ledger' : ''}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 text-xs text-slate-500 mt-2">
        <span>Less</span>
        <div className={`w-3 h-3 rounded-sm ${theme === 'dark' ? 'bg-[#1e1e2d]' : 'bg-slate-100'}`}></div>
        <div className={`w-3 h-3 rounded-sm ${theme === 'dark' ? 'bg-[#4a2420]' : 'bg-red-200'}`}></div>
        <div className={`w-3 h-3 rounded-sm ${theme === 'dark' ? 'bg-[#ab412e]' : 'bg-red-400'}`}></div>
        <div className={`w-3 h-3 rounded-sm ${theme === 'dark' ? 'bg-[#FF7E67]' : 'bg-red-500'}`}></div>
        <span>More</span>
      </div>
    </div>
  );
};
