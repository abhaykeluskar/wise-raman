import React, { useState, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { Button } from '../atoms/Button';
import { IconButton } from '../atoms/IconButton';
import { 
  Search, 
  Upload, 
  Sun, 
  Moon, 
  Calendar, 
  ChevronDown, 
  LogOut, 
  User as UserIcon,
  ShieldCheck,
  Bell,
  Check
} from 'lucide-react';

export const TopBar = ({
  activeTab,
  onOpenUploadModal,
  onOpenSearch,
  selectedPeriod,
  onPeriodChange
}) => {
  const { theme, setTheme } = useTheme();
  const { user, logout, accounts } = useFinance();
  const isDark = theme === 'dark';

  const [profileOpen, setProfileOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

  const availablePeriods = useMemo(() => {
    const periods = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      periods.push(d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
    }
    periods.push('All Time');
    return periods;
  }, []);

  const currentPeriod = selectedPeriod || availablePeriods[0];

  const getTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Dashboard';
      case 'transactions': return 'Transactions';
      case 'accounts': return 'Accounts & Balances';
      case 'cards': return 'Credit Cards';
      case 'cashflow': return 'Cash Flow';
      case 'health': return 'Financial Health';
      case 'insights': return 'Insights';
      case 'calendar': return 'Financial Calendar';
      case 'copilot': return 'Financial Copilot';
      case 'documents': return 'Source Documents';
      case 'review': return 'Needs Review Queue';
      case 'reports': return 'Financial Reports';
      case 'payslips': return 'Salary & Payslips';
      case 'household': return 'Household & Life';
      case 'settings': return 'Settings';
      case 'backup': return 'Backup & Recovery';
      case 'truth-inspector': return 'Financial Truth Inspector';
      default: return 'WiseRaman';
    }
  };

  return (
    <header className={`shrink-0 sticky top-0 z-30 h-14 border-b flex items-center justify-between px-4 sm:px-6 transition-colors duration-150 ${
      isDark ? 'bg-[#171E19]/90 backdrop-blur-md border-[#2A352D]' : 'bg-[#FFFFFF]/90 backdrop-blur-md border-[#E4E8E3]'
    }`}>
      {/* Left: Breadcrumbs / Title */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-[11px] text-[#8B978F]">
            <span>WiseRaman</span>
            <span>/</span>
            <span className={isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}>{getTitle()}</span>
          </div>
          <h1 className={`text-sm sm:text-base font-bold tracking-tight leading-none mt-0.5 ${
            isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'
          }`}>
            {getTitle()}
          </h1>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        
        {/* Global Search Omnibox Trigger */}
        <button
          type="button"
          onClick={onOpenSearch}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs transition-colors border cursor-pointer ${
            isDark
              ? 'bg-[#1C251F] text-[#8B978F] border-[#2A352D] hover:text-[#F1F5F2] hover:border-[#5BAE78]/40'
              : 'bg-[#FBFCFA] text-[#7B877F] border-[#E4E8E3] hover:text-[#1D2822] hover:border-[#C6E4D2]'
          }`}
          title="Search transactions, accounts, and workspaces (⌘K)"
        >
          <Search className="h-3.5 w-3.5 text-[#5BAE78]" />
          <span className="hidden md:inline">Quick Search...</span>
          <kbd className="hidden sm:inline-block text-[10px] px-1.5 py-0.2 rounded border border-[#8B978F]/30 font-mono">
            ⌘K
          </kbd>
        </button>

        {/* Interactive Period Selector Dropdown */}
        <div className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setPeriodOpen(!periodOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] text-xs font-medium border transition-colors cursor-pointer ${
              isDark
                ? 'bg-[#1C251F] text-[#C2CCC5] border-[#2A352D] hover:bg-[#253229]'
                : 'bg-[#FBFCFA] text-[#4F5D55] border-[#E4E8E3] hover:bg-[#F1F8F4]'
            }`}
          >
            <Calendar className="h-3.5 w-3.5 text-[#5BAE78]" />
            <span>{currentPeriod}</span>
            <ChevronDown className="h-3 w-3 text-[#8B978F]" />
          </button>

          {periodOpen && (
            <div className={`absolute right-0 mt-1 w-44 rounded-[12px] p-1.5 border shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100 ${
              isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
            }`}>
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8B978F]">
                Statement Period
              </div>
              <div className="space-y-0.5">
                {availablePeriods.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      if (onPeriodChange) onPeriodChange(p);
                      setPeriodOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[8px] text-xs text-left cursor-pointer border-0 transition-colors ${
                      currentPeriod === p
                        ? isDark ? 'bg-[#1C251F] text-[#7FC39A] font-semibold' : 'bg-[#F1F8F4] text-[#285A3A] font-semibold'
                        : isDark ? 'hover:bg-[#1C251F] text-[#C2CCC5]' : 'hover:bg-[#FBFCFA] text-[#4F5D55]'
                    }`}
                  >
                    <span>{p}</span>
                    {currentPeriod === p && <Check className="h-3 w-3 text-[#3F8F5E]" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Primary Action: Import Statement */}
        <Button
          variant="primary"
          size="sm"
          onClick={onOpenUploadModal}
          icon={Upload}
        >
          <span className="hidden sm:inline">Import Statement</span>
          <span className="sm:hidden">Import</span>
        </Button>

        {/* Theme Toggle */}
        <IconButton
          icon={theme === 'dark' ? Sun : Moon}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          size="sm"
        />

        {/* Profile / Logout Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            className={`flex items-center gap-2 p-1.5 rounded-[10px] border transition-colors cursor-pointer ${
              isDark
                ? 'bg-[#1C251F] border-[#2A352D] text-[#F1F5F2] hover:bg-[#253229]'
                : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#1D2822] hover:bg-[#F1F8F4]'
            }`}
            aria-label="User profile menu"
          >
            <div className="h-6 w-6 rounded-full bg-[#3F8F5E] text-white flex items-center justify-center text-[10px] font-bold">
              {(user?.name || user?.email || '-').charAt(0).toUpperCase()}
            </div>
            <ChevronDown className="h-3 w-3 text-[#8B978F]" />
          </button>

          {profileOpen && (
            <div className={`absolute right-0 mt-2 w-56 rounded-[12px] p-2 border shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 ${
              isDark
                ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]'
                : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
            }`}>
              <div className="p-2 border-b border-[#2A352D]/20 mb-1">
                <div className="text-xs font-bold truncate">{user?.name || user?.email || '-'}</div>
                {user?.name && (
                  <div className="text-[10px] text-[#8B978F] truncate">{user?.email}</div>
                )}
                <div className="text-[10px] text-[#8B978F] mt-0.5">
                  {accounts.length} connected account(s)
                </div>
              </div>

              <button
                type="button"
                onClick={() => { setProfileOpen(false); logout(); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-xs text-[#C85C5C] hover:bg-[#FBEAEA]/20 cursor-pointer border-0 text-left transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
