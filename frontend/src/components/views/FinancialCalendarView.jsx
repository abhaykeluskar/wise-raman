import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../utils/formatters';
import { 
  Calendar as CalendarIcon, 
  Download, 
  CalendarClock, 
  AlertCircle, 
  CheckCircle2, 
  CreditCard, 
  TrendingUp, 
  TrendingDown, 
  ShieldAlert, 
  Landmark, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  Copy,
  Check
} from 'lucide-react';

export const FinancialCalendarView = () => {
  const { style, theme } = useTheme();
  const { token, API_BASE_URL } = useFinance();

  const [calendarData, setCalendarData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [selectedDay, setSelectedDay] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }), [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const apiBase = API_BASE_URL || '';
    fetch(`${apiBase}/api/analytics/financial-calendar`, { headers: fetchHeaders })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setCalendarData(data);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [token, API_BASE_URL, fetchHeaders]);

  const handleExportIcs = async () => {
    if (!token) return;
    setIsExporting(true);
    try {
      const apiBase = API_BASE_URL || '';
      const response = await fetch(`${apiBase}/api/analytics/financial-calendar/export-ics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Failed to export ICS");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wiseraman_financial_calendar.ics';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyFeedUrl = () => {
    const apiBase = API_BASE_URL || window.location.origin;
    const url = `${apiBase}/api/analytics/financial-calendar/export-ics`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const filterTabs = [
    { key: 'ALL', label: 'All Obligations' },
    { key: 'SUBSCRIPTION', label: 'Subscriptions' },
    { key: 'CREDIT_CARD_DUE', label: 'Card Dues' },
    { key: 'LOAN_EMI', label: 'Loans & EMI' },
    { key: 'MANDATE', label: 'AutoPay & Mandates' },
    { key: 'INSURANCE_RENEWAL', label: 'Insurance' },
    { key: 'SALARY_CREDIT', label: 'Inflows' },
    { key: 'TAX_DEADLINE', label: 'Tax Deadlines' }
  ];

  const events = calendarData?.events || [];

  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      const matchesFilter = activeFilter === 'ALL' || ev.type === activeFilter;
      const matchesDay = selectedDay === null || ev.day === selectedDay;
      return matchesFilter && matchesDay;
    });
  }, [events, activeFilter, selectedDay]);

  // Calendar Matrix Computation
  const today = new Date();
  const currentYear = calendarData?.year || today.getFullYear();
  const currentMonth = (calendarData?.month_index ? calendarData.month_index - 1 : today.getMonth());
  const todayDate = today.getDate();

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun
  // Adjust to Monday = 0
  const startOffset = (firstDayOfWeek + 6) % 7;

  const eventMap = useMemo(() => {
    const map = {};
    events.forEach(ev => {
      if (!map[ev.day]) map[ev.day] = [];
      map[ev.day].push(ev);
    });
    return map;
  }, [events]);

  const getUrgencyBadge = (urgency) => {
    switch (urgency) {
      case 'TODAY':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">Due Today</span>;
      case 'URGENT':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">Due in ≤3 Days</span>;
      case 'SOON':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">Due in ≤7 Days</span>;
      case 'PAST':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-700/40 text-slate-400">Processed / Past</span>;
      default:
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#5EEAD4]/15 text-[#5EEAD4] border border-[#5EEAD4]/30">Upcoming</span>;
    }
  };

  const getEventIcon = (type) => {
    switch (type) {
      case 'SUBSCRIPTION':
        return <CalendarClock className="h-4 w-4 text-[#5EEAD4]" />;
      case 'CREDIT_CARD_DUE':
        return <CreditCard className="h-4 w-4 text-rose-400" />;
      case 'LOAN_EMI':
        return <Landmark className="h-4 w-4 text-amber-400" />;
      case 'INSURANCE_RENEWAL':
        return <ShieldAlert className="h-4 w-4 text-blue-400" />;
      case 'MANDATE':
        return <Sparkles className="h-4 w-4 text-purple-400" />;
      case 'SALARY_CREDIT':
        return <TrendingUp className="h-4 w-4 text-emerald-400" />;
      case 'TAX_DEADLINE':
        return <AlertCircle className="h-4 w-4 text-orange-400" />;
      default:
        return <CalendarIcon className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 pb-16">
      
      {/* Header Banner */}
      <div className={`p-5 sm:p-6 rounded-3xl border-0 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-2xl flex items-center justify-center ${style('neu-flat-dark text-[#5EEAD4]', 'neu-flat-light text-[#0F766E]')}`}>
            <CalendarClock className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${style('text-[#F4F7FA]', 'text-[#17202A]')}`}>
                Financial Calendar & Alerts
              </h1>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#5EEAD4]/15 text-[#5EEAD4] border border-[#5EEAD4]/30">
                Live Horizon
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Live schedule of subscriptions, credit card dues, loan EMIs, insurance renewals, and statutory Indian tax alerts.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleCopyFeedUrl}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border-0 cursor-pointer flex items-center gap-1.5 transition-all ${style('neu-btn-dark text-slate-300 hover:text-[#5EEAD4]', 'neu-btn-light text-slate-700 hover:text-[#0F766E]')}`}
            title="Copy Calendar Subscription Feed URL"
          >
            {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedLink ? 'Feed URL Copied' : 'Copy Feed'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportIcs}
            disabled={isExporting || loading}
            className={`px-4 py-2 rounded-xl text-xs font-bold border-0 cursor-pointer flex items-center gap-1.5 transition-all ${style('neu-btn-dark text-[#5EEAD4] hover:shadow-[0_0_15px_rgba(94,234,212,0.25)]', 'neu-btn-light text-[#0F766E]')}`}
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isExporting ? 'Exporting...' : 'Export to .ICS'}</span>
          </button>
        </div>
      </div>

      {/* Liquidity Alert Banner (If Applicable) */}
      {calendarData?.liquidity_alert && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 border ${
          calendarData.liquidity_alert.severity === 'CRITICAL' 
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' 
            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
        }`}>
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-xs font-semibold">{calendarData.liquidity_alert.message}</span>
        </div>
      )}

      {/* Monthly Cash Flow Metric Horizon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`p-5 rounded-3xl border-0 flex flex-col justify-between ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Scheduled Inflows</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <h3 className="text-2xl font-black text-emerald-400 mt-2">
            +{formatCurrency(calendarData?.total_scheduled_inflows || 0)}
          </h3>
          <span className="text-[11px] text-slate-400 mt-1">Salary & recurring credits</span>
        </div>

        <div className={`p-5 rounded-3xl border-0 flex flex-col justify-between ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Scheduled Outflows</span>
            <TrendingDown className="h-4 w-4 text-rose-400" />
          </div>
          <h3 className="text-2xl font-black text-rose-400 mt-2">
            -{formatCurrency(calendarData?.total_scheduled_outflows || 0)}
          </h3>
          <span className="text-[11px] text-slate-400 mt-1">Rent, cards, loans & subscriptions</span>
        </div>

        <div className={`p-5 rounded-3xl border-0 flex flex-col justify-between ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Projected Month-End</span>
            <Sparkles className="h-4 w-4 text-[#5EEAD4]" />
          </div>
          <h3 className={`text-2xl font-black mt-2 ${(calendarData?.projected_month_end_balance || 0) >= 0 ? 'text-[#5EEAD4]' : 'text-rose-400'}`}>
            {formatCurrency(calendarData?.projected_month_end_balance || 0)}
          </h3>
          <span className="text-[11px] text-slate-400 mt-1">
            Net Surplus: {formatCurrency(calendarData?.net_monthly_surplus || 0)}
          </span>
        </div>

        <div className={`p-5 rounded-3xl border-0 flex flex-col justify-between ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Urgent Alerts (≤3d)</span>
            <AlertCircle className="h-4 w-4 text-amber-400" />
          </div>
          <h3 className="text-2xl font-black text-amber-400 mt-2">
            {calendarData?.urgent_events_count || 0}
          </h3>
          <span className="text-[11px] text-slate-400 mt-1">
            {events.length} total monthly obligations
          </span>
        </div>
      </div>

      {/* Main Grid: Interactive Calendar & Event Horizon */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Interactive Month Matrix (5 cols) */}
        <div className={`lg:col-span-5 p-5 sm:p-6 rounded-3xl border-0 flex flex-col gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-[#5EEAD4]" />
              <h3 className={`text-sm font-bold uppercase tracking-wider ${style('text-[#F4F7FA]', 'text-[#17202A]')}`}>
                {calendarData?.month || 'Current Month'}
              </h3>
            </div>
            {selectedDay !== null && (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="text-[11px] font-bold text-[#5EEAD4] hover:underline cursor-pointer border-0 bg-transparent"
              >
                Clear Day Filter
              </button>
            )}
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
            <div>Sun</div>
          </div>

          {/* Day Grid Cells */}
          <div className="grid grid-cols-7 gap-1.5">
            {/* Empty Offset cells */}
            {Array.from({ length: startOffset }).map((_, idx) => (
              <div key={`offset-${idx}`} className="h-10 sm:h-12 rounded-xl opacity-10"></div>
            ))}

            {/* Days in Month */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const isToday = dayNum === todayDate;
              const isSelected = selectedDay === dayNum;
              const dayEvents = eventMap[dayNum] || [];
              const hasEvents = dayEvents.length > 0;
              const hasInflow = dayEvents.some(e => e.is_inflow);
              const hasOutflow = dayEvents.some(e => !e.is_inflow);

              return (
                <button
                  key={`day-${dayNum}`}
                  type="button"
                  onClick={() => setSelectedDay(isSelected ? null : dayNum)}
                  className={`h-10 sm:h-12 rounded-xl p-1 flex flex-col items-center justify-between border-0 cursor-pointer transition-all ${
                    isSelected
                      ? style('neu-inset-dark ring-2 ring-[#5EEAD4] bg-[#5EEAD4]/10', 'neu-inset-light ring-2 ring-[#0F766E] bg-teal-50')
                      : isToday
                      ? style('neu-flat-dark ring-1 ring-emerald-500/50', 'neu-flat-light ring-1 ring-emerald-500/50')
                      : style('neu-inset-dark hover:bg-slate-800/40', 'neu-inset-light hover:bg-slate-100')
                  }`}
                >
                  <span className={`text-xs font-bold ${
                    isToday 
                      ? 'text-emerald-400 font-black' 
                      : isSelected 
                      ? 'text-[#5EEAD4]' 
                      : style('text-slate-300', 'text-slate-700')
                  }`}>
                    {dayNum}
                  </span>

                  {/* Indicator Dots */}
                  <div className="flex items-center gap-0.5 justify-center">
                    {hasInflow && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    {hasOutflow && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
                    {dayEvents.some(e => e.type === 'TAX_DEADLINE') && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="pt-3 border-t border-slate-700/20 flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Income</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>Dues / Outflow</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              <span>Tax Deadline</span>
            </div>
          </div>
        </div>

        {/* Right Column: Filterable Event List & Timeline (7 cols) */}
        <div className={`lg:col-span-7 p-5 sm:p-6 rounded-3xl border-0 flex flex-col gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
          
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
            {filterTabs.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveFilter(t.key)}
                className={`px-3 py-1.5 rounded-xl text-xxs font-bold uppercase tracking-wider whitespace-nowrap transition-all border-0 cursor-pointer ${
                  activeFilter === t.key
                    ? style(
                        'neu-flat-dark text-[#5EEAD4] shadow-[0_0_10px_rgba(94,234,212,0.15)]',
                        'bg-[#5EEAD4] text-[#0A0E14]',
                        'neu-flat-light text-[#0F766E]',
                        'bg-[#0F766E] text-white'
                      )
                    : style('text-slate-400 hover:text-slate-200', 'text-slate-600 hover:text-slate-900')
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Event Stream */}
          <div className="flex flex-col gap-3 flex-1 overflow-y-auto max-h-[500px] pr-1 custom-scrollbar">
            {filteredEvents.length > 0 ? (
              filteredEvents.map(ev => (
                <div
                  key={ev.id}
                  className={`p-4 rounded-2xl flex items-center justify-between border-0 transition-all ${style('neu-inset-dark', 'neu-inset-light')}`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`p-2.5 rounded-xl shrink-0 flex items-center justify-center ${style('bg-[#151A22]', 'bg-white shadow-sm')}`}>
                      {getEventIcon(ev.type)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-bold truncate ${style('text-[#F4F7FA]', 'text-[#17202A]')}`}>
                          {ev.title}
                        </span>
                        {getUrgencyBadge(ev.urgency)}
                      </div>
                      <div className="flex items-center gap-2 text-xxs text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                        <span>Day {ev.day} ({new Date(ev.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})</span>
                        <span>•</span>
                        <span>{ev.category}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-3">
                    <div className={`text-sm font-black tabular-nums ${ev.is_inflow ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {ev.amount > 0 ? (ev.is_inflow ? `+${formatCurrency(ev.amount)}` : `-${formatCurrency(ev.amount)}`) : 'Statutory'}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-slate-500 italic">
                <CalendarClock className="h-8 w-8 mb-2 opacity-40" />
                No obligations or alerts found matching the active filter.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
