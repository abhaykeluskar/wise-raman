import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { CheckCircle2, ShieldCheck, ChevronDown, ChevronUp, FileText } from 'lucide-react';

export const EvidenceBadge = ({
  label = 'Deterministic calculation',
  sourceCount,
  expanded = false,
  onToggle,
  variant = 'success',
  className = ''
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11px] font-medium transition-all duration-150 border cursor-pointer select-none ${
        isDark
          ? 'bg-[#171E19] text-[#7FC39A] border-[#2A352D] hover:border-[#5BAE78]/50'
          : 'bg-[#F1F8F4] text-[#285A3A] border-[#C6E4D2] hover:border-[#7FC39A] shadow-xs'
      } ${className}`}
    >
      <CheckCircle2 className="h-3 w-3 text-[#3F8F5E]" />
      <span>{label}</span>
      {sourceCount !== undefined && (
        <span className={`text-[10px] px-1 rounded ${
          isDark ? 'bg-[#2A352D] text-[#C2CCC5]' : 'bg-[#E2F1E8] text-[#327349]'
        }`}>
          {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
        </span>
      )}
      {onToggle && (
        expanded ? <ChevronUp className="h-3 w-3 opacity-60 ml-0.5" /> : <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
      )}
    </button>
  );
};
