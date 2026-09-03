import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../utils/formatters';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { 
  Calendar as CalendarIcon, 
  Download, 
  CalendarClock, 
  AlertCircle, 
  CheckCircle2, 
  CreditCard, 
  TrendingUp, 
  TrendingDown, 
  Landmark, 
  ChevronLeft, 
  ChevronRight,
  Clock
} from 'lucide-react';

export const FinancialCalendarView = () => {
  const { theme } = useTheme();
  const { token, API_BASE_URL, authFetch } = useFinance();
  const isDark = theme === 'dark';

  const [calendarData, setCalendarData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [currentMonthIndex, setCurrentMonthIndex] = useState(7); // August (0-indexed)

  const monthNames = [
    'January 2026', 'February 2026', 'March 2026', 'April 2026',
    'May 2026', 'June 2026', 'July 2026', 'August 2026',
    'September 2026', 'October 2026', 'November 2026', 'December 2026'
  ];

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    authFetch('/api/analytics/financial-calendar')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setCalendarData(data); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [token, authFetch]);

  // Export iCal (.ics) file handler calling backend
  const handleExportIcs = async () => {
    setIsExporting(true);
    try {
      const res = await authFetch('/api/analytics/financial-calendar/export-ics');
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wiseraman_calendar_${monthNames[currentMonthIndex].replace(' ', '_')}.ics`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to export .ics:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Default fallback events
  const defaultEvents = [
    { day: '01', title: 'Salary Expected', type: 'income', amount: 124500, detail: 'Monthly payroll direct credit' },
    { day: '01', title: 'Axis Airtel CC Due', type: 'planned', amount: 3373.53, detail: 'Cycle payment deadline' },
    { day: '05', title: 'SIP — Index Fund', type: 'planned', amount: 15000, detail: 'Groww Mutual Fund auto-debit' },
    { day: '10', title: 'Rent / Maintenance', type: 'planned', amount: 22000, detail: 'Apartment transfer via UPI' },
    { day: '15', title: 'Health Insurance Premium', type: 'planned', amount: 4800, detail: 'HDFC Ergo annual mandate' },
    { day: '25', title: 'Electricity & Broadband', type: 'planned', amount: 2650, detail: 'Bescom & Airtel fiber' }
  ];

  const displayEvents = useMemo(() => {
    if (calendarData && calendarData.events && calendarData.events.length > 0) {
      return calendarData.events.map(e => ({
        day: e.date ? String(new Date(e.date).getDate()).padStart(2, '0') : (e.day || '01'),
        title: e.title || e.event_name || 'Obligation',
        type: (e.flow === 'INFLOW' || e.type === 'INCOME' || (e.amount && parseFloat(e.amount) > 0 && e.title?.toLowerCase().includes('salary'))) ? 'income' : 'planned',
        amount: Math.abs(parseFloat(e.amount || 0)),
        detail: e.description || e.account || e.source || 'Scheduled obligation'
      }));
    }
    return defaultEvents;
  }, [calendarData]);

  return (
    <div className="space-y-8 animate-in fade-in duration-200 pb-12">
      
      {/* 1. Header with Month Navigation & Export ICS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E4E8E3]/30">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
            Financial Calendar & Timeline
          </h2>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            Expected salary, credit card due dates, SIPs, insurance, and tax deadlines
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Month Stepper */}
          <div className={`flex items-center p-0.5 rounded-[10px] border text-xs ${
            isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
          }`}>
            <button
              type="button"
              onClick={() => setCurrentMonthIndex(i => Math.max(0, i - 1))}
              disabled={currentMonthIndex <= 0}
              className="p-1 rounded text-[#8B978F] hover:text-foreground border-0 bg-transparent cursor-pointer disabled:opacity-30"
              title="Previous Month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 font-semibold select-none">{monthNames[currentMonthIndex]}</span>
            <button
              type="button"
              onClick={() => setCurrentMonthIndex(i => Math.min(monthNames.length - 1, i + 1))}
              disabled={currentMonthIndex >= monthNames.length - 1}
              className="p-1 rounded text-[#8B978F] hover:text-foreground border-0 bg-transparent cursor-pointer disabled:opacity-30"
              title="Next Month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportIcs}
            loading={isExporting}
            icon={Download}
          >
            Export .ICS
          </Button>
        </div>
      </div>

      {/* 2. Calendar Timeline List */}
      <div className={`p-6 rounded-[16px] border ${
        isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-sm font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
            Scheduled Cash Movements ({monthNames[currentMonthIndex]})
          </h3>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#3F8F5E]" />
              <span className={isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}>Green = Incoming</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#A77B58]" />
              <span className={isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}>Brown = Planned Outflow</span>
            </div>
          </div>
        </div>

        <div className="divide-y divide-[#E4E8E3]/20 -mx-3">
          {displayEvents.map((item, idx) => (
            <div key={idx} className="p-4 flex items-center justify-between text-xs">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-[10px] flex flex-col items-center justify-center font-bold border ${
                  item.type === 'income'
                    ? isDark ? 'bg-[#1C251F] text-[#7FC39A] border-[#5BAE78]/30' : 'bg-[#E2F1E8] text-[#285A3A] border-[#C6E4D2]'
                    : isDark ? 'bg-[#1C251F] text-[#D5B99D] border-[#A77B58]/30' : 'bg-[#F2E8DC] text-[#694A36] border-[#E5D4C1]'
                }`}>
                  <span className="text-base leading-none">{item.day}</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold">Aug</span>
                </div>

                <div>
                  <h4 className="font-bold text-xs">{item.title}</h4>
                  <p className={`text-[11px] mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                    {item.detail}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <div className={`tabular-nums font-bold text-sm ${
                  item.type === 'income' ? 'text-[#3F8F5E]' : ''
                }`}>
                  {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
                </div>
                <Badge variant={item.type === 'income' ? 'positive' : 'brown'} size="xs" className="mt-1">
                  {item.type === 'income' ? 'CREDIT' : 'PLANNED'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
