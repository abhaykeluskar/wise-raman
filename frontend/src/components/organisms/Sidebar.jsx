import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { 
  BarChart3, 
  ListFilter, 
  Landmark, 
  CreditCard, 
  TrendingUp, 
  Activity, 
  Lightbulb, 
  CalendarClock, 
  FileSpreadsheet, 
  Sparkles, 
  FileText, 
  AlertCircle, 
  Settings, 
  Database,
  Terminal,
  ShieldCheck,
  Wallet,
  Home,
  Receipt
} from 'lucide-react';

export const Sidebar = ({ activeTab, onSelectTab, className = '' }) => {
  const { theme } = useTheme();
  const { cards, user } = useFinance();
  const isDark = theme === 'dark';

  const navSections = [
    {
      title: 'Overview',
      items: [
        { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
      ]
    },
    {
      title: 'Money',
      items: [
        { key: 'transactions', label: 'Transactions', icon: ListFilter },
        { key: 'accounts', label: 'Accounts', icon: Landmark },
        { key: 'cards', label: 'Credit Cards', icon: CreditCard, badge: cards?.length || undefined },
        { key: 'cashflow', label: 'Cash Flow', icon: TrendingUp },
        { key: 'payslips', label: 'Payslips & Salary', icon: Receipt },
        { key: 'household', label: 'Household & Life', icon: Home },
      ]
    },
    {
      title: 'Understand',
      items: [
        { key: 'health', label: 'Financial Health', icon: Activity },
        { key: 'insights', label: 'Insights', icon: Lightbulb },
        { key: 'calendar', label: 'Calendar', icon: CalendarClock },
        { key: 'reports', label: 'Reports', icon: FileSpreadsheet },
      ]
    },
    {
      title: 'Intelligence',
      items: [
        { key: 'copilot', label: 'Financial Copilot', icon: Sparkles, badge: 'Local' },
      ]
    },
    {
      title: 'Archive',
      items: [
        { key: 'documents', label: 'Documents', icon: FileText },
      ]
    },
    {
      title: 'Queue',
      items: [
        { key: 'review', label: 'Needs Review', icon: AlertCircle },
      ]
    },
    {
      title: 'System',
      items: [
        { key: 'settings', label: 'Settings', icon: Settings },
        { key: 'backup', label: 'Backup & Restore', icon: Database },
      ]
    }
  ];

  if (user?.email === 'dev@test.com' || true) {
    navSections.push({
      title: 'Developer',
      items: [
        { key: 'truth-inspector', label: 'Truth Inspector', icon: Terminal },
      ]
    });
  }

  return (
    <aside className={`w-64 shrink-0 flex flex-col justify-between border-r h-screen sticky top-0 overflow-y-auto ${
      isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
    } ${className}`}>
      {/* Brand Header */}
      <div>
        <div className="p-5 flex items-center gap-3">
          <div className="h-8 w-8 rounded-[10px] bg-[#3F8F5E] flex items-center justify-center text-white shadow-xs">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
                WiseRaman
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-[rgba(91,174,120,0.15)] text-[#3F8F5E]">
                OS
              </span>
            </div>
            <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Financial Command
            </p>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="px-3 py-1 space-y-4">
          {navSections.map((sec, sIdx) => (
            <div key={sIdx}>
              <div className={`px-3 mb-1 text-[10px] font-bold uppercase tracking-wider ${
                isDark ? 'text-[#5E6962]' : 'text-[#A8B0AA]'
              }`}>
                {sec.title}
              </div>
              <div className="space-y-0.5">
                {sec.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onSelectTab(item.key)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-xs font-medium transition-all duration-150 border-0 cursor-pointer text-left select-none ${
                        isActive
                          ? isDark
                            ? 'bg-[rgba(91,174,120,0.15)] text-[#7FC39A] font-semibold'
                            : 'bg-[#F1F8F4] text-[#285A3A] font-semibold'
                          : isDark
                            ? 'bg-transparent text-[#C2CCC5] hover:text-[#F1F5F2] hover:bg-[#1C251F]'
                            : 'bg-transparent text-[#4F5D55] hover:text-[#1D2822] hover:bg-[#F7F8F5]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`h-4 w-4 shrink-0 ${
                          isActive
                            ? 'text-[#3F8F5E]'
                            : isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
                        }`} />
                        <span className="truncate">{item.label}</span>
                      </div>

                      {item.badge !== undefined && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                          isActive
                            ? isDark ? 'bg-[#285A3A] text-white' : 'bg-[#C6E4D2] text-[#285A3A]'
                            : isDark ? 'bg-[#2A352D] text-[#8B978F]' : 'bg-[#E4E8E3] text-[#7B877F]'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom info strip: Local & Private Status */}
      <div className={`p-4 border-t ${isDark ? 'border-[#2A352D]' : 'border-[#E4E8E3]'}`}>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#3F8F5E]" />
          <span className={`text-[11px] font-medium ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            Local · Private · Financial OS
          </span>
        </div>
      </div>
    </aside>
  );
};
