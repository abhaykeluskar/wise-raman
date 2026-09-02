import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  AlertCircle, 
  Sparkles, 
  ShieldCheck, 
  ArrowRight, 
  CreditCard, 
  Landmark, 
  PiggyBank,
  CheckCircle2,
  PieChart,
  Repeat
} from 'lucide-react';

export const FinancialHealthView = () => {
  const { theme, style } = useTheme();
  const { token, API_BASE_URL } = useFinance();

  const [activeTab, setActiveTab] = useState('health_score');
  const [healthScoreData, setHealthScoreData] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [calendarData, setCalendarData] = useState(null);
  const [lifestyleData, setLifestyleData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }), [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const apiBase = API_BASE_URL || '';
    Promise.all([
      fetch(`${apiBase}/api/health-score`, { headers: fetchHeaders }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${apiBase}/api/analytics/anomalies`, { headers: fetchHeaders }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${apiBase}/api/analytics/financial-calendar`, { headers: fetchHeaders }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${apiBase}/api/analytics/lifestyle-inflation`, { headers: fetchHeaders }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([hs, anom, cal, life]) => {
      if (hs) setHealthScoreData(hs);
      if (anom) setAnomalies(anom);
      if (cal) setCalendarData(cal);
      if (life) setLifestyleData(life);
    }).finally(() => setLoading(false));
  }, [token, API_BASE_URL, fetchHeaders]);

  const subTabs = [
    { key: 'health_score', label: 'Health Score (0-100)', icon: Activity },
    { key: 'calendar', label: 'Financial Calendar', icon: Calendar },
    { key: 'anomalies', label: 'Unusual Spending', count: anomalies.length, icon: AlertCircle },
    { key: 'lifestyle', label: 'Lifestyle & Savings Rate', icon: TrendingUp }
  ];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 pb-16">
      
      {/* Header Banner */}
      <div className={`p-5 sm:p-6 rounded-3xl border-0 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-2xl flex items-center justify-center ${style('neu-flat-dark text-emerald-400', 'neu-flat-light text-emerald-600')}`}>
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${style('text-white', 'text-slate-800')}`}>
                Financial Health & Intelligence
              </h1>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                Explainable OS
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Explainable 0–100 health score, 3.0× unusual spending radar, financial calendar, and true savings rate.
            </p>
          </div>
        </div>

        {healthScoreData && !healthScoreData.insufficient_data && (
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl self-start md:self-auto ${style('neu-inset-dark', 'neu-inset-light')}`}>
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <div className="text-left">
              <div className="text-[10px] font-bold uppercase text-slate-400">Score Confidence</div>
              <div className="text-xs font-black text-emerald-400">{healthScoreData.confidence_score}%</div>
            </div>
          </div>
        )}
      </div>

      {/* Segmented Sub-Navigation Grid */}
      <div className={`p-1.5 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-1.5 ${style('neu-inset-dark', 'neu-inset-light')}`}>
        {subTabs.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer text-center ${
                active
                  ? style('neu-flat-dark text-emerald-400 ring-1 ring-emerald-500/30', 'bg-emerald-600 text-white shadow-md')
                  : style('text-slate-400 hover:text-slate-200 hover:bg-white/5', 'text-slate-600 hover:text-slate-900 hover:bg-black/5')
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t.label}</span>
              {t.count !== undefined && t.count > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-amber-500/30 text-amber-200">
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading State */}
      {loading && (
        <div className={`p-12 rounded-3xl border-0 text-center flex flex-col items-center justify-center gap-3 ${style('neu-flat-dark', 'neu-flat-light')}`}>
          <div className="h-8 w-8 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Calculating explainable financial health indicators...</p>
        </div>
      )}

      {/* 1. HEALTH SCORE TAB */}
      {!loading && activeTab === 'health_score' && (
        healthScoreData ? (
          <div className="flex flex-col gap-6">
            {healthScoreData.insufficient_data ? (
              <div className={`p-8 rounded-3xl border-0 text-center flex flex-col items-center justify-center gap-3 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <AlertCircle className="h-10 w-10 text-amber-400" />
                <h3 className={`text-lg font-bold ${style('text-white', 'text-slate-800')}`}>{healthScoreData.display_title || 'Not enough data yet'}</h3>
                <p className="text-xs text-slate-400 max-w-md">{healthScoreData.message || 'WiseRaman needs at least 3 months of bank statements to compute a reliable health score.'}</p>
              </div>
            ) : (
              <>
                {/* Score Hero Card */}
                <div className={`p-6 sm:p-8 rounded-3xl border-0 flex flex-col md:flex-row items-center justify-between gap-6 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                  <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                    <div className="relative flex items-center justify-center h-28 w-28 rounded-full border-4 border-emerald-500/40 bg-emerald-500/10 shrink-0">
                      <span className="text-4xl font-black text-emerald-400">{healthScoreData.score}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className={`text-2xl font-black ${style('text-white', 'text-slate-800')}`}>Financial Health Score</h2>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black text-white bg-emerald-600">
                          {healthScoreData.tier}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{healthScoreData.confidence_label}</p>
                    </div>
                  </div>
                </div>

                {/* 6 Explainable Pillars */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(healthScoreData.pillars || {}).map(([key, p]) => (
                    <div key={key} className={`p-5 rounded-3xl border-0 flex flex-col justify-between gap-3 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{p.name} ({p.weight})</span>
                          <span className="text-xs font-black text-emerald-400">{p.score}/100</span>
                        </div>
                        <div className={`text-xl font-black mt-2 ${style('text-white', 'text-slate-800')}`}>{p.current_value}</div>
                        <p className="text-xs text-slate-400 mt-1">{p.explanation}</p>
                      </div>

                      <div className="pt-2 border-t border-slate-700/20 text-[11px] text-slate-500">
                        Benchmark: {p.benchmark}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className={`p-8 rounded-3xl border-0 text-center flex flex-col items-center justify-center gap-3 ${style('neu-flat-dark', 'neu-flat-light')}`}>
            <AlertCircle className="h-10 w-10 text-slate-400" />
            <h3 className={`text-lg font-bold ${style('text-white', 'text-slate-800')}`}>No Health Score Available</h3>
            <p className="text-xs text-slate-400 max-w-md">Import your bank statements to automatically calculate your Explainable Financial Health Score.</p>
          </div>
        )
      )}

      {/* 2. FINANCIAL CALENDAR TAB */}
      {!loading && activeTab === 'calendar' && (
        calendarData ? (
          <div className="flex flex-col gap-6">
            {/* Month Cash Flow Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className={`p-5 rounded-3xl border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Scheduled Inflows</span>
                <h3 className="text-2xl font-black text-emerald-400 mt-2">{formatCurrency(calendarData.total_scheduled_inflows)}</h3>
              </div>
              <div className={`p-5 rounded-3xl border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Scheduled Outflows</span>
                <h3 className="text-2xl font-black text-rose-400 mt-2">{formatCurrency(calendarData.total_scheduled_outflows)}</h3>
              </div>
              <div className={`p-5 rounded-3xl border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Projected Month-End Balance</span>
                <h3 className="text-2xl font-black text-indigo-400 mt-2">{formatCurrency(calendarData.projected_month_end_balance)}</h3>
              </div>
            </div>

            {/* Chronological Schedule */}
            <div className={`p-6 rounded-3xl border-0 flex flex-col gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <h3 className={`text-base font-bold ${style('text-white', 'text-slate-800')}`}>
                {calendarData.month} Payment Timeline
              </h3>

              <div className="flex flex-col gap-2.5">
                {calendarData.events && calendarData.events.length > 0 ? (
                  calendarData.events.map((ev, idx) => (
                    <div key={idx} className={`p-3.5 rounded-2xl flex items-center justify-between ${style('neu-inset-dark', 'neu-inset-light')}`}>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-slate-700/40 flex items-center justify-center text-xs font-black text-indigo-400">
                          Day {ev.day}
                        </div>
                        <div>
                          <div className={`text-sm font-bold ${style('text-white', 'text-slate-800')}`}>{ev.title}</div>
                          <span className="text-[10px] uppercase font-bold text-slate-400">{ev.category}</span>
                        </div>
                      </div>

                      <span className={`text-sm font-black ${ev.is_inflow ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {ev.is_inflow ? `+${formatCurrency(ev.amount)}` : `-${formatCurrency(ev.amount)}`}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center p-6 text-slate-400 text-xs italic">
                    No scheduled events found for this month.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className={`p-8 rounded-3xl border-0 text-center flex flex-col items-center justify-center gap-3 ${style('neu-flat-dark', 'neu-flat-light')}`}>
            <Calendar className="h-10 w-10 text-slate-400" />
            <h3 className={`text-lg font-bold ${style('text-white', 'text-slate-800')}`}>No Calendar Data</h3>
            <p className="text-xs text-slate-400 max-w-md">Import statements and loans to generate your automated financial calendar.</p>
          </div>
        )
      )}

      {/* 3. UNUSUAL SPENDING RADAR TAB */}
      {!loading && activeTab === 'anomalies' && (
        <div className="flex flex-col gap-6">
          {anomalies.length === 0 ? (
            <div className={`p-8 rounded-3xl border-0 text-center text-slate-400 text-xs italic ${style('neu-flat-dark', 'neu-flat-light')}`}>
              No unusual spending detected. All transactions align with your 90-day typical spending patterns.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {anomalies.map((anom, idx) => (
                <div key={idx} className={`p-5 rounded-3xl border-0 flex flex-col justify-between gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-400 min-w-0 truncate">{anom.merchant}</span>
                      <span 
                        className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white shrink-0"
                        style={{ backgroundColor: anom.severity_color }}
                      >
                        {anom.severity} ({anom.multiplier}x)
                      </span>
                    </div>
                    <h3 className={`text-xl font-black text-rose-400 mt-2`}>
                      {formatCurrency(anom.amount)}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">{anom.explanation}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-700/30 flex items-center justify-between text-xs text-slate-400">
                    <span>90-Day Typical: <strong>{formatCurrency(anom.merchant_90d_median)}</strong></span>
                    <span>Confidence: <strong>{anom.confidence}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. LIFESTYLE INFLATION & TRUE SAVINGS TAB */}
      {!loading && activeTab === 'lifestyle' && (
        lifestyleData ? (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Lifestyle Creep Gauge */}
              <div className={`p-6 rounded-3xl border-0 flex flex-col justify-between gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Lifestyle Inflation Gap</span>
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                      lifestyleData.lifestyle_inflation?.is_lifestyle_creeping ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {lifestyleData.lifestyle_inflation?.status}
                    </span>
                  </div>
                  <h3 className={`text-2xl font-black mt-2 ${style('text-white', 'text-slate-800')}`}>
                    {lifestyleData.lifestyle_inflation?.lifestyle_inflation_gap > 0 ? `+${lifestyleData.lifestyle_inflation?.lifestyle_inflation_gap}%` : `${lifestyleData.lifestyle_inflation?.lifestyle_inflation_gap}%`}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">{lifestyleData.lifestyle_inflation?.advice}</p>
                </div>

                <div className="pt-3 border-t border-slate-700/20 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400">Income Growth: </span>
                    <span className="font-bold text-emerald-400">+{lifestyleData.lifestyle_inflation?.income_growth_pct}%</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Discretionary Spend Growth: </span>
                    <span className="font-bold text-rose-400">+{lifestyleData.lifestyle_inflation?.discretionary_growth_pct}%</span>
                  </div>
                </div>
              </div>

              {/* True Economic Savings Rate */}
              <div className={`p-6 rounded-3xl border-0 flex flex-col justify-between gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">True Economic Savings Rate</span>
                  <h3 className="text-2xl font-black text-emerald-400 mt-2">
                    {lifestyleData.true_savings_rate?.true_savings_rate_pct}%
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Combines liquid cash savings, investments (SIPs), and loan principal repayment.
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-700/20 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400">Total Savings: </span>
                    <span className="font-bold text-white">{formatCurrency(lifestyleData.true_savings_rate?.total_economic_savings)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Rating: </span>
                    <span className="font-bold text-indigo-400">{lifestyleData.true_savings_rate?.benchmark_comparison}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className={`p-8 rounded-3xl border-0 text-center flex flex-col items-center justify-center gap-3 ${style('neu-flat-dark', 'neu-flat-light')}`}>
            <TrendingUp className="h-10 w-10 text-slate-400" />
            <h3 className={`text-lg font-bold ${style('text-white', 'text-slate-800')}`}>No Lifestyle Data</h3>
            <p className="text-xs text-slate-400 max-w-md">Upload statements to calculate lifestyle inflation and your True Economic Savings Rate.</p>
          </div>
        )
      )}
    </div>
  );
};
