import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../utils/formatters';
import { 
  CalendarClock, 
  TrendingUp, 
  AlertTriangle, 
  ExternalLink, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  X, 
  Layers, 
  Sparkles, 
  Sliders, 
  RefreshCw,
  Clock,
  ShieldAlert,
  ArrowUpRight
} from 'lucide-react';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';

export const ManageSubscriptionsModal = ({ isOpen, onClose, onRefreshData }) => {
  const { theme } = useTheme();
  const { token, API_BASE_URL, authFetch } = useFinance();
  const toast = useToast();
  const isDark = theme === 'dark';

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'hikes', 'overlaps', 'custom', 'add'
  
  // Custom Subscription Form State
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'OTT & Video Streaming',
    amount: '',
    frequency: 'MONTHLY',
    billing_day: 1,
    next_renewal_date: new Date().toISOString().split('T')[0],
    payment_method: 'Credit Card',
    cancellation_url: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Fetch subscription intelligence from backend
  const loadSubscriptionIntelligence = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await authFetch('/api/analytics/subscriptions');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        console.error('Failed to fetch subscriptions:', res.statusText);
      }
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSubscriptionIntelligence();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handlers for Add/Edit Custom
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.amount) {
      toast.toast.warning('Please provide service name and amount');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = editingId 
        ? `/api/subscriptions/custom/${editingId}`
        : '/api/subscriptions/custom';
      const method = editingId ? 'PUT' : 'POST';

      const res = await authFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
          billing_day: parseInt(formData.billing_day, 10)
        })
      });

      if (res.ok) {
        toast.toast.success(editingId ? 'Subscription updated' : 'Custom subscription added');
        setFormData({
          name: '',
          category: 'OTT & Video Streaming',
          amount: '',
          frequency: 'MONTHLY',
          billing_day: 1,
          next_renewal_date: new Date().toISOString().split('T')[0],
          payment_method: 'Credit Card',
          cancellation_url: '',
          notes: ''
        });
        setEditingId(null);
        setActiveTab('all');
        loadSubscriptionIntelligence();
        if (onRefreshData) onRefreshData();
      } else {
        const err = await res.json();
        toast.toast.error(err.detail || 'Could not save subscription');
      }
    } catch (err) {
      console.error('Save error:', err);
      toast.toast.error('Network failure while saving');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle active/paused
  const handleToggleActive = async (subId) => {
    try {
      const res = await authFetch(`/api/subscriptions/custom/${subId}/toggle`, { method: 'PATCH' });
      if (res.ok) {
        toast.toast.info('Subscription status updated');
        loadSubscriptionIntelligence();
      }
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  // Delete custom
  const handleDeleteCustom = async (subId) => {
    const ok = await toast.confirm({
      title: 'Delete Subscription',
      message: 'Remove this subscription from your active tracking registry?',
      isDanger: true
    });
    if (!ok) return;

    try {
      const res = await authFetch(`/api/subscriptions/custom/${subId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.toast.success('Subscription deleted');
        loadSubscriptionIntelligence();
        if (onRefreshData) onRefreshData();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const subscriptions = data?.subscriptions || [];
  const priceHikes = data?.price_hikes || [];
  const overlaps = data?.redundancies || [];

  const filteredSubs = subscriptions.filter(s => {
    if (activeTab === 'custom') return s.is_custom;
    if (activeTab === 'detected') return !s.is_custom;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity" 
        onClick={onClose} 
      />

      {/* Modal Dialog */}
      <div className={`relative w-full max-w-4xl max-h-[90vh] rounded-[16px] border shadow-2xl flex flex-col overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150 ${
        isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
      }`}>
        
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-[#E4E8E3]/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-[10px] bg-[#3F8F5E]/15 text-[#3F8F5E]">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  Subscription Intelligence
                </h2>
                <Badge variant="verified">
                  {data?.total_active_count || 0} Active
                </Badge>
              </div>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                Price hike detection, category redundancy analysis, and direct provider opt-outs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={loadSubscriptionIntelligence}
              className={`p-2 rounded-[8px] border-0 bg-transparent cursor-pointer transition-colors ${
                isDark ? 'text-[#8B978F] hover:text-[#F1F5F2]' : 'text-[#7B877F] hover:text-[#1D2822]'
              }`}
              title="Refresh Intelligence"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-[#3F8F5E]' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-[8px] border-0 bg-transparent cursor-pointer transition-colors ${
                isDark ? 'text-[#8B978F] hover:text-[#F1F5F2]' : 'text-[#7B877F] hover:text-[#1D2822]'
              }`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 4-Stat Metric Strip */}
        <div className="p-4 sm:p-5 border-b border-[#E4E8E3]/20 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          <div className={`p-3.5 rounded-[10px] border ${
            isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider block ${
              isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
            }`}>Monthly Run-Rate</span>
            <span className="text-base sm:text-lg font-bold text-[#C85C5C] tabular-nums mt-0.5 block">
              {formatCurrency(data?.total_monthly_spend || 0)}
            </span>
          </div>

          <div className={`p-3.5 rounded-[10px] border ${
            isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider block ${
              isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
            }`}>Annual Commitments</span>
            <span className="text-base sm:text-lg font-bold tabular-nums mt-0.5 block">
              {formatCurrency(data?.total_annual_run_rate || 0)}
            </span>
          </div>

          <div className={`p-3.5 rounded-[10px] border ${
            isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider block ${
              isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
            }`}>Price Hikes</span>
            <span className={`text-base sm:text-lg font-bold tabular-nums mt-0.5 block ${
              priceHikes.length > 0 ? 'text-[#B78332]' : 'text-[#3F8F5E]'
            }`}>
              {priceHikes.length} {priceHikes.length === 1 ? 'Service' : 'Services'}
            </span>
          </div>

          <div className={`p-3.5 rounded-[10px] border ${
            isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider block ${
              isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
            }`}>Redundancy Savings</span>
            <span className="text-base sm:text-lg font-bold text-[#3F8F5E] tabular-nums mt-0.5 block">
              {formatCurrency(data?.potential_annual_savings || 0)}/yr
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 sm:px-6 pt-3 pb-3 flex items-center justify-between gap-3 border-b border-[#E4E8E3]/20 overflow-x-auto no-scrollbar shrink-0">
          <div className="flex items-center gap-1.5 p-1 rounded-[10px] border bg-black/5 dark:bg-white/5">
            {[
              { key: 'all', label: 'All Subscriptions', count: subscriptions.length },
              { key: 'hikes', label: 'Price Hikes', count: priceHikes.length, alert: priceHikes.length > 0 },
              { key: 'overlaps', label: 'Category Overlaps', count: overlaps.length },
              { key: 'custom', label: 'Custom / Offline', count: subscriptions.filter(s => s.is_custom).length }
            ].map(tab => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-all border-0 cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    active
                      ? 'bg-[#3F8F5E] text-white shadow-xs'
                      : isDark ? 'text-[#C2CCC5] hover:text-white' : 'text-[#4F5D55] hover:text-black'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      tab.alert 
                        ? 'bg-[#B78332]/20 text-[#B78332]' 
                        : (active ? 'bg-white/20 text-white' : isDark ? 'bg-white/10 text-[#C2CCC5]' : 'bg-black/10 text-[#4F5D55]')
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <Button
            size="xs"
            variant={activeTab === 'add' ? 'secondary' : 'primary'}
            icon={activeTab === 'add' ? X : Plus}
            onClick={() => {
              if (activeTab === 'add') {
                setActiveTab('all');
                setEditingId(null);
              } else {
                setActiveTab('add');
              }
            }}
          >
            {activeTab === 'add' ? 'Cancel' : 'Add Subscription'}
          </Button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          
          {/* TAB 1: ADD / EDIT CUSTOM SUBSCRIPTION FORM */}
          {activeTab === 'add' && (
            <div className={`p-5 rounded-[12px] border animate-in fade-in duration-150 ${
              isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
            }`}>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E4E8E3]/20">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-[#3F8F5E]" />
                  <h3 className="text-xs font-bold">
                    {editingId ? 'Edit Custom Subscription' : 'Add Custom / Offline Subscription'}
                  </h3>
                </div>
                <span className="text-[11px] text-[#8B978F]">Syncs with Financial Calendar & .ICS export</span>
              </div>

              <form onSubmit={handleFormSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                <div>
                  <label className="font-semibold text-[#8B978F] text-[11px] uppercase tracking-wider block mb-1">Service Name</label>
                  <Input
                    required
                    placeholder="e.g., Cult.fit Elite, AWS, NYT, Domain Renewal"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#8B978F] text-[11px] uppercase tracking-wider block mb-1">Category</label>
                  <Select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="OTT & Video Streaming">OTT & Video Streaming</option>
                    <option value="Music & Audio Streaming">Music & Audio Streaming</option>
                    <option value="AI & Developer Tools">AI & Developer Tools</option>
                    <option value="Fitness & Wellness">Fitness & Wellness</option>
                    <option value="Cloud Storage & Productivity">Cloud Storage & Productivity</option>
                    <option value="Food & Delivery Passes">Food & Delivery Passes</option>
                    <option value="News & Publications">News & Publications</option>
                    <option value="Utilities & Other">Utilities & Other</option>
                  </Select>
                </div>

                <div>
                  <label className="font-semibold text-[#8B978F] text-[11px] uppercase tracking-wider block mb-1">Billing Amount (₹)</label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    placeholder="299.00"
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#8B978F] text-[11px] uppercase tracking-wider block mb-1">Cadence</label>
                  <Select
                    value={formData.frequency}
                    onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="YEARLY">Yearly / Annual</option>
                    <option value="QUARTERLY">Quarterly</option>
                  </Select>
                </div>

                <div>
                  <label className="font-semibold text-[#8B978F] text-[11px] uppercase tracking-wider block mb-1">Billing Day of Month</label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={formData.billing_day}
                    onChange={e => setFormData({ ...formData, billing_day: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#8B978F] text-[11px] uppercase tracking-wider block mb-1">Next Expected Renewal</label>
                  <Input
                    type="date"
                    required
                    value={formData.next_renewal_date}
                    onChange={e => setFormData({ ...formData, next_renewal_date: e.target.value })}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-semibold text-[#8B978F] text-[11px] uppercase tracking-wider block mb-1">Cancellation / Management Portal URL</label>
                  <Input
                    type="url"
                    placeholder="https://provider.com/account/cancel"
                    value={formData.cancellation_url}
                    onChange={e => setFormData({ ...formData, cancellation_url: e.target.value })}
                  />
                </div>

                <div className="sm:col-span-2 flex justify-end gap-2 mt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setActiveTab('all');
                      setEditingId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={submitting}
                  >
                    {editingId ? 'Save Updates' : 'Add Subscription'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: PRICE HIKES */}
          {activeTab === 'hikes' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-[#B78332]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#B78332]">
                  Stealth Price Hikes Detected
                </h3>
              </div>

              {priceHikes.length === 0 ? (
                <div className={`p-8 rounded-[12px] text-center text-xs border ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#8B978F]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#7B877F]'
                }`}>
                  <CheckCircle2 className="h-8 w-8 text-[#3F8F5E] mx-auto mb-2" />
                  <p className="font-bold">No Stealth Price Hikes Detected</p>
                  <span>Your recurring charges have remained stable across billing cycles.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {priceHikes.map((hike, idx) => (
                    <div 
                      key={idx} 
                      className={`p-4 rounded-[12px] border flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-4 border-l-[#B78332] ${
                        isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold">{hike.merchant}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#B78332]/15 text-[#B78332]">
                            +{hike.hike_pct}% Hike
                          </span>
                        </div>
                        <div className="text-xs text-[#8B978F] flex items-center gap-2">
                          <span>Previous: <strong>{formatCurrency(hike.previous_amount)}</strong></span>
                          <span>→</span>
                          <span>Current: <strong className="text-[#C85C5C]">{formatCurrency(hike.current_amount)}</strong></span>
                        </div>
                        <span className="text-[11px] text-[#B78332] font-medium">
                          Annual Impact: +{formatCurrency(hike.annual_extra_cost)} / year
                        </span>
                      </div>

                      {hike.cancellation_url && (
                        <a
                          href={hike.cancellation_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-[8px] text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto no-underline bg-[#3F8F5E] text-white hover:bg-[#327349] transition-all"
                        >
                          <span>Manage / Cancel</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CATEGORY OVERLAPS & REDUNDANCY */}
          {activeTab === 'overlaps' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div>
                <h3 className="text-xs font-bold flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#3F8F5E]" />
                  Category Redundancy Advisor
                </h3>
                <p className="text-xs text-[#8B978F]">
                  Multiple active subscriptions detected in identical categories.
                </p>
              </div>

              {overlaps.length === 0 ? (
                <div className={`p-8 rounded-[12px] text-center text-xs border ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#8B978F]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#7B877F]'
                }`}>
                  <CheckCircle2 className="h-8 w-8 text-[#3F8F5E] mx-auto mb-2" />
                  <p className="font-bold">Zero Redundant Overlaps</p>
                  <span>Your subscriptions are diversified across distinct categories.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {overlaps.map((overlap, idx) => (
                    <div 
                      key={idx}
                      className={`p-4 rounded-[12px] border flex flex-col gap-2.5 ${
                        isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E4E8E3]/20 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold">{overlap.category}</span>
                          <Badge variant="brown">{overlap.active_count} Active Services</Badge>
                        </div>
                        <div className="text-xs text-[#8B978F]">
                          Spend: <strong className="text-[#C85C5C]">{formatCurrency(overlap.monthly_spend)}/mo</strong>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 py-1">
                        {overlap.services.map((srv, sIdx) => (
                          <span 
                            key={sIdx}
                            className="px-2.5 py-0.5 rounded-[6px] text-xs font-medium bg-black/5 dark:bg-white/5 border"
                          >
                            {srv}
                          </span>
                        ))}
                      </div>

                      <div className="p-2.5 rounded-[8px] flex items-center justify-between gap-3 text-xs bg-[#3F8F5E]/10 text-[#3F8F5E] border border-[#3F8F5E]/20">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 shrink-0" />
                          <span>{overlap.suggestion}</span>
                        </div>
                        <span className="font-bold whitespace-nowrap">
                          Save ~{formatCurrency(overlap.potential_rotation_savings)}/yr
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ALL SUBSCRIPTIONS LIST */}
          {(activeTab === 'all' || activeTab === 'custom' || activeTab === 'detected') && (
            <div className="space-y-2.5 animate-in fade-in duration-150">
              {filteredSubs.length === 0 ? (
                <div className={`p-8 rounded-[12px] text-center text-xs border ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#8B978F]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#7B877F]'
                }`}>
                  <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-40 text-[#8B978F]" />
                  <p className="font-bold">No Subscriptions Found</p>
                  <span>Click "Add Subscription" to register custom offline or annual plans.</span>
                </div>
              ) : (
                filteredSubs.map((sub, idx) => {
                  const hasPriceHike = priceHikes.some(h => h.merchant.toUpperCase() === sub.name.toUpperCase());
                  return (
                    <div 
                      key={sub.id || idx}
                      className={`p-3.5 rounded-[12px] border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                        isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                      } ${!sub.is_active ? 'opacity-60' : ''}`}
                    >
                      {/* Left: Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-[8px] bg-[#3F8F5E]/15 text-[#3F8F5E] shrink-0">
                          <CalendarClock className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold truncate">
                              {sub.name}
                            </span>
                            <Badge variant="brown" size="xs">{sub.category}</Badge>
                            {sub.is_custom && <Badge variant="neutral" size="xs">Custom</Badge>}
                            {hasPriceHike && <Badge variant="warning" size="xs">▲ Hike</Badge>}
                          </div>
                          <div className="text-[11px] text-[#8B978F] flex items-center gap-2 mt-0.5 flex-wrap">
                            <span>{sub.frequency}</span>
                            <span>•</span>
                            <span>{sub.payment_method}</span>
                            {sub.next_expected_date && (
                              <>
                                <span>•</span>
                                <span>Next: {new Date(sub.next_expected_date).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Cost & Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="text-left sm:text-right">
                          <span className="text-sm font-bold text-[#C85C5C] tabular-nums block">
                            {formatCurrency(sub.amount)}
                          </span>
                          <span className="text-[10px] font-semibold text-[#8B978F] uppercase tracking-wider block">
                            {sub.frequency}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {sub.cancellation_url && (
                            <a
                              href={sub.cancellation_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-[6px] text-xs font-semibold flex items-center gap-1 no-underline bg-[#3F8F5E] text-white hover:bg-[#327349] transition-all"
                              title="Open Management Portal"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}

                          {sub.is_custom && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleActive(sub.id)}
                                className={`px-2 py-1 rounded-[6px] text-[11px] font-medium border cursor-pointer transition-all ${
                                  isDark ? 'bg-[#171E19] border-[#2A352D] text-[#C2CCC5]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#4F5D55]'
                                }`}
                              >
                                {sub.is_active ? 'Pause' : 'Resume'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCustom(sub.id)}
                                className="p-1.5 text-[#C85C5C] hover:opacity-80 border-0 bg-transparent cursor-pointer transition-colors"
                                title="Delete Subscription"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
