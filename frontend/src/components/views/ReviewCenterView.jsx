import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  FileText, 
  Sliders, 
  Plus, 
  Trash2, 
  HelpCircle, 
  Download, 
  Lock, 
  Unlock, 
  ArrowRight,
  TrendingDown,
  Clock,
  Layers,
  Sparkles,
  Search,
  Eye
} from 'lucide-react';

export const ReviewCenterView = () => {
  const { theme, style } = useTheme();
  const { token, API_BASE_URL , authFetch} = useFinance();

  const [activeTab, setActiveTab] = useState('reconciliation');
  const [loading, setLoading] = useState(false);

  // Reconciliation data
  const [reconciliations, setReconciliations] = useState([]);
  
  // Review Queue data
  const [reviewQueue, setReviewQueue] = useState({ critical: [], important: [], review: [], informational: [] });
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  // Rules data
  const [rules, setRules] = useState([]);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRule, setNewRule] = useState({ match_pattern: '', match_field: 'raw_text', target_category: 'Shopping', priority: 100 });
  const [ruleSimResult, setRuleSimResult] = useState(null);
  const [simulating, setSimulating] = useState(false);

  // Provenance Modal
  const [selectedTxProvenance, setSelectedTxProvenance] = useState(null);
  const [showProvenanceModal, setShowProvenanceModal] = useState(false);

  // Backup & Restore
  const [passphrase, setPassphrase] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupResult, setBackupResult] = useState(null);
  const [testRestoreResult, setTestRestoreResult] = useState(null);

  // Mandates & Fees
  const [mandatesAndFees, setMandatesAndFees] = useState(null);

  const fetchHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }), [token]);

  const apiBase = API_BASE_URL || '';

  const loadReconciliations = async () => {
    try {
      const res = await fetch(`${apiBase}/api/reconciliation/dashboard`, { headers: fetchHeaders });
      if (res.ok) setReconciliations(await res.json());
    } catch (e) { console.error(e); }
  };

  const loadReviewQueue = async () => {
    try {
      const res = await fetch(`${apiBase}/api/review-queue`, { headers: fetchHeaders });
      if (res.ok) setReviewQueue(await res.json());
    } catch (e) { console.error(e); }
  };

  const loadRules = async () => {
    try {
      const res = await fetch(`${apiBase}/api/rules`, { headers: fetchHeaders });
      if (res.ok) setRules(await res.json());
    } catch (e) { console.error(e); }
  };

  const loadMandatesAndFees = async () => {
    try {
      const res = await fetch(`${apiBase}/api/analytics/mandates-fees`, { headers: fetchHeaders });
      if (res.ok) setMandatesAndFees(await res.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      loadReconciliations(),
      loadReviewQueue(),
      loadRules(),
      loadMandatesAndFees()
    ]).finally(() => setLoading(false));
  }, [token, API_BASE_URL]);

  const handleResolveItem = async (txId, action, newCat = null, createRule = false) => {
    try {
      const res = await fetch(`${apiBase}/api/review-queue/resolve`, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify({ transaction_id: txId, action, new_category: newCat, create_rule: createRule })
      });
      if (res.ok) {
        loadReviewQueue();
        loadReconciliations();
      }
    } catch (e) { console.error(e); }
  };

  const handleViewProvenance = async (txId) => {
    try {
      const res = await fetch(`${apiBase}/api/provenance/${txId}`, { headers: fetchHeaders });
      if (res.ok) {
        setSelectedTxProvenance(await res.json());
        setShowProvenanceModal(true);
      }
    } catch (e) { console.error(e); }
  };

  const handleSimulateRule = async () => {
    if (!newRule.match_pattern.trim()) return;
    setSimulating(true);
    try {
      const res = await fetch(`${apiBase}/api/rules/test`, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(newRule)
      });
      if (res.ok) setRuleSimResult(await res.json());
    } catch (e) { console.error(e); }
    finally { setSimulating(false); }
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiBase}/api/rules`, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(newRule)
      });
      if (res.ok) {
        setShowAddRule(false);
        setNewRule({ match_pattern: '', match_field: 'raw_text', target_category: 'Shopping', priority: 100 });
        setRuleSimResult(null);
        loadRules();
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      const res = await fetch(`${apiBase}/api/rules/${ruleId}`, {
        method: 'DELETE',
        headers: fetchHeaders
      });
      if (res.ok) loadRules();
    } catch (e) { console.error(e); }
  };

  const handleCreateWbrBackup = async () => {
    if (!passphrase.trim()) {
      alert("Please enter a passphrase to encrypt your financial backup.");
      return;
    }
    setBackupLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/backup/export-wbr`, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify({ passphrase })
      });
      if (res.ok) {
        const data = await res.json();
        setBackupResult(data);
        
        // Auto download .wbr archive
        const element = document.createElement("a");
        element.href = `data:application/octet-stream;base64,${data.wbr_base64}`;
        element.download = data.filename;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
      }
    } catch (e) { console.error(e); }
    finally { setBackupLoading(false); }
  };

  const handleTestRestore = async () => {
    if (!backupResult?.wbr_base64 || !passphrase) return;
    try {
      const res = await fetch(`${apiBase}/api/backup/test-restore`, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify({ wbr_base64: backupResult.wbr_base64, passphrase })
      });
      if (res.ok) setTestRestoreResult(await res.json());
    } catch (e) { console.error(e); }
  };

  const subTabs = [
    { key: 'reconciliation', label: 'Balance Reconciliation', icon: ShieldCheck },
    { key: 'review_queue', label: 'Review Queue', count: reviewQueue.total_items_count, icon: AlertTriangle },
    { key: 'rules', label: 'Rules & Simulation', count: rules.length, icon: Sliders },
    { key: 'fees_mandates', label: 'Fees & AutoPay', icon: TrendingDown },
    { key: 'backup', label: 'Encrypted Backup (.wbr)', icon: Lock }
  ];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 pb-16">
      
      {/* Header Banner */}
      <div className={`p-5 sm:p-6 rounded-3xl border-0 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-2xl flex items-center justify-center ${style('neu-flat-dark text-indigo-400', 'neu-flat-light text-indigo-600')}`}>
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${style('text-white', 'text-slate-800')}`}>
                Data Integrity & Review Center
              </h1>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                Audit Trail
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Mathematical balance proofs, document provenance, prioritized review queue, and encrypted .wbr backups.
            </p>
          </div>
        </div>
      </div>

      {/* Segmented Sub-Navigation Grid */}
      <div className={`p-1.5 rounded-2xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 ${style('neu-inset-dark', 'neu-inset-light')}`}>
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
                  ? style('neu-flat-dark text-indigo-400 ring-1 ring-indigo-500/30', 'bg-indigo-600 text-white shadow-md')
                  : style('text-slate-400 hover:text-slate-200 hover:bg-white/5', 'text-slate-600 hover:text-slate-900 hover:bg-black/5')
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t.label}</span>
              {t.count !== undefined && t.count > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-indigo-500/30 text-indigo-200">
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 1. BALANCE RECONCILIATION TAB */}
      {activeTab === 'reconciliation' && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reconciliations.map((rec, idx) => (
              <div key={idx} className={`p-5 rounded-3xl border-0 flex flex-col justify-between gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400">{rec.account_name}</span>
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                      rec.is_verified ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {rec.status}
                    </span>
                  </div>
                  <h3 className={`text-xl font-black mt-2 ${style('text-white', 'text-slate-800')}`}>
                    {formatCurrency(rec.reported_closing_balance)}
                  </h3>
                  <p className="text-xs font-mono text-slate-400 mt-1">{rec.formula}</p>
                </div>

                <div className="pt-3 border-t border-slate-700/30 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400">Total Credits: </span>
                    <span className="text-emerald-400 font-bold">+{formatCurrency(rec.total_credits)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Debits: </span>
                    <span className="text-rose-400 font-bold">-{formatCurrency(rec.total_debits)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. PRIORITIZED REVIEW QUEUE TAB */}
      {activeTab === 'review_queue' && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2 flex-wrap">
            {['ALL', 'CRITICAL', 'IMPORTANT', 'REVIEW', 'INFORMATIONAL'].map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPriorityFilter(p)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer ${
                  priorityFilter === p
                    ? style('neu-flat-dark text-indigo-400 ring-1 ring-indigo-500/30', 'bg-indigo-600 text-white')
                    : style('neu-inset-dark text-slate-400', 'neu-inset-light text-slate-600')
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {['critical', 'important', 'review', 'informational'].map(bucketKey => {
              const bucketItems = reviewQueue[bucketKey] || [];
              if (priorityFilter !== 'ALL' && priorityFilter !== bucketKey.toUpperCase()) return null;
              if (bucketItems.length === 0) return null;

              return (
                <div key={bucketKey} className="flex flex-col gap-2">
                  <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                    {bucketKey.toUpperCase()} ({bucketItems.length})
                  </h4>

                  {bucketItems.map(item => (
                    <div key={item.id} className={`p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 ${style('neu-inset-dark', 'neu-inset-light')}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            bucketKey === 'critical' ? 'bg-rose-500/20 text-rose-400' :
                            bucketKey === 'important' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-300'
                          }`}>
                            {item.type}
                          </span>
                          <span className={`text-sm font-bold ${style('text-white', 'text-slate-800')}`}>{item.title}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{item.reason}</p>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-auto">
                        <button
                          type="button"
                          onClick={() => handleViewProvenance(item.id)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-700/30 text-slate-300 hover:text-white border-0 cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" /> Provenance
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveItem(item.id, 'MARK_TRANSFER')}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-700/30 text-slate-300 hover:text-white border-0 cursor-pointer"
                        >
                          Transfer
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveItem(item.id, 'CONFIRM')}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600/80 text-white border-0 cursor-pointer"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. RULES & SIMULATION TAB */}
      {activeTab === 'rules' && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-lg font-bold ${style('text-white', 'text-slate-800')}`}>Classification Override Rules</h3>
              <p className="text-xs text-slate-400">Deterministic hierarchy evaluated before standard classification</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddRule(true)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border-0 cursor-pointer ${style('neu-btn-dark text-indigo-400', 'bg-indigo-600 text-white')}`}
            >
              <Plus className="h-4 w-4" /> Create Rule
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rules.map(r => (
              <div key={r.id} className={`p-4 rounded-2xl border-0 flex items-center justify-between ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-400 font-mono">"{r.match_pattern}"</span>
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                    <span className={`text-xs font-bold ${style('text-white', 'text-slate-800')}`}>{r.target_category}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold mt-1">Priority: {r.priority}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteRule(r.id)}
                  className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/10 border-0 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. FEES & MANDATES TAB */}
      {activeTab === 'fees_mandates' && mandatesAndFees && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`p-6 rounded-3xl border-0 flex flex-col justify-between ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Banking Fees</span>
                <h3 className="text-2xl font-black text-rose-400 mt-2">
                  {formatCurrency(mandatesAndFees.fees?.total_fees || 0)}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Potentially avoidable fees: <strong className="text-white">{formatCurrency(mandatesAndFees.fees?.avoidable_fees || 0)}</strong> ({mandatesAndFees.fees?.avoidable_percentage}%)
                </p>
              </div>
            </div>

            <div className={`p-6 rounded-3xl border-0 flex flex-col justify-between ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Monthly AutoPay Commitments</span>
                <h3 className="text-2xl font-black text-indigo-400 mt-2">
                  {formatCurrency(mandatesAndFees.mandates?.total_monthly_committed || 0)}/mo
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Across {mandatesAndFees.mandates?.total_active_mandates || 0} active UPI AutoPay and NACH mandates
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. ENCRYPTED BACKUP TAB */}
      {activeTab === 'backup' && (
        <div className="flex flex-col gap-6">
          <div className={`p-6 rounded-3xl border-0 flex flex-col gap-4 max-w-xl ${style('neu-flat-dark', 'neu-flat-light')}`}>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-indigo-400" />
              <h3 className={`text-lg font-bold ${style('text-white', 'text-slate-800')}`}>Create Encrypted Backup (.wbr)</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              WiseRaman exports your database, documents, and rules into an authenticated <strong>AES-256-GCM + Argon2id</strong> encrypted archive.
            </p>

            <div>
              <label className="text-xs font-bold text-slate-400">Encryption Passphrase</label>
              <input
                type="password"
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                placeholder="Enter strong passphrase..."
                className={`w-full p-3 rounded-xl mt-1 text-sm ${style('neu-inset-dark text-white', 'neu-inset-light text-slate-800')}`}
              />
            </div>

            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={handleCreateWbrBackup}
                disabled={backupLoading}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 text-white border-0 cursor-pointer flex items-center gap-1.5"
              >
                <Download className="h-4 w-4" /> {backupLoading ? "Encrypting..." : "Export .wbr Backup"}
              </button>

              {backupResult && (
                <button
                  type="button"
                  onClick={handleTestRestore}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600/80 text-white border-0 cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" /> Test Restore
                </button>
              )}
            </div>

            {testRestoreResult && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex flex-col gap-1 mt-2">
                <strong>✓ Test Restore Succeeded:</strong>
                <span>Archive verified with {testRestoreResult.record_counts?.transactions || 0} transactions and {testRestoreResult.record_counts?.accounts || 0} accounts.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODALS --- */}
      {/* Create Rule Modal with Instant Simulator */}
      {showAddRule && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-lg p-6 rounded-3xl shadow-2xl ${style('bg-[#1E1E2E] text-white', 'bg-white text-slate-800')}`}>
            <h3 className="text-lg font-bold mb-4">Create Classification Rule</h3>
            <form onSubmit={handleSaveRule} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-400">Match Pattern (Narration or Merchant)</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    required
                    value={newRule.match_pattern}
                    onChange={e => setNewRule({ ...newRule, match_pattern: e.target.value })}
                    className={`flex-1 p-2.5 rounded-xl text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                    placeholder="e.g. STARBUCKS"
                  />
                  <button
                    type="button"
                    onClick={handleSimulateRule}
                    className="px-3 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 text-white border-0 cursor-pointer whitespace-nowrap"
                  >
                    {simulating ? "Testing..." : "Test Impact"}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400">Target Category</label>
                <select
                  value={newRule.target_category}
                  onChange={e => setNewRule({ ...newRule, target_category: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark text-white', 'neu-inset-light text-slate-800')}`}
                >
                  <option value="Food & Dining">Food & Dining</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Groceries">Groceries</option>
                  <option value="Travel">Travel</option>
                  <option value="Utilities">Utilities</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Health">Health</option>
                  <option value="Transfer">Transfer</option>
                </select>
              </div>

              {/* Simulation Result Preview */}
              {ruleSimResult && (
                <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-xs flex flex-col gap-1">
                  <strong className="text-indigo-400">Simulation Preview:</strong>
                  <span>Matches <strong>{ruleSimResult.matched_count}</strong> historical transactions totaling <strong>{formatCurrency(ruleSimResult.total_affected_amount)}</strong>.</span>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => { setShowAddRule(false); setRuleSimResult(null); }} className="px-4 py-2 text-xs font-bold rounded-xl border-0 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white border-0 cursor-pointer">Save Rule</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Provenance Modal */}
      {showProvenanceModal && selectedTxProvenance && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-6 rounded-3xl shadow-2xl ${style('bg-[#1E1E2E] text-white', 'bg-white text-slate-800')}`}>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-400" /> Document Provenance
            </h3>
            <div className="flex flex-col gap-2.5 text-xs text-slate-300">
              <div>
                <span className="text-slate-400">Source Document:</span>
                <div className="font-bold text-white mt-0.5">{selectedTxProvenance.document_name}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400">Page Number:</span>
                  <div className="font-bold text-white">Page {selectedTxProvenance.source_page}</div>
                </div>
                <div>
                  <span className="text-slate-400">Confidence:</span>
                  <div className="font-bold text-emerald-400">{(selectedTxProvenance.extraction_confidence * 100).toFixed(1)}%</div>
                </div>
              </div>
              <div>
                <span className="text-slate-400">Coordinates / Bounding Box:</span>
                <div className="font-mono text-indigo-300">{selectedTxProvenance.source_coordinates}</div>
              </div>
              <div>
                <span className="text-slate-400">Parser:</span>
                <div className="font-semibold">{selectedTxProvenance.parser_name} ({selectedTxProvenance.parser_version})</div>
              </div>
            </div>
            <div className="flex justify-end mt-5">
              <button type="button" onClick={() => setShowProvenanceModal(false)} className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white border-0 cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
