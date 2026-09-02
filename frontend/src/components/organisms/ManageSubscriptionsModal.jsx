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
  const { theme, style } = useTheme();
  const { token, API_BASE_URL, authFetch } = useFinance();
  const toast = useToast();

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

  const apiBase = API_BASE_URL || '';

  const loadSubscriptionIntelligence = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await (authFetch ? authFetch(`${apiBase}/api/subscriptions/intelligence`) : fetch(`${apiBase}/api/subscriptions/intelligence`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }));
      if (res.ok) {
        const payload = await res.json();
        setData(payload);
      }
    } catch (e) {
      console.error("Error loading subscription intelligence:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSubscriptionIntelligence();
    }
  }, [isOpen]);

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.amount) {
      toast.error('Please enter a subscription name and amount.');
      return;
    }

    setSubmitting(true);
    try {
      const url = editingId 
        ? `${apiBase}/api/subscriptions/custom/${editingId}`
        : `${apiBase}/api/subscriptions/custom`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await (authFetch ? authFetch(url, {
        method,
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
          billing_day: parseInt(formData.billing_day || 1)
        })
      }) : fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
          billing_day: parseInt(formData.billing_day || 1)
        })
      }));

      if (res.ok) {
        toast.success(editingId ? 'Subscription updated.' : 'Custom subscription added.');
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
        toast.error('Failed to save subscription.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error connecting to server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCustom = async (subId) => {
    const rawId = subId.replace('custom-', '');
    try {
      const res = await (authFetch ? authFetch(`${apiBase}/api/subscriptions/custom/${rawId}`, {
        method: 'DELETE'
      }) : fetch(`${apiBase}/api/subscriptions/custom/${rawId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      }));

      if (res.ok) {
        toast.success('Subscription deleted.');
        loadSubscriptionIntelligence();
        if (onRefreshData) onRefreshData();
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete subscription.');
    }
  };

  const handleToggleActive = async (subId) => {
    const rawId = subId.replace('custom-', '');
    try {
      const res = await (authFetch ? authFetch(`${apiBase}/api/subscriptions/custom/${rawId}/toggle`, {
        method: 'POST'
      }) : fetch(`${apiBase}/api/subscriptions/custom/${rawId}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }));

      if (res.ok) {
        loadSubscriptionIntelligence();
        if (onRefreshData) onRefreshData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  const priceHikes = data?.price_hikes || [];
  const overlaps = data?.category_overlaps || [];
  const subscriptions = data?.subscriptions || [];

  const filteredSubs = subscriptions.filter(s => {
    if (activeTab === 'custom') return s.is_custom;
    if (activeTab === 'detected') return !s.is_custom;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`w-full max-w-4xl max-h-[90vh] rounded-3xl flex flex-col border-0 shadow-2xl overflow-hidden transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${style('neu-inset-dark text-[#5EEAD4]', 'neu-inset-light text-[#0F766E]')}`}>
              <CalendarClock className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-xl font-black tracking-tight ${style('text-[#F4F7FA]', 'text-[#17202A]')}`}>
                  Subscription Intelligence & Management
                </h2>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#5EEAD4]/15 text-[#5EEAD4] border border-[#5EEAD4]/20">
                  {data?.total_active_count || 0} Active
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Stealth price hike detection, category redundancy analysis, and direct provider opt-outs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadSubscriptionIntelligence}
              className={`p-2 rounded-xl border-0 bg-transparent cursor-pointer transition-colors ${style('text-slate-400 hover:text-white', 'text-slate-600 hover:text-black')}`}
              title="Refresh Intelligence"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-[#5EEAD4]' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-xl border-0 bg-transparent cursor-pointer transition-colors ${style('text-slate-400 hover:text-white', 'text-slate-600 hover:text-black')}`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 4-Stat Metric Strip */}
        <div className="p-5 sm:p-6 border-b border-slate-800/10 grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
          <div className={`p-4 rounded-2xl ${style('neu-inset-dark', 'neu-inset-light')}`}>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Monthly Run-Rate</span>
            <span className="text-lg sm:text-xl font-black text-rose-400 tabular-nums mt-1 block">
              {formatCurrency(data?.total_monthly_spend || 0)}
            </span>
          </div>

          <div className={`p-4 rounded-2xl ${style('neu-inset-dark', 'neu-inset-light')}`}>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Annual Commitments</span>
            <span className="text-lg sm:text-xl font-black tabular-nums mt-1 block">
              {formatCurrency(data?.total_annual_run_rate || 0)}
            </span>
          </div>

          <div className={`p-4 rounded-2xl ${style('neu-inset-dark', 'neu-inset-light')}`}>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Price Hikes Detected</span>
            <span className={`text-lg sm:text-xl font-black tabular-nums mt-1 block ${priceHikes.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {priceHikes.length} {priceHikes.length === 1 ? 'Service' : 'Services'}
            </span>
          </div>

          <div className={`p-4 rounded-2xl ${style('neu-inset-dark', 'neu-inset-light')}`}>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Redundancy Savings</span>
            <span className="text-lg sm:text-xl font-black text-emerald-400 tabular-nums mt-1 block">
              {formatCurrency(data?.potential_annual_savings || 0)}/yr
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 sm:px-6 pt-4 flex items-center justify-between gap-3 border-b border-slate-800/10 overflow-x-auto no-scrollbar shrink-0">
          <div className="flex items-center gap-2">
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
                  className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all border-0 cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    active
                      ? style('neu-flat-dark text-[#5EEAD4]', 'bg-[#0F766E] text-white shadow-md')
                      : style('text-slate-400 hover:text-slate-200', 'text-slate-600 hover:text-slate-900')
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      tab.alert ? 'bg-amber-500/20 text-amber-400' : (active ? 'bg-[#5EEAD4]/20 text-[#5EEAD4]' : 'bg-slate-700/40 text-slate-400')
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <Button
            size="sm"
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
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 custom-scrollbar">
          
          {/* TAB 1: ADD / EDIT CUSTOM SUBSCRIPTION FORM */}
          {activeTab === 'add' && (
            <div className={`p-6 rounded-3xl border-0 animate-in fade-in duration-200 ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/10">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-[#5EEAD4]" />
                  <h3 className="text-sm font-bold">
                    {editingId ? 'Edit Custom Subscription' : 'Add Custom / Offline Subscription'}
                  </h3>
                </div>
                <span className="text-xs text-slate-400">Syncs with Financial Calendar & .ICS export</span>
              </div>

              <form onSubmit={handleFormSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Service Name</label>
                  <Input
                    required
                    placeholder="e.g., Cult.fit Elite, AWS, NYT, Domain Renewal"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Category</label>
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
                  <label className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Amount (₹)</label>
                  <Input
                    required
                    type="number"
                    step="any"
                    placeholder="e.g. 649.00"
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Billing Frequency</label>
                  <Select
                    value={formData.frequency}
                    onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="ANNUAL">Annual / Yearly</option>
                    <option value="QUARTERLY">Quarterly (3 Months)</option>
                    <option value="WEEKLY">Weekly</option>
                  </Select>
                </div>

                <div>
                  <label className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Next Renewal Date</label>
                  <Input
                    type="date"
                    value={formData.next_renewal_date}
                    onChange={e => setFormData({ ...formData, next_renewal_date: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Payment Method / Account</label>
                  <Input
                    placeholder="e.g. HDFC Credit Card, UPI AutoPay, SBI Bank"
                    value={formData.payment_method}
                    onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Cancellation / Management URL (Optional)</label>
                  <Input
                    placeholder="https://provider.com/account/subscription"
                    value={formData.cancellation_url}
                    onChange={e => setFormData({ ...formData, cancellation_url: e.target.value })}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Notes / Plan Details</label>
                  <Input
                    placeholder="Family plan, 4 screens, billed annually..."
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>

                <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
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
                    disabled={submitting}
                    icon={CheckCircle2}
                  >
                    {submitting ? 'Saving...' : (editingId ? 'Update Subscription' : 'Save Custom Subscription')}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: PRICE HIKES DETECTED */}
          {activeTab === 'hikes' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-400" />
                    Stealth Inflation & Price Hike Alerts
                  </h3>
                  <p className="text-xs text-slate-400">
                    Services that have increased their recurring price compared to prior billing cycles.
                  </p>
                </div>
              </div>

              {priceHikes.length === 0 ? (
                <div className={`p-8 rounded-3xl text-center text-xs text-slate-400 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                  <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                  <p className="font-bold">No Stealth Price Hikes Detected</p>
                  <span className="text-slate-500">Your recurring charges have remained stable across billing cycles.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {priceHikes.map((hike, idx) => (
                    <div 
                      key={idx} 
                      className={`p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-amber-400 ${style('neu-flat-dark', 'neu-flat-light')}`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black">{hike.merchant}</span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                            +{hike.hike_pct}% Hike
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-2">
                          <span>Previous: <strong className="text-slate-300">{formatCurrency(hike.previous_amount)}</strong></span>
                          <span>→</span>
                          <span>Current: <strong className="text-rose-400">{formatCurrency(hike.current_amount)}</strong></span>
                          <span>· Hike Date: {new Date(hike.hike_date).toLocaleDateString()}</span>
                        </div>
                        <span className="text-xs text-amber-300/90 font-medium">
                          Annual Inflation Impact: +{formatCurrency(hike.annual_extra_cost)} / year
                        </span>
                      </div>

                      {hike.cancellation_url && (
                        <a
                          href={hike.cancellation_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto no-underline transition-all ${style('neu-btn-dark text-[#5EEAD4]', 'bg-[#0F766E] text-white')}`}
                        >
                          <span>Manage / Cancel</span>
                          <ExternalLink className="h-3.5 w-3.5" />
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
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#5EEAD4]" />
                  Category Redundancy & Rotation Advisor
                </h3>
                <p className="text-xs text-slate-400">
                  Multiple active subscriptions in identical entertainment or productivity categories.
                </p>
              </div>

              {overlaps.length === 0 ? (
                <div className={`p-8 rounded-3xl text-center text-xs text-slate-400 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                  <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                  <p className="font-bold">Zero Redundant Overlaps</p>
                  <span className="text-slate-500">Your subscriptions are diversified across distinct categories.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {overlaps.map((overlap, idx) => (
                    <div 
                      key={idx}
                      className={`p-5 rounded-3xl flex flex-col gap-3 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/10 pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-black">{overlap.category}</span>
                          <Badge variant="brand">{overlap.active_count} Active Services</Badge>
                        </div>
                        <div className="text-xs font-bold text-slate-400">
                          Total Category Spend: <strong className="text-rose-400">{formatCurrency(overlap.monthly_spend)}/mo</strong> ({formatCurrency(overlap.annual_spend)}/yr)
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 py-1">
                        {overlap.services.map((srv, sIdx) => (
                          <span 
                            key={sIdx}
                            className={`px-3 py-1 rounded-xl text-xs font-bold ${style('neu-inset-dark text-slate-200', 'neu-inset-light text-slate-800')}`}
                          >
                            {srv}
                          </span>
                        ))}
                      </div>

                      <div className={`p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs ${style('bg-emerald-500/10 text-emerald-300 border border-emerald-500/20', 'bg-emerald-50 text-emerald-800')}`}>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
                          <span>{overlap.suggestion}</span>
                        </div>
                        <span className="font-black whitespace-nowrap text-emerald-400">
                          Save ~{formatCurrency(overlap.potential_rotation_savings)}/yr
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ALL / CUSTOM / DETECTED SUBSCRIPTIONS LIST */}
          {(activeTab === 'all' || activeTab === 'custom' || activeTab === 'detected') && (
            <div className="space-y-3 animate-in fade-in duration-200">
              {filteredSubs.length === 0 ? (
                <div className={`p-12 rounded-3xl text-center text-xs text-slate-400 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                  <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="font-bold">No Subscriptions in this view</p>
                  <span className="text-slate-500">Click "Add Subscription" to register custom offline or annual plans.</span>
                </div>
              ) : (
                filteredSubs.map((sub, idx) => {
                  const hasPriceHike = priceHikes.some(h => h.merchant.toUpperCase() === sub.name.toUpperCase());
                  return (
                    <div 
                      key={sub.id || idx}
                      className={`p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')} ${!sub.is_active ? 'opacity-60' : ''}`}
                    >
                      {/* Left: Info */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`p-2.5 rounded-2xl shrink-0 ${style('neu-inset-dark text-[#5EEAD4]', 'neu-inset-light text-[#0F766E]')}`}>
                          <CalendarClock className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-black truncate ${style('text-[#F4F7FA]', 'text-[#17202A]')}`}>
                              {sub.name}
                            </span>
                            <Badge variant="brand">{sub.category}</Badge>
                            {sub.is_custom && <Badge variant="neutral">Custom</Badge>}
                            {hasPriceHike && <Badge variant="warning">▲ Hike Detected</Badge>}
                            {!sub.is_active && <Badge variant="danger">Paused</Badge>}
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-2 mt-1 flex-wrap">
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
                          {sub.notes && (
                            <span className="text-[11px] text-slate-500 italic mt-0.5">{sub.notes}</span>
                          )}
                        </div>
                      </div>

                      {/* Right: Cost & Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                        <div className="text-left sm:text-right">
                          <span className="text-base font-black text-rose-400 tabular-nums block">
                            {formatCurrency(sub.amount)}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                            {sub.frequency}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {sub.cancellation_url && (
                            <a
                              href={sub.cancellation_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 no-underline transition-all ${style('neu-btn-dark text-[#5EEAD4]', 'neu-btn-light text-[#0F766E]')}`}
                              title="Open Provider Management / Cancel Portal"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}

                          {sub.is_custom && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleActive(sub.id)}
                                className={`p-2 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all ${style('neu-btn-dark text-slate-300', 'neu-btn-light text-slate-600')}`}
                                title={sub.is_active ? "Pause Subscription" : "Resume Subscription"}
                              >
                                {sub.is_active ? 'Pause' : 'Resume'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCustom(sub.id)}
                                className="p-2 rounded-xl text-xs font-bold text-rose-400 hover:text-rose-300 border-0 bg-transparent cursor-pointer transition-colors"
                                title="Delete Custom Subscription"
                              >
                                <Trash2 className="h-4 w-4" />
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
