import React, { useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { X, TrendingUp, TrendingDown, Store, ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';

export const AnalyticsDrilldownModal = ({ category, transactions, onClose, onOpenInLedger }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (!category) return null;

  // Filter transactions for this category
  const categoryTxs = useMemo(() => {
    return transactions.filter(t => t.category === category);
  }, [category, transactions]);

  // Aggregate by merchant
  const merchants = useMemo(() => {
    const map = {};
    categoryTxs.forEach(t => {
      const name = t.merchant || t.description || '-';
      map[name] = (map[name] || 0) + Math.abs(t.amount);
    });
    return Object.entries(map)
      .map(([name, total]) => ({ name, Spend: Math.round(total) }))
      .sort((a, b) => b.Spend - a.Spend)
      .slice(0, 5);
  }, [categoryTxs]);

  // Trend over last 6 months
  const trendData = useMemo(() => {
    const months = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short' });
      months[key] = 0;
    }

    categoryTxs.forEach(t => {
      const d = new Date(t.date);
      const key = d.toLocaleString('default', { month: 'short' });
      if (months[key] !== undefined) {
        months[key] += Math.abs(t.amount);
      }
    });

    return Object.entries(months).map(([name, spend]) => ({
      name,
      Spend: Math.round(spend)
    }));
  }, [categoryTxs]);

  // Month-over-month calculation
  const currentMonthSpend = trendData[trendData.length - 1]?.Spend || 0;
  const lastMonthSpend = trendData[trendData.length - 2]?.Spend || 0;
  const percentChange = lastMonthSpend > 0 ? ((currentMonthSpend - lastMonthSpend) / lastMonthSpend) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className={`relative w-full max-w-2xl max-h-[85vh] rounded-[16px] border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
        isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
      }`}>
        
        {/* Header */}
        <div className="p-5 border-b border-[#E4E8E3]/20 flex justify-between items-center shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight">{category}</h2>
              <Badge variant="brown" size="xs">{categoryTxs.length} Transactions</Badge>
            </div>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
              Category spending profile & merchant breakdown
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenInLedger && (
              <Button
                variant="primary"
                size="xs"
                onClick={onOpenInLedger}
                icon={ExternalLink}
              >
                Open in Ledger
              </Button>
            )}
            <button 
              type="button" 
              onClick={onClose}
              className={`p-1.5 rounded-[8px] border-0 bg-transparent cursor-pointer transition-colors ${
                isDark ? 'text-[#8B978F] hover:text-[#F1F5F2]' : 'text-[#7B877F] hover:text-[#1D2822]'
              }`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Merchants Card */}
            <div className={`p-4 rounded-[12px] border flex flex-col gap-3 ${
              isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
            }`}>
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-[#3F8F5E]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8B978F]">Top Merchants</h3>
              </div>
              <div className="h-44">
                {merchants.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={merchants} layout="vertical" margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" stroke={isDark ? '#8B978F' : '#7B877F'} fontSize={11} tickLine={false} axisLine={false} width={90} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: isDark ? '#171E19' : '#FFFFFF', 
                          borderColor: isDark ? '#2A352D' : '#E4E8E3', 
                          borderRadius: '10px', 
                          fontSize: '12px'
                        }}
                        formatter={(val) => [`₹${val.toLocaleString()}`, 'Spend']}
                      />
                      <Bar dataKey="Spend" radius={[0, 4, 4, 0]} barSize={14} fill="#3F8F5E" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-[#8B978F]">No spend records</div>
                )}
              </div>
            </div>

            {/* 6-Month Trend Card */}
            <div className={`p-4 rounded-[12px] border flex flex-col gap-3 ${
              isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
            }`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#3F8F5E]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#8B978F]">6-Month Trend</h3>
                </div>
                <div className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  percentChange > 0 ? 'bg-[#C85C5C]/15 text-[#C85C5C]' : 'bg-[#3F8F5E]/15 text-[#3F8F5E]'
                }`}>
                  {percentChange > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(percentChange).toFixed(1)}% vs Last Mo
                </div>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" stroke={isDark ? '#8B978F' : '#7B877F'} fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: isDark ? '#171E19' : '#FFFFFF', 
                        borderColor: isDark ? '#2A352D' : '#E4E8E3', 
                        borderRadius: '10px', 
                        fontSize: '12px'
                      }}
                      formatter={(val) => [`₹${val.toLocaleString()}`, 'Spend']}
                    />
                    <Bar dataKey="Spend" radius={[4, 4, 0, 0]} barSize={18} fill="#A77B58" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent Transactions List */}
          <div className={`p-4 rounded-[12px] border flex flex-col gap-3 ${
            isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
          }`}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8B978F]">Recent Activity</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {categoryTxs.slice(0, 10).map((t, i) => (
                <div key={t.id || i} className="flex items-center justify-between p-2 rounded-[8px] border text-xs bg-black/5 dark:bg-white/5">
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-semibold truncate">{t.merchant || t.description}</span>
                    <span className="text-[10px] text-[#8B978F]">{t.date}</span>
                  </div>
                  <span className="font-bold tabular-nums text-[#C85C5C] shrink-0">
                    ₹{Math.abs(t.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
