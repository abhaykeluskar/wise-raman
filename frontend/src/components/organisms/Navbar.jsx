import React, { useState } from 'react';
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
  Menu,
  X,
  Landmark,
  PieChart
} from 'lucide-react';

export const Navbar = ({ activeTab, onSelectTab, onOpenUploadModal }) => {
  const { theme, setTheme, style } = useTheme();
  const { cards } = useFinance();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const desktopNavItems = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'accounts', label: 'Accounts', icon: Landmark },
    { key: 'analytics', label: 'Analytics', icon: PieChart },
    { key: 'transactions', label: 'Ledger', icon: ListFilter },
    { key: 'cards', label: `Cards (${cards.length})`, icon: CreditCard },
  ];

  const mobileNavItems = [
    ...desktopNavItems,
    { key: 'ai-assistant', label: 'AI Assistant', icon: MessageSquare },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleTabClick = (key) => {
    onSelectTab(key);
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        
        {/* Brand */}
        <div 
          onClick={() => handleTabClick('dashboard')} 
          className="flex items-center gap-3 cursor-pointer select-none shrink-0"
        >
          <div className={`p-2.5 rounded-2xl flex items-center justify-center ${style('neu-flat-dark text-[#FF7E67]', 'neu-flat-light text-[#4A90E2]')}`}>
            <Wallet className="h-5 w-5" />
          </div>
          <div className="hidden lg:block">
            <h1 className="text-base font-black tracking-tight leading-none">
              WiseRaman
            </h1>
            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
              Financial Intelligence
            </span>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <nav className={`hidden md:flex items-center gap-1.5 p-1.5 rounded-2xl shrink-0 ${style('neu-inset-dark', 'neu-inset-light')}`}>
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

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          
          {/* AI Assistant (Desktop Icon) */}
          <button
            type="button"
            onClick={() => onSelectTab('ai-assistant')}
            className={`hidden md:flex p-2.5 rounded-xl border-0 cursor-pointer transition-all ${
              activeTab === 'ai-assistant'
                ? style('neu-flat-dark text-emerald-400', 'neu-flat-light text-emerald-500')
                : style('neu-btn-dark text-slate-400', 'neu-btn-light text-slate-600')
            }`}
            title="AI Assistant"
          >
            <MessageSquare className="h-4 w-4" />
          </button>

          {/* Settings (Desktop Icon) */}
          <button
            type="button"
            onClick={() => onSelectTab('settings')}
            className={`hidden md:flex p-2.5 rounded-xl border-0 cursor-pointer transition-all ${
              activeTab === 'settings'
                ? style('neu-flat-dark text-[#FF7E67]', 'neu-flat-light text-[#4A90E2]')
                : style('neu-btn-dark text-slate-400', 'neu-btn-light text-slate-600')
            }`}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onOpenUploadModal}
            className={`flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all whitespace-nowrap ${style(
              'neu-btn-dark text-[#FF7E67] hover:brightness-110',
              'bg-[#FF7E67] text-white',
              'neu-btn-light text-[#4A90E2] hover:brightness-105',
              'bg-[#4A90E2] text-white'
            )}`}
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Import Statement</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`p-2.5 rounded-xl border-0 cursor-pointer transition-all ${style('neu-btn-dark text-slate-300', 'neu-btn-light text-slate-700')}`}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-600" />}
          </button>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`md:hidden p-2.5 rounded-xl border-0 cursor-pointer transition-all ${style('neu-btn-dark text-slate-300', 'neu-btn-light text-slate-700')}`}
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="h-4 w-4 text-red-400" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

      </div>

      {/* Mobile Dropdown Drawer */}
      {isMobileMenuOpen && (
        <div className={`md:hidden px-4 pb-4 pt-2 border-t border-slate-800/10 animate-in slide-in-from-top-2 duration-200 ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex flex-col gap-1">
            {mobileNavItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleTabClick(item.key)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer text-left w-full ${
                    isActive
                      ? style(
                          'neu-inset-dark text-[#FF7E67]',
                          'neu-inset-light text-[#4A90E2]'
                        )
                      : style(
                          'text-slate-400 hover:text-slate-200',
                          'text-slate-600 hover:text-slate-900'
                        )
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
