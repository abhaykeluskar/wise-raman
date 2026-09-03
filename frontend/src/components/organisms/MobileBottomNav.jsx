import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { 
  BarChart3, 
  ListFilter, 
  TrendingUp, 
  Sparkles, 
  MoreHorizontal, 
  Landmark, 
  CreditCard, 
  Activity, 
  Lightbulb, 
  CalendarClock, 
  FileSpreadsheet, 
  FileText, 
  AlertCircle, 
  Settings, 
  Database, 
  Terminal, 
  Home,
  Receipt,
  X 
} from 'lucide-react';

export const MobileBottomNav = ({ activeTab, onSelectTab }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [moreOpen, setMoreOpen] = useState(false);

  const mainTabs = [
    { key: 'dashboard', label: 'Home', icon: BarChart3 },
    { key: 'transactions', label: 'Ledger', icon: ListFilter },
    { key: 'cashflow', label: 'Cash Flow', icon: TrendingUp },
    { key: 'copilot', label: 'Copilot', icon: Sparkles },
  ];

  const moreTabs = [
    { key: 'accounts', label: 'Bank Accounts', icon: Landmark },
    { key: 'cards', label: 'Credit Cards', icon: CreditCard },
    { key: 'payslips', label: 'Salary & Payslips', icon: Receipt },
    { key: 'household', label: 'Household & Life', icon: Home },
    { key: 'health', label: 'Financial Health', icon: Activity },
    { key: 'insights', label: 'Insights', icon: Lightbulb },
    { key: 'calendar', label: 'Financial Calendar', icon: CalendarClock },
    { key: 'reports', label: 'Reports', icon: FileSpreadsheet },
    { key: 'documents', label: 'Documents', icon: FileText },
    { key: 'review', label: 'Needs Review', icon: AlertCircle },
    { key: 'settings', label: 'Settings', icon: Settings },
    { key: 'backup', label: 'Backup & Restore', icon: Database },
    { key: 'truth-inspector', label: 'Truth Inspector', icon: Terminal },
  ];

  const handleSelect = (key) => {
    onSelectTab(key);
    setMoreOpen(false);
  };

  return (
    <>
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-40 border-t flex items-center justify-around h-16 px-2 backdrop-blur-md pb-safe ${
        isDark ? 'bg-[#171E19]/95 border-[#2A352D]' : 'bg-[#FFFFFF]/95 border-[#E4E8E3]'
      }`}>
        {mainTabs.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleSelect(item.key)}
              className={`flex flex-col items-center justify-center flex-1 py-1 border-0 bg-transparent cursor-pointer transition-colors ${
                isActive
                  ? 'text-[#3F8F5E] font-semibold'
                  : isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
              }`}
            >
              <Icon className="h-5 w-5 mb-0.5" />
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex flex-col items-center justify-center flex-1 py-1 border-0 bg-transparent cursor-pointer transition-colors ${
            moreTabs.some(t => t.key === activeTab)
              ? 'text-[#3F8F5E] font-semibold'
              : isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
          }`}
        >
          <MoreHorizontal className="h-5 w-5 mb-0.5" />
          <span className="text-[10px]">More</span>
        </button>
      </nav>

      {/* Slide-up Bottom Sheet for "More" */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60 flex flex-col justify-end animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setMoreOpen(false)}
          />
          <div className={`relative z-10 w-full max-h-[75vh] rounded-t-[20px] p-5 border-t overflow-y-auto ${
            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E8E3]/30 mb-4">
              <span className={`text-sm font-bold ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
                All Financial Workspaces
              </span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="p-1 rounded-full border-0 bg-transparent cursor-pointer text-[#8B978F]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {moreTabs.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelect(item.key)}
                    className={`flex items-center gap-2.5 p-3 rounded-[12px] text-xs border text-left transition-colors cursor-pointer ${
                      isActive
                        ? isDark
                          ? 'bg-[rgba(91,174,120,0.18)] text-[#7FC39A] border-[#5BAE78]/40 font-semibold'
                          : 'bg-[#F1F8F4] text-[#285A3A] border-[#C6E4D2] font-semibold'
                        : isDark
                          ? 'bg-[#1C251F] text-[#C2CCC5] border-[#2A352D]'
                          : 'bg-[#FBFCFA] text-[#4F5D55] border-[#E4E8E3]'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#3F8F5E]' : 'text-[#8B978F]'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
