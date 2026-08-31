import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { 
  Wallet, 
  Upload, 
  MessageSquare, 
  BarChart3, 
  ListFilter, 
  CreditCard, 
  Settings, 
  Moon, 
  Sun,
  Landmark,
  PieChart,
  Briefcase,
  MoreHorizontal,
  X
} from 'lucide-react';

export const Navbar = ({ activeTab, onSelectTab, onOpenUploadModal }) => {
  const { theme, setTheme, style } = useTheme();
  const { cards } = useFinance();
  const [moreOpen, setMoreOpen] = useState(false);

  const desktopNavItems = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'accounts', label: 'Accounts', icon: Landmark },
    { key: 'payslips', label: 'Payslips', icon: Briefcase },
    { key: 'analytics', label: 'Analytics', icon: PieChart },
    { key: 'transactions', label: 'Ledger', icon: ListFilter },
    { key: 'cards', label: `Cards (${cards.length})`, icon: CreditCard },
  ];

  const mobileNavItems = [
    { key: 'dashboard', label: 'Home', icon: BarChart3 },
    { key: 'transactions', label: 'Ledger', icon: ListFilter },
    { key: 'cards', label: 'Cards', icon: CreditCard },
    { key: 'analytics', label: 'Stats', icon: PieChart },
  ];

  const moreTabKeys = ['accounts', 'ai-assistant', 'settings', 'payslips'];
  const moreIsActive = moreTabKeys.includes(activeTab);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const handleTabClick = (key) => {
    setMoreOpen(false);
    onSelectTab(key);
  };

  return (
    <>
    <header className="sticky top-0 z-40 backdrop-blur-md transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        
        <button
          type="button"
          onClick={() => handleTabClick('dashboard')} 
          className="flex items-center gap-3 cursor-pointer select-none shrink-0 border-0 bg-transparent p-0"
          aria-label="WiseRaman home"
        >
          <div className={`p-2.5 rounded-2xl flex items-center justify-center ${style('neu-flat-dark text-[#FF7E67]', 'neu-flat-light text-[#4A90E2]')}`}>
            <Wallet className="h-5 w-5" />
          </div>
          <div className="hidden sm:block text-left">
            <h1 className="text-base font-black tracking-tight leading-none">
              WiseRaman
            </h1>
            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
              Financial Intelligence
            </span>
          </div>
        </button>

        <nav className={`hidden md:flex items-center gap-1.5 p-1.5 rounded-2xl shrink-0 ${style('neu-inset-dark', 'neu-inset-light')}`} aria-label="Primary">
          {desktopNavItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelectTab(item.key)}
                className={`flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? style(
                        'neu-flat-dark text-[#FF7E67]',
                        'bg-[#FF7E67] text-white',
                        'neu-flat-light text-[#4A90E2]',
                        'bg-[#4A90E2] text-white'
                      )
                    : style(
                        'text-slate-400 hover:text-slate-200',
                        'text-slate-600 hover:text-slate-900'
                      )
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onSelectTab('ai-assistant')}
            className={`hidden md:flex p-2.5 rounded-xl border-0 cursor-pointer transition-all ${
              activeTab === 'ai-assistant'
                ? style('neu-flat-dark text-emerald-400', 'neu-flat-light text-emerald-500')
                : style('neu-btn-dark text-slate-400', 'neu-btn-light text-slate-600')
            }`}
            title="AI Assistant"
            aria-label="AI Assistant"
          >
            <MessageSquare className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('settings')}
            className={`hidden md:flex p-2.5 rounded-xl border-0 cursor-pointer transition-all ${
              activeTab === 'settings'
                ? style('neu-flat-dark text-[#FF7E67]', 'neu-flat-light text-[#4A90E2]')
                : style('neu-btn-dark text-slate-400', 'neu-btn-light text-slate-600')
            }`}
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onOpenUploadModal}
            className={`flex items-center gap-1.5 min-h-11 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all whitespace-nowrap ${style(
              'neu-btn-dark text-[#FF7E67] hover:brightness-110',
              'bg-[#FF7E67] text-white',
              'neu-btn-light text-[#4A90E2] hover:brightness-105',
              'bg-[#4A90E2] text-white'
            )}`}
            aria-label="Import statement"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Import Statement</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`p-2.5 min-h-11 min-w-11 rounded-xl border-0 cursor-pointer transition-all ${style('neu-btn-dark text-slate-300', 'neu-btn-light text-slate-700')}`}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-600" />}
          </button>
        </div>

      </div>
    </header>

      {moreOpen && (
        <button
          type="button"
          className="md:hidden fixed inset-0 z-40 bg-black/45 border-0 cursor-pointer"
          aria-label="Close menu"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {moreOpen && (
        <div
          className={`md:hidden fixed inset-x-0 bottom-0 z-50 rounded-t-3xl p-4 pb-safe shadow-2xl ${style('bg-[#1a1a2e] text-slate-100', 'bg-[#E0E5EC] text-slate-800')}`}
          role="dialog"
          aria-label="More"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold">More</h2>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="p-2 rounded-xl border-0 bg-transparent cursor-pointer text-slate-400"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'accounts', label: 'Bank Accounts', icon: Landmark },
              { key: 'payslips', label: 'Payslips', icon: Briefcase },
              { key: 'ai-assistant', label: 'AI Assistant', icon: MessageSquare },
              { key: 'settings', label: 'Settings', icon: Settings },
              { key: 'upload', label: 'Import Statement', icon: Upload },
            ].map(item => {
              const Icon = item.icon;
              const isActive = item.key !== 'upload' && activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    if (item.key === 'upload') {
                      setMoreOpen(false);
                      onOpenUploadModal();
                      return;
                    }
                    handleTabClick(item.key);
                  }}
                  className={`flex items-center gap-3 min-h-12 px-3 py-3 rounded-2xl text-left text-xs font-bold border-0 cursor-pointer ${
                    isActive
                      ? style('neu-flat-dark text-[#FF7E67]', 'neu-flat-light text-[#4A90E2]')
                      : style('neu-inset-dark text-slate-200', 'neu-inset-light text-slate-700')
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <nav
        className={`md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-800/10 pb-safe ${style('bg-[#181828]/95 backdrop-blur-md', 'bg-[#E0E5EC]/95 backdrop-blur-md')}`}
        aria-label="Primary"
      >
        <div className="grid grid-cols-5 px-1 pt-1">
          {mobileNavItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleTabClick(item.key)}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-12 py-2 rounded-xl border-0 cursor-pointer touch-manipulation ${
                  isActive
                    ? style('text-[#FF7E67]', 'text-[#4A90E2]')
                    : style('text-slate-500', 'text-slate-500')
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] font-bold tracking-wide">{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(open => !open)}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-12 py-2 rounded-xl border-0 cursor-pointer touch-manipulation ${
              moreIsActive || moreOpen
                ? style('text-[#FF7E67]', 'text-[#4A90E2]')
                : style('text-slate-500', 'text-slate-500')
            }`}
            aria-expanded={moreOpen}
            aria-label="More"
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="text-[10px] font-bold tracking-wide">More</span>
          </button>
        </div>
      </nav>
    </>
  );
};
