import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency, maskAccountNumber } from '../../utils/formatters';
import { Badge } from '../atoms/Badge';
import { 
  Briefcase, 
  TrendingUp, 
  TrendingDown, 
  Landmark, 
  Receipt, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Filter, 
  Calendar, 
  Building2, 
  User, 
  CreditCard, 
  Percent, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowRight, 
  ChevronLeft, 
  ChevronRight,
  Wallet,
  PiggyBank,
  Sparkles,
  Layers,
  X
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line
} from 'recharts';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

import { useFinance } from '../../context/FinanceContext';

export const PayslipsView = () => {
  const { theme, style } = useTheme();
  const { authFetch } = useFinance();
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);

  // Expand / Collapse State
  const [expandedIds, setExpandedIds] = useState({});

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployer, setSelectedEmployer] = useState('ALL');
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [sortBy, setSortBy] = useState('newest'); // newest, oldest, highest_net, highest_gross

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => {
    const fetchPayslips = async () => {
      try {
        const res = await authFetch('/api/payslips');
        if (res.ok) {
          const data = await res.json();
          setPayslips(data);
        }
      } catch (err) {
        console.error("Failed to fetch payslips", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPayslips();
  }, []);

  const toggleExpand = (id) => {
    setExpandedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const expandAll = () => {
    const nextState = {};
    filteredAndSortedPayslips.forEach(p => {
      nextState[p.id] = true;
    });
    setExpandedIds(nextState);
  };

  const collapseAll = () => {
    setExpandedIds({});
  };

  // Available employers and years for filter dropdowns
  const employers = useMemo(() => {
    const set = new Set();
    payslips.forEach(p => {
      if (p.company_name) set.add(p.company_name.trim());
    });
    return Array.from(set).sort();
  }, [payslips]);

  const years = useMemo(() => {
    const set = new Set();
    payslips.forEach(p => {
      if (p.period_year) set.add(p.period_year);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [payslips]);

  // Overall Stats
  const stats = useMemo(() => {
    const totalNet = payslips.reduce((acc, p) => acc + (parseFloat(p.net_pay) || 0), 0);
    const totalGross = payslips.reduce((acc, p) => acc + (parseFloat(p.gross_earnings) || 0), 0);
    const totalTds = payslips.reduce((acc, p) => acc + (parseFloat(p.income_tax_tds) || 0), 0);
    const totalPt = payslips.reduce((acc, p) => acc + (parseFloat(p.professional_tax) || 0), 0);
    const totalTaxes = totalTds + totalPt;
    const totalPf = payslips.reduce((acc, p) => acc + (parseFloat(p.provident_fund) || 0), 0);
    const avgMonthlyNet = payslips.length > 0 ? totalNet / payslips.length : 0;

    return { totalNet, totalGross, totalTaxes, totalTds, totalPt, totalPf, avgMonthlyNet };
  }, [payslips]);

  // Chart Data (Chronological)
  const chartData = useMemo(() => {
    const sorted = [...payslips].sort((a, b) => {
      if (a.period_year !== b.period_year) return a.period_year - b.period_year;
      return a.period_month - b.period_month;
    });

    return sorted.map(p => ({
      name: `${MONTH_NAMES[p.period_month - 1]?.slice(0, 3)} '${String(p.period_year).slice(-2)}`,
      grossEarnings: parseFloat(p.gross_earnings) || 0,
      netPay: parseFloat(p.net_pay) || 0,
      taxes: (parseFloat(p.income_tax_tds) || 0) + (parseFloat(p.professional_tax) || 0),
      pf: parseFloat(p.provident_fund) || 0
    }));
  }, [payslips]);

  // Filtering & Sorting
  const filteredAndSortedPayslips = useMemo(() => {
    let list = [...payslips];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p => {
        const company = (p.company_name || '').toLowerCase();
        const empName = (p.employee_name || '').toLowerCase();
        const empId = (p.employee_id || '').toLowerCase();
        const monthName = (MONTH_NAMES[p.period_month - 1] || '').toLowerCase();
        const yearStr = String(p.period_year);
        const periodStr = `${monthName} ${yearStr}`;

        return company.includes(q) || empName.includes(q) || empId.includes(q) || periodStr.includes(q);
      });
    }

    // Employer filter
    if (selectedEmployer !== 'ALL') {
      list = list.filter(p => p.company_name === selectedEmployer);
    }

    // Year filter
    if (selectedYear !== 'ALL') {
      list = list.filter(p => String(p.period_year) === String(selectedYear));
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'newest') {
        if (a.period_year !== b.period_year) return b.period_year - a.period_year;
        return b.period_month - a.period_month;
      }
      if (sortBy === 'oldest') {
        if (a.period_year !== b.period_year) return a.period_year - b.period_year;
        return a.period_month - b.period_month;
      }
      if (sortBy === 'highest_net') {
        return (parseFloat(b.net_pay) || 0) - (parseFloat(a.net_pay) || 0);
      }
      if (sortBy === 'highest_gross') {
        return (parseFloat(b.gross_earnings) || 0) - (parseFloat(a.gross_earnings) || 0);
      }
      return 0;
    });

    return list;
  }, [payslips, searchQuery, selectedEmployer, selectedYear, sortBy]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedEmployer, selectedYear, sortBy, pageSize]);

  // Paginated Slices
  const totalItems = filteredAndSortedPayslips.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedPayslips = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedPayslips.slice(start, start + pageSize);
  }, [filteredAndSortedPayslips, currentPage, pageSize]);

  const hasActiveFilters = searchQuery.trim() !== '' || selectedEmployer !== 'ALL' || selectedYear !== 'ALL' || sortBy !== 'newest';

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedEmployer('ALL');
    setSelectedYear('ALL');
    setSortBy('newest');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className={`p-2.5 rounded-2xl flex items-center justify-center ${style('neu-flat-dark text-[#5EEAD4]', 'neu-flat-light text-[#0F766E]')}`}>
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Income & Payslips</h1>
              <p className="text-xs text-slate-400 font-medium">Detailed salary structures, tax deductions & verified bank linkage</p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={`p-12 rounded-3xl flex flex-col items-center justify-center ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5EEAD4] mb-3"></div>
          <span className="text-xs font-semibold text-slate-400">Loading verified payslips...</span>
        </div>
      ) : payslips.length === 0 ? (
        <div className={`p-12 rounded-3xl flex flex-col items-center justify-center text-center space-y-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className={`p-5 rounded-2xl ${style('neu-inset-dark', 'neu-inset-light')}`}>
            <Briefcase className="h-10 w-10 text-slate-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold">No payslips found</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed">
              Upload your salary payslip PDF via the <strong className="text-slate-200">Import Statement</strong> button in the top navigation to analyze your earnings, PF, and tax deductions.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Main Content Dashboard */}
          {!loading && (
            <div className="space-y-6">
              {/* Executive Summary Metrics Deck */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`p-5 rounded-3xl transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Compensation</span>
                    <div className={`p-2 rounded-xl ${style('neu-inset-dark', 'neu-inset-light')}`}>
                      <Briefcase className="h-4 w-4 text-emerald-400" />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-emerald-400">{formatCurrency(stats.totalGross, true, false)}</p>
                  <div className="text-[11px] text-slate-400 mt-1 font-medium">
                    {payslips.length} pay cycles recorded
                  </div>
                </div>
                
                <div className={`p-5 rounded-3xl transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Take-Home Pay</span>
                    <div className={`p-2 rounded-xl ${style('neu-inset-dark', 'neu-inset-light')}`}>
                      <Wallet className="h-4 w-4 text-[#5EEAD4]" />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-[#5EEAD4]">{formatCurrency(stats.totalNet, true, false)}</p>
                  <div className="text-[11px] text-slate-400 mt-1 font-medium">
                    Avg: {formatCurrency(stats.avgMonthlyNet, false, false)} / month
                  </div>
                </div>

                <div className={`p-5 rounded-3xl transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Taxes Paid</span>
                    <div className={`p-2 rounded-xl ${style('neu-inset-dark', 'neu-inset-light')}`}>
                      <Receipt className="h-4 w-4 text-rose-400" />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-rose-400">{formatCurrency(stats.totalTaxes, true, false)}</p>
                  <div className="text-[11px] text-slate-400 mt-1 font-medium">
                    TDS: {formatCurrency(stats.totalTds, false, false)} | PT: {formatCurrency(stats.totalPt, false, false)}
                  </div>
                </div>

                <div className={`p-5 rounded-3xl transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Provident Fund (PF)</span>
                    <div className={`p-2 rounded-xl ${style('neu-inset-dark', 'neu-inset-light')}`}>
                      <PiggyBank className="h-4 w-4 text-purple-400" />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-purple-400">{formatCurrency(stats.totalPf, true, false)}</p>
                  <div className="text-[11px] text-slate-400 mt-1 font-medium">
                    Accumulated employee PF corpus
                  </div>
                </div>
              </div>

              {/* Visual Analytics Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={`p-5 rounded-3xl ${style('neu-flat-dark', 'neu-flat-light')}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold">Gross vs Net Take-Home Trajectory</h3>
                      <p className="text-[11px] text-slate-400">Monthly compensation and in-hand salary trends</p>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#19202A' : '#e0e0e0'} vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: theme === 'dark' ? '#888' : '#666' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: theme === 'dark' ? '#888' : '#666' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: theme === 'dark' ? '#151A22' : '#fff', 
                            borderRadius: '12px', 
                            border: '1px solid #27313D', 
                            boxShadow: '0 8px 16px -4px rgb(0 0 0 / 0.3)' 
                          }}
                          itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                          formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, '']}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Bar dataKey="grossEarnings" name="Gross Earnings" fill={theme === 'dark' ? '#19202A' : '#CBD5E1'} radius={[6, 6, 0, 0]} />
                        <Bar dataKey="netPay" name="Net Pay" fill="#34D399" radius={[6, 6, 0, 0]} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className={`p-5 rounded-3xl ${style('neu-flat-dark', 'neu-flat-light')}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold">Deductions Breakdown</h3>
                      <p className="text-[11px] text-slate-400">Provident fund and statutory tax withholding</p>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#19202A' : '#e0e0e0'} vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: theme === 'dark' ? '#888' : '#666' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: theme === 'dark' ? '#888' : '#666' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: theme === 'dark' ? '#151A22' : '#fff', 
                            borderRadius: '12px', 
                            border: '1px solid #27313D', 
                            boxShadow: '0 8px 16px -4px rgb(0 0 0 / 0.3)' 
                          }}
                          itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                          formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, '']}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Bar dataKey="pf" name="Provident Fund (PF)" stackId="a" fill="#8B5CF6" />
                        <Bar dataKey="taxes" name="Taxes (TDS + PT)" stackId="a" fill="#F87171" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filter, Search & Controls Toolbar */}
          <div className={`p-4 sm:p-5 rounded-3xl space-y-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search Box */}
              <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl flex-1 max-w-md ${style('neu-inset-dark', 'neu-inset-light')}`}>
                <Search className="h-4 w-4 text-slate-400 shrink-0" />
                <input 
                  type="text"
                  placeholder="Search by employer, employee name, ID, or month..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent border-0 outline-none text-xs w-full placeholder:text-slate-500 font-medium"
                />
                {searchQuery && (
                  <button 
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-1 text-slate-400 hover:text-slate-200 border-0 bg-transparent cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Action Buttons: Expand / Collapse All */}
              <div className="flex items-center gap-2 self-end md:self-auto">
                <button
                  type="button"
                  onClick={expandAll}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all ${style('neu-btn-dark text-slate-300 hover:text-white', 'neu-btn-light text-slate-700')}`}
                >
                  Expand All
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all ${style('neu-btn-dark text-slate-300 hover:text-white', 'neu-btn-light text-slate-700')}`}
                >
                  Collapse All
                </button>
              </div>
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              {/* Employer Filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Employer
                </label>
                <select
                  value={selectedEmployer}
                  onChange={e => setSelectedEmployer(e.target.value)}
                  className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 cursor-pointer ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
                >
                  <option value="ALL">All Employers ({employers.length})</option>
                  {employers.map(emp => (
                    <option key={emp} value={emp}>{emp}</option>
                  ))}
                </select>
              </div>

              {/* Year Filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Year
                </label>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(e.target.value)}
                  className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 cursor-pointer ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
                >
                  <option value="ALL">All Years ({years.length})</option>
                  {years.map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>

              {/* Sort Filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Filter className="h-3 w-3" /> Sort By
                </label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 cursor-pointer ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
                >
                  <option value="newest">Period: Newest First</option>
                  <option value="oldest">Period: Oldest First</option>
                  <option value="highest_net">Net Pay: Highest First</option>
                  <option value="highest_gross">Gross Pay: Highest First</option>
                </select>
              </div>

              {/* Page Size Selector */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Layers className="h-3 w-3" /> Per Page
                </label>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 cursor-pointer ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
                >
                  <option value={5}>5 payslips per page</option>
                  <option value={10}>10 payslips per page</option>
                  <option value={20}>20 payslips per page</option>
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/10">
                <span className="text-xs text-slate-400">
                  Showing <strong>{filteredAndSortedPayslips.length}</strong> of <strong>{payslips.length}</strong> payslips
                </span>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-bold text-[#5EEAD4] hover:underline bg-transparent border-0 cursor-pointer p-0"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>

          {/* Payslip History List (Expandable Cards) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>Payslip History</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800/40 text-slate-400">
                  {totalItems} records
                </span>
              </h3>
            </div>

            {paginatedPayslips.length === 0 ? (
              <div className={`p-8 rounded-3xl text-center ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <p className="text-sm text-slate-400 font-medium">No payslips match the selected filter criteria.</p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className={`mt-3 px-4 py-2 rounded-xl text-xs font-bold border-0 cursor-pointer ${style('neu-btn-dark text-[#5EEAD4]', 'neu-btn-light text-[#0F766E]')}`}
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {paginatedPayslips.map(p => {
                  const isExpanded = !!expandedIds[p.id];
                  const grossNum = parseFloat(p.gross_earnings) || 0;
                  const netNum = parseFloat(p.net_pay) || 0;
                  const deductionsNum = parseFloat(p.gross_deductions) || 0;
                  const takeHomePct = grossNum > 0 ? ((netNum / grossNum) * 100).toFixed(1) : '100.0';
                  const deductionPct = grossNum > 0 ? ((deductionsNum / grossNum) * 100).toFixed(1) : '0.0';
                  const monthName = MONTH_NAMES[p.period_month - 1] || `Month ${p.period_month}`;

                  return (
                    <div 
                      key={p.id} 
                      className={`rounded-3xl transition-all overflow-hidden ${style('neu-flat-dark', 'neu-flat-light')}`}
                    >
                      {/* Clickable Header / Summary Row */}
                      <div 
                        onClick={() => toggleExpand(p.id)}
                        className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-white/[0.02] select-none transition-colors"
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                      >
                        {/* Employer & Period Info */}
                        <div className="flex items-center gap-3.5">
                          <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${style('neu-inset-dark text-[#5EEAD4]', 'neu-inset-light text-[#0F766E]')}`}>
                            <FileText className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-black text-sm tracking-tight">
                                {p.company_name || 'Employer'}
                              </h4>
                              <span className="text-xs font-bold text-slate-400">
                                • {monthName} {p.period_year}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="text-[11px] font-black px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Net: ₹{netNum.toLocaleString('en-IN')}
                              </span>
                              <span className="text-[10px] font-semibold text-slate-400">
                                Gross: ₹{grossNum.toLocaleString('en-IN')}
                              </span>
                              {p.transaction_id && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 flex items-center gap-1 border border-blue-500/20">
                                  <CheckCircle2 className="h-3 w-3" /> Auto-Linked
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Quick Mini Stats on Collapsed Mode */}
                        <div className="flex items-center justify-between md:justify-end gap-4 sm:gap-6">
                          <div className="grid grid-cols-3 gap-3 sm:gap-6 text-right">
                            <div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Basic</div>
                              <div className="font-bold text-xs">₹{Number(p.basic_salary).toLocaleString('en-IN')}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PF</div>
                              <div className="font-bold text-xs text-purple-400">₹{Number(p.provident_fund).toLocaleString('en-IN')}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TDS / Tax</div>
                              <div className="font-bold text-xs text-rose-400">₹{Number(p.income_tax_tds).toLocaleString('en-IN')}</div>
                            </div>
                          </div>

                          <div className={`p-2 rounded-xl shrink-0 ${style('neu-inset-dark text-slate-300', 'neu-inset-light text-slate-600')}`}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Details Drawer */}
                      {isExpanded && (
                        <div className={`p-5 sm:p-6 border-t space-y-6 ${style('border-slate-800/40 bg-black/10', 'border-slate-300/40 bg-slate-100/40')}`}>
                          
                          {/* Employee & Payout Profile Grid */}
                          <div className={`p-4 rounded-2xl ${style('neu-inset-dark', 'neu-inset-light')}`}>
                            <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" /> Employee & Payout Details
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                              <div>
                                <span className="text-slate-400 text-[11px] block">Employee Name</span>
                                <strong className="text-slate-200">{p.employee_name || 'Not specified'}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400 text-[11px] block">Employee ID</span>
                                <strong className="text-slate-200">{p.employee_id || 'Not specified'}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400 text-[11px] block">Bank Account Mask</span>
                                <strong className="text-slate-200">{p.bank_account_no ? maskAccountNumber(p.bank_account_no) : 'Not specified'}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400 text-[11px] block">Ledger Linking</span>
                                <strong className={p.transaction_id ? 'text-emerald-400 flex items-center gap-1' : 'text-slate-400'}>
                                  {p.transaction_id ? <><ShieldCheck className="h-3.5 w-3.5" /> Verified to Bank Deposit</> : 'Pending Transaction Match'}
                                </strong>
                              </div>
                            </div>
                          </div>

                          {/* Dual Column: Earnings vs Deductions Breakdown */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            
                            {/* Earnings Breakdown */}
                            <div className={`p-4.5 rounded-2xl space-y-3 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                              <div className="flex items-center justify-between border-b pb-2.5 border-slate-800/20">
                                <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                  <TrendingUp className="h-4 w-4" /> Earnings Breakdown
                                </span>
                                <span className="text-xs font-black text-emerald-400">Amount (₹)</span>
                              </div>

                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between py-1 border-b border-slate-800/10">
                                  <span className="text-slate-400">Basic Salary</span>
                                  <span className="font-bold">{formatCurrency(p.basic_salary, true, false)}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-800/10">
                                  <span className="text-slate-400">House Rent Allowance (HRA)</span>
                                  <span className="font-bold">{formatCurrency(p.hra, true, false)}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-800/10">
                                  <span className="text-slate-400">Special / Adhoc Allowance</span>
                                  <span className="font-bold">{formatCurrency(p.special_allowance, true, false)}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-800/10">
                                  <span className="text-slate-400">Other Allowances</span>
                                  <span className="font-bold">{formatCurrency(p.other_earnings, true, false)}</span>
                                </div>
                                <div className={`flex justify-between items-center pt-2 mt-1 rounded-xl px-2.5 py-2 font-black ${style('bg-emerald-500/10 text-emerald-400', 'bg-emerald-50 text-emerald-700')}`}>
                                  <span>Gross Total Earnings</span>
                                  <span className="text-sm">{formatCurrency(p.gross_earnings, true, false)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Deductions Breakdown */}
                            <div className={`p-4.5 rounded-2xl space-y-3 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                              <div className="flex items-center justify-between border-b pb-2.5 border-slate-800/20">
                                <span className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                                  <TrendingDown className="h-4 w-4" /> Deductions Breakdown
                                </span>
                                <span className="text-xs font-black text-rose-400">Amount (₹)</span>
                              </div>

                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between py-1 border-b border-slate-800/10">
                                  <span className="text-slate-400">Provident Fund (EPF)</span>
                                  <span className="font-bold text-purple-400">{formatCurrency(p.provident_fund, true, false)}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-800/10">
                                  <span className="text-slate-400">Professional Tax (PT)</span>
                                  <span className="font-bold text-amber-400">{formatCurrency(p.professional_tax, true, false)}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-800/10">
                                  <span className="text-slate-400">Income Tax (TDS)</span>
                                  <span className="font-bold text-rose-400">{formatCurrency(p.income_tax_tds, true, false)}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-800/10">
                                  <span className="text-slate-400">Other Deductions</span>
                                  <span className="font-bold">{formatCurrency(p.other_deductions, true, false)}</span>
                                </div>
                                <div className={`flex justify-between items-center pt-2 mt-1 rounded-xl px-2.5 py-2 font-black ${style('bg-rose-500/10 text-rose-400', 'bg-rose-50 text-rose-700')}`}>
                                  <span>Total Statutory Deductions</span>
                                  <span className="text-sm">{formatCurrency(p.gross_deductions, true, false)}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Net Take-Home Summary & Take-Home Ratio */}
                          <div className={`p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 ${style('neu-inset-dark', 'neu-inset-light')}`}>
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                                <Sparkles className="h-5 w-5" />
                              </div>
                              <div>
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Net Take-Home Salary</span>
                                <span className="text-xl font-black text-emerald-400">{formatCurrency(p.net_pay, true, false)}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 text-xs font-bold">
                              <div className="text-center sm:text-right">
                                <span className="text-[10px] text-slate-400 uppercase block font-semibold">Take-Home Ratio</span>
                                <span className="text-emerald-400 font-black text-sm">{takeHomePct}%</span>
                              </div>
                              <div className="h-8 w-px bg-slate-700/50"></div>
                              <div className="text-center sm:text-right">
                                <span className="text-[10px] text-slate-400 uppercase block font-semibold">Deduction Ratio</span>
                                <span className="text-rose-400 font-black text-sm">{deductionPct}%</span>
                              </div>
                            </div>
                          </div>

                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className={`p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <span className="text-xs text-slate-400 font-medium">
                  Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> - <strong>{Math.min(currentPage * pageSize, totalItems)}</strong> of <strong>{totalItems}</strong> payslips
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className={`p-2 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed ${style('neu-btn-dark text-slate-300', 'neu-btn-light text-slate-700')}`}
                    aria-label="Previous Page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => {
                    const isActive = pageNum === currentPage;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`h-8 w-8 rounded-xl text-xs font-black border-0 cursor-pointer transition-all ${
                          isActive
                            ? style('neu-flat-dark text-[#5EEAD4] shadow-[0_0_10px_rgba(94,234,212,0.15)]', 'bg-[#0F766E] text-white shadow-lg')
                            : style('neu-btn-dark text-slate-400 hover:text-white', 'neu-btn-light text-slate-600')
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className={`p-2 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed ${style('neu-btn-dark text-slate-300', 'neu-btn-light text-slate-700')}`}
                    aria-label="Next Page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
