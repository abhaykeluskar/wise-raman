import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { ArrowUpRight, ArrowDownRight, ChevronRight, HelpCircle } from 'lucide-react';

export const MetricValue = ({
  label,
  value,
  subtext,
  trend, // { value: '3.2%', direction: 'up' | 'down', label: 'from July', positiveIsGood: true }
  onHowCalculated,
  size = 'md',
  align = 'left',
  className = ''
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const getSizeClasses = () => {
    switch (size) {
      case 'lg':
        return 'text-[28px] sm:text-[34px] lg:text-[40px] font-[650] tracking-[-0.025em] leading-[1.1]';
      case 'sm':
        return 'text-[18px] sm:text-[22px] font-[650] tracking-[-0.02em] leading-tight';
      case 'md':
      default:
        return 'text-[22px] sm:text-[26px] lg:text-[28px] xl:text-[32px] font-[650] tracking-[-0.025em] leading-tight';
    }
  };

  const isGood = trend ? (trend.positiveIsGood !== false ? trend.direction === 'up' : trend.direction === 'down') : null;

  return (
    <div className={`flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'} ${className}`}>
      {label && (
        <span className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${
          isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
        }`}>
          {label}
        </span>
      )}

      <div className={`tabular-nums font-sans whitespace-nowrap ${getSizeClasses()} ${
        isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'
      }`}>
        {value}
      </div>

      {(trend || subtext || onHowCalculated) && (
        <div className={`flex items-center flex-wrap gap-2 mt-2 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
          {trend && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
              isGood ? 'text-[#3F8F5E]' : 'text-[#C85C5C]'
            }`}>
              {trend.direction === 'up' ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              <span>{trend.value}</span>
              {trend.label && (
                <span className={`font-normal ml-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                  {trend.label}
                </span>
              )}
            </span>
          )}

          {subtext && (
            <span className={`text-xs ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              {subtext}
            </span>
          )}

          {onHowCalculated && (
            <button
              type="button"
              onClick={onHowCalculated}
              className={`inline-flex items-center gap-1 text-[11px] font-medium border-0 bg-transparent p-0 cursor-pointer transition-colors ${
                isDark ? 'text-[#7FC39A] hover:text-[#A5D5B9]' : 'text-[#3F8F5E] hover:text-[#327349]'
              }`}
            >
              <span>How calculated</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
