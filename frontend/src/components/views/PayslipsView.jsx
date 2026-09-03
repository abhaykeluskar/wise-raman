import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { 
  Briefcase, 
  Wallet, 
  Receipt, 
  PiggyBank, 
  TrendingUp, 
  TrendingDown, 
  Building2, 
  Calendar, 
  Search, 
  Filter, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  User, 
  ShieldCheck, 
  Sparkles, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Layers 
} from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const PayslipsView = () => {
  const { theme } = useTheme();
  const { authFetch } = useFinance();
  const isDark = theme === 'dark';

  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState({});

  // Filter and Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployer, setSelectedEmployer] = useState('ALL');
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'highest_net' | 'highest_gross'

  // Pagination states
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

  // Filtered and Sorted list
  const filteredAndSortedPayslips = useMemo(() => {
    return payslips
      .filter(p => {
        if (selectedEmployer !== 'ALL' && p.company_name !== selectedEmployer) return false;
        if (selectedYear !== 'ALL' && String(p.period_year) !== String(selectedYear)) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const emp = (p.company_name || '').toLowerCase();
          const name = (p.employee_name || '').toLowerCase();
          const id = (p.employee_id || '').toLowerCase();
          const month = (MONTH_NAMES[p.period_month - 1] || '').toLowerCase();
          return emp.includes(q) || name.includes(q) || id.includes(q) || month.includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          if (b.period_year !== a.period_year) return b.period_year - a.period_year;
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
  }, [payslips, selectedEmployer, selectedYear, searchQuery, sortBy]);

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

  const maskAccountNumber = (acc) => {
    if (!acc) return '';
    const str = String(acc);
    return str.length > 4 ? `•••• •••• ${str.slice(-4)}` : str;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200 pb-12">
      
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pb-2 border-b border-[#E4E8E3]/30">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
              Salary & Payslips
            </h2>
            <Badge variant="verified">Auditable Compensation</Badge>
          </div>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            Detailed salary structures, tax deductions, PF contributions, and bank statement linkage
          </p>
        </div>
      </div>

      {loading ? (
        <div className={`p-12 rounded-[16px] border flex flex-col items-center justify-center ${
          isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
        }`}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3F8F5E] mb-3"></div>
          <span className="text-xs font-semibold text-[#8B978F]">Loading verified payslips...</span>
        </div>
      ) : payslips.length === 0 ? (
        <div className={`p-12 rounded-[16px] border flex flex-col items-center justify-center text-center space-y-4 ${
          isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
        }`}>
          <div className={`p-4 rounded-[12px] ${isDark ? 'bg-[#1C251F]' : 'bg-[#FBFCFA]'}`}>
            <Briefcase className="h-8 w-8 text-[#8B978F]" />
          </div>
          <div>
            <h3 className="text-base font-bold">No payslips found</h3>
            <p className="text-xs text-[#8B978F] max-w-sm mt-1 leading-relaxed">
              Upload salary payslip PDFs in Source Documents or import statements to automatically extract earnings, PF, and tax deductions.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Executive Summary Metrics Deck */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-5 rounded-[16px] border flex flex-col justify-between ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B978F]">Gross Compensation</span>
                <Briefcase className="h-4 w-4 text-[#3F8F5E]" />
              </div>
              <p className="text-2xl font-bold tabular-nums text-[#3F8F5E]">{formatCurrency(stats.totalGross, true, false)}</p>
              <span className="text-[10px] text-[#8B978F] mt-1 font-medium">{payslips.length} pay cycles recorded</span>
            </div>

            <div className={`p-5 rounded-[16px] border flex flex-col justify-between ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B978F]">Net Take-Home Pay</span>
                <Wallet className="h-4 w-4 text-[#5BAE78]" />
              </div>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(stats.totalNet, true, false)}</p>
              <span className="text-[10px] text-[#8B978F] mt-1 font-medium">Avg: {formatCurrency(stats.avgMonthlyNet, false, false)} / mo</span>
            </div>

            <div className={`p-5 rounded-[16px] border flex flex-col justify-between ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B978F]">Total Taxes Deducted</span>
                <Receipt className="h-4 w-4 text-[#A77B58]" />
              </div>
              <p className="text-2xl font-bold tabular-nums text-[#A77B58]">{formatCurrency(stats.totalTaxes, true, false)}</p>
              <span className="text-[10px] text-[#8B978F] mt-1 font-medium">TDS: {formatCurrency(stats.totalTds, false, false)} · PT: {formatCurrency(stats.totalPt, false, false)}</span>
            </div>

            <div className={`p-5 rounded-[16px] border flex flex-col justify-between ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B978F]">Provident Fund (EPF)</span>
                <PiggyBank className="h-4 w-4 text-[#3F8F5E]" />
              </div>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(stats.totalPf, true, false)}</p>
              <span className="text-[10px] text-[#8B978F] mt-1 font-medium">Accumulated employee PF corpus</span>
            </div>
          </div>

          {/* Visual Analytics Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`p-6 rounded-[16px] border ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <div className="mb-4">
                <h3 className="text-sm font-bold">Gross vs Net Take-Home Trajectory</h3>
                <p className="text-xs text-[#8B978F]">Monthly compensation and in-hand salary trends</p>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2A352D' : '#E4E8E3'} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: isDark ? '#8B978F' : '#7B877F' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: isDark ? '#8B978F' : '#7B877F' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: isDark ? '#171E19' : '#FFFFFF', 
                        borderRadius: '10px', 
                        border: isDark ? '1px solid #2A352D' : '1px solid #E4E8E3' 
                      }}
                      formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, '']}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar dataKey="grossEarnings" name="Gross Earnings" fill={isDark ? '#2A352D' : '#E4E8E3'} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="netPay" name="Net Pay" fill="#3F8F5E" radius={[4, 4, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={`p-6 rounded-[16px] border ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <div className="mb-4">
                <h3 className="text-sm font-bold">Deductions Breakdown</h3>
                <p className="text-xs text-[#8B978F]">Provident fund and statutory tax withholding</p>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2A352D' : '#E4E8E3'} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: isDark ? '#8B978F' : '#7B877F' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: isDark ? '#8B978F' : '#7B877F' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: isDark ? '#171E19' : '#FFFFFF', 
                        borderRadius: '10px', 
                        border: isDark ? '1px solid #2A352D' : '1px solid #E4E8E3' 
                      }}
                      formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, '']}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar dataKey="pf" name="Provident Fund (PF)" stackId="a" fill="#5BAE78" />
                    <Bar dataKey="taxes" name="Taxes (TDS + PT)" stackId="a" fill="#A77B58" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Filter, Search & Controls Toolbar */}
          <div className={`p-4 rounded-[14px] border space-y-4 ${
            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
          }`}>
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search Box */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-[10px] border flex-1 max-w-md ${
                isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
              }`}>
                <Search className="h-3.5 w-3.5 text-[#8B978F] shrink-0" />
                <input 
                  type="text"
                  placeholder="Search by employer, employee name, ID, or month..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent border-0 outline-none text-xs w-full text-foreground placeholder:text-[#8B978F]"
                />
                {searchQuery && (
                  <button 
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-0.5 text-[#8B978F] hover:text-foreground border-0 bg-transparent cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Action Buttons: Expand / Collapse All */}
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="xs" onClick={expandAll}>Expand All</Button>
                <Button variant="secondary" size="xs" onClick={collapseAll}>Collapse All</Button>
              </div>
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#8B978F] uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Employer
                </label>
                <select
                  value={selectedEmployer}
                  onChange={e => setSelectedEmployer(e.target.value)}
                  className={`rounded-[8px] px-3 py-1.5 text-xs border outline-none cursor-pointer ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#1D2822]'
                  }`}
                >
                  <option value="ALL">All Employers ({employers.length})</option>
                  {employers.map(emp => (
                    <option key={emp} value={emp}>{emp}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#8B978F] uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Year
                </label>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(e.target.value)}
                  className={`rounded-[8px] px-3 py-1.5 text-xs border outline-none cursor-pointer ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#1D2822]'
                  }`}
                >
                  <option value="ALL">All Years ({years.length})</option>
                  {years.map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#8B978F] uppercase tracking-wider flex items-center gap-1">
                  <Filter className="h-3 w-3" /> Sort By
                </label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className={`rounded-[8px] px-3 py-1.5 text-xs border outline-none cursor-pointer ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#1D2822]'
                  }`}
                >
                  <option value="newest">Period: Newest First</option>
                  <option value="oldest">Period: Oldest First</option>
                  <option value="highest_net">Net Pay: Highest First</option>
                  <option value="highest_gross">Gross Pay: Highest First</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#8B978F] uppercase tracking-wider flex items-center gap-1">
                  <Layers className="h-3 w-3" /> Per Page
                </label>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  className={`rounded-[8px] px-3 py-1.5 text-xs border outline-none cursor-pointer ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#1D2822]'
                  }`}
                >
                  <option value={5}>5 payslips per page</option>
                  <option value={10}>10 payslips per page</option>
                  <option value={20}>20 payslips per page</option>
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex items-center justify-between pt-2 border-t border-[#E4E8E3]/20">
                <span className="text-xs text-[#8B978F]">
                  Showing <strong>{filteredAndSortedPayslips.length}</strong> of <strong>{payslips.length}</strong> payslips
                </span>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-semibold text-[#3F8F5E] hover:underline bg-transparent border-0 cursor-pointer p-0"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>

          {/* Payslip History List (Expandable Cards) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span>Payslip History</span>
                <Badge variant="neutral" size="xs">{totalItems} records</Badge>
              </h3>
            </div>

            {paginatedPayslips.length === 0 ? (
              <div className={`p-8 rounded-[16px] border text-center ${
                isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
              }`}>
                <p className="text-xs text-[#8B978F]">No payslips match the selected filter criteria.</p>
                <Button variant="secondary" size="xs" onClick={clearFilters} className="mt-3">
                  Reset Filters
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
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
                      className={`rounded-[16px] border transition-all overflow-hidden ${
                        isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
                      }`}
                    >
                      {/* Clickable Header / Summary Row */}
                      <div 
                        onClick={() => toggleExpand(p.id)}
                        className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-black/[0.01] select-none transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-[10px] flex items-center justify-center shrink-0 ${
                            isDark ? 'bg-[#1C251F] text-[#7FC39A]' : 'bg-[#F1F8F4] text-[#3F8F5E]'
                          }`}>
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-xs tracking-tight">
                                {p.company_name || 'Employer'}
                              </h4>
                              <span className="text-xs text-[#8B978F]">
                                · {monthName} {p.period_year}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="verified" size="xs">
                                Net: {formatCurrency(netNum)}
                              </Badge>
                              <span className="text-[10px] text-[#8B978F]">
                                Gross: {formatCurrency(grossNum)}
                              </span>
                              {p.transaction_id && (
                                <Badge variant="positive" size="xs">
                                  Linked
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Quick Mini Stats on Collapsed Mode */}
                        <div className="flex items-center justify-between md:justify-end gap-6 text-right text-xs">
                          <div>
                            <div className="text-[10px] font-bold text-[#8B978F] uppercase">Basic</div>
                            <div className="font-bold tabular-nums">{formatCurrency(p.basic_salary)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-[#8B978F] uppercase">PF</div>
                            <div className="font-bold tabular-nums text-[#3F8F5E]">{formatCurrency(p.provident_fund)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-[#8B978F] uppercase">TDS / Tax</div>
                            <div className="font-bold tabular-nums text-[#A77B58]">{formatCurrency(p.income_tax_tds)}</div>
                          </div>
                          <div className="p-1 rounded text-[#8B978F]">
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Details Drawer */}
                      {isExpanded && (
                        <div className={`p-5 border-t space-y-6 ${
                          isDark ? 'border-[#2A352D] bg-[#1C251F]/40' : 'border-[#E4E8E3] bg-[#FBFCFA]'
                        }`}>
                          {/* Profile Details */}
                          <div className={`p-4 rounded-[12px] border ${
                            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
                          }`}>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[#8B978F] mb-3 flex items-center gap-1.5">
                              <User className="h-3 w-3" /> Employee & Payout Details
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                              <div>
                                <span className="text-[#8B978F] text-[10px] block">Employee Name</span>
                                <strong className="text-foreground">{p.employee_name || 'Not specified'}</strong>
                              </div>
                              <div>
                                <span className="text-[#8B978F] text-[10px] block">Employee ID</span>
                                <strong className="text-foreground">{p.employee_id || 'Not specified'}</strong>
                              </div>
                              <div>
                                <span className="text-[#8B978F] text-[10px] block">Bank Account</span>
                                <strong className="text-foreground">{p.bank_account_no ? maskAccountNumber(p.bank_account_no) : 'Not specified'}</strong>
                              </div>
                              <div>
                                <span className="text-[#8B978F] text-[10px] block">Ledger Verification</span>
                                <strong className={p.transaction_id ? 'text-[#3F8F5E]' : 'text-[#8B978F]'}>
                                  {p.transaction_id ? 'Verified to Bank Deposit' : 'Pending Transaction Match'}
                                </strong>
                              </div>
                            </div>
                          </div>

                          {/* Dual Column: Earnings vs Deductions Breakdown */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Earnings Breakdown */}
                            <div className={`p-4 rounded-[12px] border space-y-2 text-xs ${
                              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
                            }`}>
                              <div className="flex items-center justify-between border-b pb-2 border-[#E4E8E3]/20 font-bold">
                                <span className="text-[#3F8F5E]">Earnings Breakdown</span>
                                <span>Amount</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-[#E4E8E3]/10">
                                <span className="text-[#8B978F]">Basic Salary</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(p.basic_salary)}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-[#E4E8E3]/10">
                                <span className="text-[#8B978F]">House Rent Allowance (HRA)</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(p.hra)}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-[#E4E8E3]/10">
                                <span className="text-[#8B978F]">Special / Adhoc Allowance</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(p.special_allowance)}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-[#E4E8E3]/10">
                                <span className="text-[#8B978F]">Other Allowances</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(p.other_earnings)}</span>
                              </div>
                              <div className="flex justify-between items-center pt-2 font-bold text-[#3F8F5E]">
                                <span>Gross Total Earnings</span>
                                <span className="text-sm tabular-nums">{formatCurrency(p.gross_earnings)}</span>
                              </div>
                            </div>

                            {/* Deductions Breakdown */}
                            <div className={`p-4 rounded-[12px] border space-y-2 text-xs ${
                              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
                            }`}>
                              <div className="flex items-center justify-between border-b pb-2 border-[#E4E8E3]/20 font-bold">
                                <span className="text-[#A77B58]">Deductions Breakdown</span>
                                <span>Amount</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-[#E4E8E3]/10">
                                <span className="text-[#8B978F]">Provident Fund (EPF)</span>
                                <span className="font-semibold tabular-nums text-[#3F8F5E]">{formatCurrency(p.provident_fund)}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-[#E4E8E3]/10">
                                <span className="text-[#8B978F]">Professional Tax (PT)</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(p.professional_tax)}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-[#E4E8E3]/10">
                                <span className="text-[#8B978F]">Income Tax (TDS)</span>
                                <span className="font-semibold tabular-nums text-[#A77B58]">{formatCurrency(p.income_tax_tds)}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-[#E4E8E3]/10">
                                <span className="text-[#8B978F]">Other Deductions</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(p.other_deductions)}</span>
                              </div>
                              <div className="flex justify-between items-center pt-2 font-bold text-[#A77B58]">
                                <span>Total Deductions</span>
                                <span className="text-sm tabular-nums">{formatCurrency(p.gross_deductions)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Net Take-Home Summary & Take-Home Ratio */}
                          <div className={`p-4 rounded-[12px] border flex flex-col sm:flex-row items-center justify-between gap-4 ${
                            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
                          }`}>
                            <div className="flex items-center gap-3">
                              <Sparkles className="h-5 w-5 text-[#3F8F5E]" />
                              <div>
                                <span className="text-[10px] font-bold uppercase text-[#8B978F] block">Net Take-Home Salary</span>
                                <span className="text-xl font-bold tabular-nums text-[#3F8F5E]">{formatCurrency(p.net_pay)}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 text-xs font-semibold">
                              <div>
                                <span className="text-[10px] text-[#8B978F] block">Take-Home Ratio</span>
                                <span className="text-[#3F8F5E] font-bold">{takeHomePct}%</span>
                              </div>
                              <div className="h-6 w-px bg-[#E4E8E3]/30"></div>
                              <div>
                                <span className="text-[10px] text-[#8B978F] block">Deduction Ratio</span>
                                <span className="text-[#A77B58] font-bold">{deductionPct}%</span>
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
              <div className="p-4 rounded-[12px] border flex items-center justify-between text-xs">
                <span className="text-[#8B978F]">
                  Page {currentPage} of {totalPages}
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="xs"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="xs"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
