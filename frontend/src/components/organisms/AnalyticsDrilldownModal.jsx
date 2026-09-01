import React, { useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { X, TrendingUp, TrendingDown, Store, ListOrdered } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';

export const AnalyticsDrilldownModal = ({ category, transactions, onClose, onOpenInLedger }) => {
  const { theme, style } = useTheme();

  if (!category) return null;

  const categoryTxs = useMemo(() => {
    return transactions
      .filter(t => t.category === category)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, category]);

  // 1. Top Merchants
  const merchants = useMemo(() => {
    const grouped = {};
    categoryTxs.forEach(tx => {
      const amt = parseFloat(tx.amount);
      if (amt < 0) {
        const m = tx.description || 'Unknown';
        grouped[m] = (grouped[m] || 0) + Math.abs(amt);
      }
    });
    return Object.entries(grouped)
      .map(([name, Spend]) => ({ name, Spend }))
      .sort((a, b) => b.Spend - a.Spend)
      .slice(0, 5); // Top 5
  }, [categoryTxs]);

  // 2. Trend (last 6 months)
  const trendData = useMemo(() => {
    const grouped = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      grouped[key] = { name: key, Spend: 0, sortKey: d.getTime() };
    }

    categoryTxs.forEach(tx => {
      const amt = parseFloat(tx.amount);
      if (amt < 0) {
        const d = new Date(tx.date);
        const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (grouped[key]) {
          grouped[key].Spend += Math.abs(amt);
        }
      }
    });
    return Object.values(grouped).sort((a, b) => a.sortKey - b.sortKey);
  }, [categoryTxs]);

  const currentMonthSpend = trendData[5]?.Spend || 0;
  const previousMonthSpend = trendData[4]?.Spend || 0;
  const percentChange = previousMonthSpend > 0 
    ? ((currentMonthSpend - previousMonthSpend) / previousMonthSpend) * 100 
    : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className={`relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl overflow-hidden border-0 ${style('bg-[#12121A]', 'bg-[#F0F5F9]')} shadow-2xl`}>
        
        <div className={`p-6 border-b flex justify-between items-center ${style('border-[#24243E]', 'border-[#E2E8F0]')}`}>
          <div>
            <h2 className={`text-2xl font-black ${style('text-white', 'text-slate-800')}`}>{category}</h2>
            <p className="text-sm text-slate-500 font-medium">{categoryTxs.length} transactions total</p>
          </div>
          <div className="flex items-center gap-2">
            {onOpenInLedger && (
              <button
                type="button"
                onClick={onOpenInLedger}
                className={`px-3 py-2 rounded-xl text-xs font-bold border-0 cursor-pointer ${style('neu-btn-dark text-[#FF7E67]', 'neu-btn-light text-[#4A90E2]')}`}
              >
                Open in Ledger
              </button>
            )}
            <button 
              type="button"
              onClick={onClose}
              className={`p-2 rounded-full ${style('hover:bg-[#24243E] text-slate-400 hover:text-white', 'hover:bg-slate-200 text-slate-500 hover:text-slate-800')} transition-colors`}
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`p-5 rounded-2xl ${style('neu-flat-dark', 'neu-flat-light')} flex flex-col gap-4`}>
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Top Merchants</h3>
              </div>
              <div className="h-48">
                {merchants.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={merchants} layout="vertical" margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" stroke="#8d99ae" fontSize={11} tickLine={false} axisLine={false} width={100} />
                      <Tooltip 
                        cursor={{fill: theme === 'dark' ? '#24243E' : '#E2E8F0'}}
                        contentStyle={{ backgroundColor: theme==='dark'?'#0F0F1A':'#FFF', borderColor: theme==='dark'?'#24243E':'#A3B1C6', borderRadius: '8px', color: theme==='dark'?'#EAEAEA':'#333' }}
                        formatter={(val) => [`₹${val.toLocaleString()}`, 'Spend']}
                      />
                      <Bar dataKey="Spend" radius={[0, 4, 4, 0]} barSize={16}>
                        {merchants.map((entry, idx) => (
                          <Cell key={idx} fill={theme === 'dark' ? '#FF7E67' : '#4A90E2'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-sm">No spend data</div>
                )}
              </div>
            </div>

            <div className={`p-5 rounded-2xl ${style('neu-flat-dark', 'neu-flat-light')} flex flex-col gap-4`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-slate-400" />
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">6-Month Trend</h3>
                </div>
                <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${percentChange > 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                  {percentChange > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(percentChange).toFixed(1)}% vs Last Mo
                </div>
              </div>
              <div className="h-40 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#8d99ae" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      cursor={{fill: theme === 'dark' ? '#24243E' : '#E2E8F0'}}
                      contentStyle={{ backgroundColor: theme==='dark'?'#0F0F1A':'#FFF', borderColor: theme==='dark'?'#24243E':'#A3B1C6', borderRadius: '8px', color: theme==='dark'?'#EAEAEA':'#333' }}
                      formatter={(val) => [`₹${val.toLocaleString()}`, 'Spend']}
                    />
                    <Bar dataKey="Spend" radius={[4, 4, 0, 0]} fill={theme === 'dark' ? '#A3B1C6' : '#94a3b8'} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Transaction Ledger */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Recent Transactions</h3>
            </div>
            <div className="flex flex-col gap-2">
              {categoryTxs.slice(0, 50).map(tx => (
                <div key={tx.id} className={`p-3 rounded-xl flex items-center justify-between gap-3 ${style('bg-[#1a1a2e]', 'bg-white')} border ${style('border-[#24243E]', 'border-slate-200')}`}>
                  <div className="flex flex-col min-w-0">
                    <span className={`text-sm font-bold truncate ${style('text-slate-200', 'text-slate-800')}`}>{tx.description || 'Unknown'}</span>
                    <span className="text-xs text-slate-500">{new Date(tx.date).toLocaleDateString()}</span>
                  </div>
                  <span className={`text-sm font-black whitespace-nowrap shrink-0 ${parseFloat(tx.amount) > 0 ? 'text-emerald-500' : style('text-slate-300', 'text-slate-700')}`}>
                    {parseFloat(tx.amount) > 0 ? '+' : '-'}₹{Math.abs(parseFloat(tx.amount)).toLocaleString()}
                  </span>
                </div>
              ))}
              {categoryTxs.length > 50 && (
                <div className="text-center text-sm text-slate-500 py-4">+ {categoryTxs.length - 50} older transactions</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
