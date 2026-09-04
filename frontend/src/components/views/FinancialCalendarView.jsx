import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
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
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Sparkles,
  Layers
} from 'lucide-react';

export const FinancialCalendarView = () => {
  const { theme } = useTheme();
  const { token, API_BASE_URL, authFetch, transactions } = useFinance();
  const isDark = theme === 'dark';

  const [viewMode, setViewMode] = useState('month'); // 'month' | 'planner'
  const [calendarData, setCalendarData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [currentMonthIndex, setCurrentMonthIndex] = useState(() => new Date().getMonth());
  const currentYear = new Date().getFullYear();

  const monthNames = [
    `January ${currentYear}`, `February ${currentYear}`, `March ${currentYear}`, `April ${currentYear}`,
    `May ${currentYear}`, `June ${currentYear}`, `July ${currentYear}`, `August ${currentYear}`,
    `September ${currentYear}`, `October ${currentYear}`, `November ${currentYear}`, `December ${currentYear}`
  ];

  const monthKey = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;

  // Selected day for the detailed transaction drawer
  const [selectedDayDate, setSelectedDayDate] = useState(null);

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

  // Group real transactions by date
  const txsByDate = useMemo(() => {
    const map = {};
    (transactions || []).forEach(t => {
      if (!t.date) return;
      const dateStr = t.date.substring(0, 10);
      if (!map[dateStr]) {
        map[dateStr] = { items: [], income: 0, expense: 0, count: 0 };
      }
      const amt = parseFloat(t.amount || 0);
      const isIncome = t.flow === 'INFLOW' || t.type === 'CREDIT' || amt > 0;
      const isTransfer = t.category === 'Transfer' || t.type === 'TRANSFER';

      if (isIncome && !isTransfer) {
        map[dateStr].income += Math.abs(amt);
      } else if (!isIncome && !isTransfer) {
        map[dateStr].expense += Math.abs(amt);
      }
      map[dateStr].count += 1;
      map[dateStr].items.push(t);
    });
    return map;
  }, [transactions]);

  // Group planned obligations by day number (1..31)
  const obligationsByDay = useMemo(() => {
    const map = {};
    displayEvents.forEach(e => {
      const d = parseInt(e.day, 10);
      if (!map[d]) map[d] = [];
      map[d].push(e);
    });
    return map;
  }, [displayEvents]);

  // Calendar Grid Computation for Current Month
  const calendarGrid = useMemo(() => {
    const year = currentYear;
    const month = currentMonthIndex; // 0-indexed
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun, 1 = Mon ...
    const daysInMonth = new Date(year, month + 1, 0).getDate(); // 28, 30, 31
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells = [];

    // Trailing days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      cells.push({
        dayNumber: dayNum,
        isCurrentMonth: false,
        dateStr: null
      });
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = txsByDate[dateStr] || { items: [], income: 0, expense: 0, count: 0 };
      const obligations = obligationsByDay[d] || [];

      cells.push({
        dayNumber: d,
        isCurrentMonth: true,
        dateStr,
        ...dayData,
        obligations
      });
    }

    // Pad remaining cells to complete grid row
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let j = 1; j <= remaining; j++) {
        cells.push({
          dayNumber: j,
          isCurrentMonth: false,
          dateStr: null
        });
      }
    }

    return cells;
  }, [currentMonthIndex, currentYear, txsByDate, obligationsByDay]);

  // Month-level transaction summary
  const monthSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    let count = 0;
    Object.keys(txsByDate).forEach(dateStr => {
      if (dateStr.startsWith(monthKey)) {
        income += txsByDate[dateStr].income;
        expense += txsByDate[dateStr].expense;
        count += txsByDate[dateStr].count;
      }
    });
    return { income, expense, net: income - expense, count };
  }, [txsByDate, monthKey]);

  // Data for the active inspector day
  const selectedDayData = useMemo(() => {
    if (!selectedDayDate) return null;
    const txData = txsByDate[selectedDayDate] || { items: [], income: 0, expense: 0, count: 0 };
    const dayNum = parseInt(selectedDayDate.split('-')[2], 10);
    const obligations = obligationsByDay[dayNum] || [];
    return {
      dateStr: selectedDayDate,
      dayNum,
      ...txData,
      obligations
    };
  }, [selectedDayDate, txsByDate, obligationsByDay]);

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6 animate-in fade-in duration-200 pb-12">
      
      {/* 1. Header with View Mode Toggle, Month Stepper & Export */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E4E8E3]/30">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
              Financial Calendar
            </h2>
            <Badge variant="brand" size="xs">
              {viewMode === 'month' ? 'Month View' : 'Planner View'}
            </Badge>
          </div>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            {viewMode === 'month'
              ? 'Day-by-day transaction flow, daily spending intensity, and scheduled obligations'
              : 'Forward-looking timeline of payroll, credit card due dates, and recurring SIPs'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Switcher */}
          <div className={`flex items-center p-1 rounded-xl border text-xs font-semibold ${
            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
          }`}>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer border-0 ${
                viewMode === 'month'
                  ? isDark ? 'bg-[#2A352D] text-[#7FC39A]' : 'bg-[#E2F1E8] text-[#285A3A]'
                  : 'bg-transparent text-[#8B978F] hover:text-foreground'
              }`}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              <span>Month View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('planner')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer border-0 ${
                viewMode === 'planner'
                  ? isDark ? 'bg-[#2A352D] text-[#D5B99D]' : 'bg-[#F2E8DC] text-[#694A36]'
                  : 'bg-transparent text-[#8B978F] hover:text-foreground'
              }`}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              <span>Planner View</span>
            </button>
          </div>

          {/* Month Stepper */}
          <div className={`flex items-center p-0.5 rounded-xl border text-xs ${
            isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
          }`}>
            <button
              type="button"
              onClick={() => {
                setCurrentMonthIndex(i => Math.max(0, i - 1));
                setSelectedDayDate(null);
              }}
              disabled={currentMonthIndex <= 0}
              className="p-1.5 rounded-lg text-[#8B978F] hover:text-foreground border-0 bg-transparent cursor-pointer disabled:opacity-30"
              title="Previous Month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 font-semibold select-none">{monthNames[currentMonthIndex]}</span>
            <button
              type="button"
              onClick={() => {
                setCurrentMonthIndex(i => Math.min(monthNames.length - 1, i + 1));
                setSelectedDayDate(null);
              }}
              disabled={currentMonthIndex >= monthNames.length - 1}
              className="p-1.5 rounded-lg text-[#8B978F] hover:text-foreground border-0 bg-transparent cursor-pointer disabled:opacity-30"
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

      {/* 2. Month-Level Summary KPI Strip */}
      <div className={`px-5 py-3 rounded-2xl border flex flex-wrap items-center justify-between gap-4 text-xs ${
        isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
            Activity in {monthNames[currentMonthIndex]}:
          </span>
          <span className="font-bold">{monthSummary.count} transactions recorded</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <span className="text-[#8B978F]">Inflows:</span>
            <span className="font-semibold text-[#3F8F5E] tabular-nums">
              +{formatCurrency(monthSummary.income)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[#8B978F]">Outflows:</span>
            <span className={`font-semibold tabular-nums ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
              -{formatCurrency(monthSummary.expense)}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-[#8B978F]">Net Savings:</span>
            <span className={`font-bold tabular-nums ${monthSummary.net >= 0 ? 'text-[#3F8F5E]' : 'text-[#C85C5C]'}`}>
              {monthSummary.net >= 0 ? '+' : ''}{formatCurrency(monthSummary.net)}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Main View Render: Month Grid vs. Planner Timeline */}
      {viewMode === 'month' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 7-Column Interactive Month Grid */}
          <div className={`${selectedDayData ? 'lg:col-span-8' : 'lg:col-span-12'} rounded-2xl border overflow-hidden transition-all duration-200 ${
            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
          }`}>
            {/* Weekdays Header */}
            <div className={`grid grid-cols-7 border-b text-[11px] font-bold uppercase tracking-wider text-center py-2.5 ${
              isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#8B978F]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#7B877F]'
            }`}>
              {weekdays.map((day, idx) => (
                <div key={day} className={idx === 0 || idx === 6 ? 'text-amber-500/80' : ''}>
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Day Cells */}
            <div className="grid grid-cols-7 divide-x divide-y divide-[#E4E8E3]/20">
              {calendarGrid.map((cell, idx) => {
                if (!cell.isCurrentMonth) {
                  return (
                    <div 
                      key={idx} 
                      className={`min-h-[105px] sm:min-h-[120px] p-2 opacity-25 select-none ${
                        isDark ? 'bg-[#111713]/40' : 'bg-[#F7F8F5]/50'
                      }`}
                    >
                      <span className="text-xs font-semibold">{cell.dayNumber}</span>
                    </div>
                  );
                }

                const isSelected = selectedDayDate === cell.dateStr;
                const hasActivity = cell.count > 0 || cell.obligations?.length > 0;

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedDayDate(isSelected ? null : cell.dateStr)}
                    className={`min-h-[105px] sm:min-h-[120px] p-2 transition-all flex flex-col justify-between cursor-pointer group ${
                      isSelected
                        ? isDark ? 'bg-[#1C251F] ring-2 ring-[#5BAE78] ring-inset' : 'bg-[#E2F1E8]/50 ring-2 ring-[#3F8F5E] ring-inset'
                        : isDark ? 'hover:bg-[#1C251F]/70' : 'hover:bg-[#F1F8F4]/50'
                    }`}
                  >
                    {/* Cell Top: Day number + Activity badge */}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                        isSelected
                          ? 'bg-[#3F8F5E] text-white'
                          : isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'
                      }`}>
                        {cell.dayNumber}
                      </span>

                      {cell.count > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          isDark ? 'bg-white/10 text-[#C2CCC5]' : 'bg-black/5 text-[#4F5D55]'
                        }`}>
                          {cell.count} txn{cell.count > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Cell Body: Planned Obligations & Daily Totals */}
                    <div className="space-y-1 my-1">
                      {/* Planned Obligations Pins */}
                      {cell.obligations && cell.obligations.slice(0, 1).map((ob, oIdx) => (
                        <div
                          key={oIdx}
                          className="truncate text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#A77B58]/15 text-[#D5B99D] border border-[#A77B58]/30 flex items-center gap-1"
                          title={`${ob.title}: ₹${ob.amount}`}
                        >
                          <Clock className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{ob.title}</span>
                        </div>
                      ))}

                      {/* Daily Income badge */}
                      {cell.income > 0 && (
                        <div className="text-[10px] font-bold text-[#3F8F5E] truncate tabular-nums flex items-center gap-0.5">
                          <ArrowDownLeft className="h-2.5 w-2.5 shrink-0" />
                          <span>+{formatCurrency(cell.income)}</span>
                        </div>
                      )}

                      {/* Daily Expense badge */}
                      {cell.expense > 0 && (
                        <div className={`text-[10px] font-bold truncate tabular-nums flex items-center gap-0.5 ${
                          isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'
                        }`}>
                          <ArrowUpRight className="h-2.5 w-2.5 shrink-0 text-[#C85C5C]" />
                          <span>-{formatCurrency(cell.expense)}</span>
                        </div>
                      )}
                    </div>

                    {/* Cell Bottom: Click hint */}
                    <div className="text-[9px] text-[#8B978F] opacity-0 group-hover:opacity-100 transition-opacity text-right">
                      {hasActivity ? 'Inspect →' : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day Inspector Drawer / Side Panel */}
          {selectedDayData && (
            <div className="lg:col-span-4 rounded-2xl border p-5 flex flex-col h-full animate-in slide-in-from-right duration-200 ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-sm'
            }">
              {/* Day Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#E4E8E3]/30">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#3F8F5E]">
                    Day Breakdown
                  </span>
                  <h3 className={`text-base font-bold ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
                    {formatDate(selectedDayData.dateStr)}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDayDate(null)}
                  className="p-1 rounded-lg text-[#8B978F] hover:text-foreground bg-transparent border-0 cursor-pointer"
                  title="Close Inspector"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Day Summary Cards */}
              <div className="grid grid-cols-2 gap-2 my-4">
                <div className={`p-3 rounded-xl border ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}>
                  <span className="text-[10px] text-[#8B978F] font-medium block">Total Spent</span>
                  <span className="text-sm font-bold text-[#C85C5C] tabular-nums">
                    -{formatCurrency(selectedDayData.expense)}
                  </span>
                </div>
                <div className={`p-3 rounded-xl border ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}>
                  <span className="text-[10px] text-[#8B978F] font-medium block">Total Inflow</span>
                  <span className="text-sm font-bold text-[#3F8F5E] tabular-nums">
                    +{formatCurrency(selectedDayData.income)}
                  </span>
                </div>
              </div>

              {/* Scheduled Obligations for this day */}
              {selectedDayData.obligations?.length > 0 && (
                <div className="mb-4 space-y-2">
                  <span className="text-[11px] font-bold text-[#D5B99D] uppercase tracking-wider">
                    Scheduled Obligations ({selectedDayData.obligations.length})
                  </span>
                  {selectedDayData.obligations.map((ob, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                        isDark ? 'bg-[#A77B58]/10 border-[#A77B58]/30' : 'bg-[#F2E8DC] border-[#E5D4C1]'
                      }`}
                    >
                      <div>
                        <div className="font-bold">{ob.title}</div>
                        <div className="text-[10px] text-[#8B978F]">{ob.detail}</div>
                      </div>
                      <span className="font-bold tabular-nums">₹{formatCurrency(ob.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Transactions List */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8B978F]">
                  Transactions ({selectedDayData.items.length})
                </span>

                {selectedDayData.items.length === 0 ? (
                  <div className="text-center py-8 text-xs text-[#8B978F]">
                    No transactions recorded on this date.
                  </div>
                ) : (
                  selectedDayData.items.map((tx) => {
                    const amt = parseFloat(tx.amount || 0);
                    const isCredit = tx.flow === 'INFLOW' || tx.type === 'CREDIT' || amt > 0;
                    return (
                      <div
                        key={tx.id}
                        className={`p-3 rounded-xl border transition-colors ${
                          isDark ? 'bg-[#1C251F]/70 border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-xs truncate">
                              {tx.description || tx.raw_narration || 'Transaction'}
                            </h4>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                              {tx.category && (
                                <Badge variant="secondary" size="xs">
                                  {tx.category}
                                </Badge>
                              )}
                              {tx.payment_rail && (
                                <span className="text-[#8B978F]">
                                  via {tx.payment_rail}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className={`text-xs font-bold tabular-nums shrink-0 ${
                            isCredit ? 'text-[#3F8F5E]' : ''
                          }`}>
                            {isCredit ? '+' : '-'}{formatCurrency(Math.abs(amt))}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 4. Planner View Timeline (Scheduled Obligations) */
        <div className={`p-6 rounded-2xl border ${
          isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
              Scheduled Cash Movements ({monthNames[currentMonthIndex]})
            </h3>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#3F8F5E]" />
                <span className={isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}>Green = Expected Inflow</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#A77B58]" />
                <span className={isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}>Brown = Planned Mandate</span>
              </div>
            </div>
          </div>

          <div className="divide-y divide-[#E4E8E3]/20 -mx-3">
            {displayEvents.map((item, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold border ${
                    item.type === 'income'
                      ? isDark ? 'bg-[#1C251F] text-[#7FC39A] border-[#5BAE78]/30' : 'bg-[#E2F1E8] text-[#285A3A] border-[#C6E4D2]'
                      : isDark ? 'bg-[#1C251F] text-[#D5B99D] border-[#A77B58]/30' : 'bg-[#F2E8DC] text-[#694A36] border-[#E5D4C1]'
                  }`}>
                    <span className="text-base leading-none">{item.day}</span>
                    <span className="text-[9px] uppercase tracking-wider font-semibold">
                      {monthNames[currentMonthIndex].substring(0, 3)}
                    </span>
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
      )}

    </div>
  );
};

export default FinancialCalendarView;
