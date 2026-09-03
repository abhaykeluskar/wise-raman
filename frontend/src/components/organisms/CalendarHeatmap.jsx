import React, { useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Calendar as CalendarIcon } from 'lucide-react';
import { toLocalDateKey } from '../../utils/formatters';

export const CalendarHeatmap = ({ transactions, onDayClick }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { heatmapData, maxValue } = useMemo(() => {
    if (!transactions) return { heatmapData: [], maxValue: 0 };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 364);

    const dataMap = new Map();
    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = toLocalDateKey(d);
      dataMap.set(dateStr, 0);
    }

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
    if (val === 0) return isDark ? 'bg-white/5' : 'bg-black/5';
    const ratio = val / maxValue;
    if (ratio < 0.15) return isDark ? 'bg-[#A77B58]/30' : 'bg-[#E5D4C1]';
    if (ratio < 0.4) return isDark ? 'bg-[#A77B58]/60' : 'bg-[#D5B99D]';
    if (ratio < 0.7) return isDark ? 'bg-[#C85C5C]/60' : 'bg-[#FBEAEA]';
    return isDark ? 'bg-[#C85C5C]' : 'bg-[#C85C5C]';
  };

  const weeks = [];
  let currentWeek = [];
  if (heatmapData.length > 0) {
    const first = new Date(`${heatmapData[0].date}T12:00:00`);
    const pad = first.getDay();
    for (let i = 0; i < pad; i += 1) {
      currentWeek.push({ date: `pad-${i}`, val: null });
    }
  }

  heatmapData.forEach(day => {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  return (
    <div className={`p-5 rounded-[14px] border flex flex-col gap-3.5 ${
      isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
    }`}>
      <div className="flex items-center gap-2">
        <CalendarIcon className="h-4 w-4 text-[#3F8F5E]" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#8B978F]">Spend Intensity (Last 365 Days)</h3>
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
                  className={`w-3 h-3 rounded-[2px] ${day.val == null ? 'bg-transparent' : getColor(day.val)} transition-colors duration-150 hover:opacity-80 ${onDayClick && day.val != null ? 'cursor-pointer' : ''}`}
                  title={day.val == null ? undefined : `${day.date}: ₹${day.val.toFixed(0)}${onDayClick ? ' — click to open ledger' : ''}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 text-[11px] text-[#8B978F] mt-1">
        <span>Less</span>
        <div className={`w-2.5 h-2.5 rounded-[2px] ${isDark ? 'bg-white/5' : 'bg-black/5'}`}></div>
        <div className={`w-2.5 h-2.5 rounded-[2px] ${isDark ? 'bg-[#A77B58]/30' : 'bg-[#E5D4C1]'}`}></div>
        <div className={`w-2.5 h-2.5 rounded-[2px] ${isDark ? 'bg-[#A77B58]/60' : 'bg-[#D5B99D]'}`}></div>
        <div className={`w-2.5 h-2.5 rounded-[2px] ${isDark ? 'bg-[#C85C5C]' : 'bg-[#C85C5C]'}`}></div>
        <span>More</span>
      </div>
    </div>
  );
};
