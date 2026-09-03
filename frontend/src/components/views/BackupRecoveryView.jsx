import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useDialog } from '../../context/ToastContext';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { 
  Database, 
  CheckCircle2, 
  ShieldCheck, 
  Download, 
  Upload, 
  Lock, 
  AlertTriangle, 
  ArrowRight,
  Clock,
  KeyRound,
  Landmark,
  ArrowLeftRight,
  Sliders,
  Target,
  Building2,
  CreditCard,
  CheckSquare,
  Square,
  RotateCcw,
  Info,
  Layers,
  Check
} from 'lucide-react';

export const AVAILABLE_ENTITIES = [
  {
    key: 'accounts',
    label: 'Accounts & Balances',
    description: 'Bank savings, current accounts, asset classifications, and closing balances',
    icon: Landmark,
    color: '#10B981'
  },
  {
    key: 'transactions',
    label: 'Transactions Ledger',
    description: 'Historical entries, narration texts, payment rails, amounts, and dates',
    icon: ArrowLeftRight,
    color: '#3B82F6'
  },
  {
    key: 'rules',
    label: 'Categorization Rules',
    description: 'Deterministic user matching patterns and target category assignments',
    icon: Sliders,
    color: '#8B5CF6'
  },
  {
    key: 'goals',
    label: 'Financial Goals',
    description: 'Emergency fund milestones, target amounts, and savings deadlines',
    icon: Target,
    color: '#F59E0B'
  },
  {
    key: 'loans',
    label: 'Loans & Mortgages',
    description: 'Lender terms, outstanding balances, interest rates, and EMI schedules',
    icon: Building2,
    color: '#F43F5E'
  },
  {
    key: 'credit_cards',
    label: 'Credit Card Profiles',
    description: 'Card details, networks, reward currencies, and statement cycle days',
    icon: CreditCard,
    color: '#06B6D4'
  }
];

export const BackupRecoveryView = () => {
  const { theme } = useTheme();
  const { authFetch, fetchData } = useFinance();
  const { alert, toast } = useDialog();
  const isDark = theme === 'dark';

  // Export state
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportEntities, setExportEntities] = useState([
    'accounts', 'transactions', 'rules', 'goals', 'loans', 'credit_cards'
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [backupResult, setBackupResult] = useState(null);

  // Restore state
  const [restoreStep, setRestoreStep] = useState(1); // 1: Select, 2: Passphrase, 3: Selective Checkboxes, 4: Confirmed
  const [restoreFileBase64, setRestoreFileBase64] = useState('');
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restoreTesting, setRestoreTesting] = useState(false);
  const [restoreTestResult, setRestoreTestResult] = useState(null);
  const [restoreError, setRestoreError] = useState('');
  const [selectedRestoreEntities, setSelectedRestoreEntities] = useState([]);
  const [conflictStrategy, setConflictStrategy] = useState('skip_duplicates'); // 'skip_duplicates' | 'overwrite'
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFinalResult, setRestoreFinalResult] = useState(null);

  // Toggle export entity
  const toggleExportEntity = (key) => {
    setExportEntities((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Toggle restore entity
  const toggleRestoreEntity = (key) => {
    setSelectedRestoreEntities((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Handle Export Encrypted Backup calling real /api/backup/export-wbr
  const handleCreateBackup = async () => {
    if (!exportPassphrase.trim() || exportPassphrase.length < 6) {
      await alert({
        title: 'Passphrase Required',
        message: 'Please enter a strong encryption passphrase of at least 6 characters to secure your backup archive.',
        type: 'warning'
      });
      return;
    }

    if (exportEntities.length === 0) {
      await alert({
        title: 'No Data Selected',
        message: 'Please select at least one dataset to include in your backup.',
        type: 'warning'
      });
      return;
    }

    setIsCreating(true);
    setBackupResult(null);
    try {
      const res = await authFetch('/api/backup/export-wbr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          passphrase: exportPassphrase.trim(),
          selected_entities: exportEntities
        })
      });

      if (res.ok) {
        const data = await res.json();
        setBackupResult(data);

        // Trigger file download of .wbr archive
        const blob = new Blob([Uint8Array.from(atob(data.wbr_base64), c => c.charCodeAt(0))], { type: 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || 'wiseraman_backup.wbr';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Encrypted .wbr backup exported.');
      } else {
        const err = await res.json();
        await alert({
          title: 'Export Failed',
          message: err.detail || 'Failed to create encrypted backup archive.',
          type: 'error'
        });
      }
    } catch (err) {
      console.error('Failed to create backup:', err);
      await alert({
        title: 'Network Error',
        message: 'Network error while communicating with the backup export service.',
        type: 'error'
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Handle file select for restore
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFileName(file.name);
    setRestoreError('');

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1] || reader.result;
      setRestoreFileBase64(base64);
      setRestoreStep(2);
    };
    reader.readAsDataURL(file);
  };

  // Test restore calling real /api/backup/test-restore
  const handleVerifyRestore = async () => {
    const isJsonFile = restoreFileName.toLowerCase().endsWith('.json');
    if (!isJsonFile && !restorePassphrase.trim()) {
      setRestoreError('Please enter the decryption passphrase.');
      return;
    }

    setRestoreTesting(true);
    setRestoreError('');
    try {
      const res = await authFetch('/api/backup/test-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wbr_base64: restoreFileBase64,
          passphrase: restorePassphrase.trim()
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (!data.is_valid) {
          setRestoreError(data.error || 'Decryption failed. Check passphrase or file integrity.');
          return;
        }
        setRestoreTestResult(data);

        // Preselect all entity keys present in record_counts
        const counts = data.record_counts || {};
        const availableKeys = AVAILABLE_ENTITIES.map(e => e.key).filter(k => (counts[k] || 0) > 0);
        setSelectedRestoreEntities(availableKeys.length > 0 ? availableKeys : ['accounts', 'transactions']);
        setRestoreStep(3);
      } else {
        const err = await res.json();
        setRestoreError(err.detail || 'Decryption failed. Check passphrase or file integrity.');
      }
    } catch (err) {
      setRestoreError('Failed to verify archive. Invalid format or network error.');
    } finally {
      setRestoreTesting(false);
    }
  };

  // Execute Selective Restore calling /api/backup/restore
  const handleApplyRestore = async () => {
    if (selectedRestoreEntities.length === 0) {
      await alert({
        title: 'No Items Selected',
        message: 'Please select at least one data category with the checkboxes to restore.',
        type: 'warning'
      });
      return;
    }

    setIsRestoring(true);
    try {
      const res = await authFetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wbr_base64: restoreFileBase64,
          passphrase: restorePassphrase.trim(),
          selected_entities: selectedRestoreEntities,
          conflict_strategy: conflictStrategy
        })
      });

      if (res.ok) {
        const data = await res.json();
        setRestoreFinalResult(data);
        setRestoreStep(4);
        toast.success(`Successfully restored ${data.total_restored} records.`);
        if (typeof fetchData === 'function') {
          fetchData();
        }
      } else {
        const err = await res.json();
        await alert({
          title: 'Restore Failed',
          message: err.detail || 'Failed to restore backup archive into database.',
          type: 'error'
        });
      }
    } catch (err) {
      console.error('Failed to apply restore:', err);
      await alert({
        title: 'Network Error',
        message: 'Network error while communicating with the restore service.',
        type: 'error'
      });
    } finally {
      setIsRestoring(false);
    }
  };


  return (
    <div className="space-y-8 animate-in fade-in duration-200 pb-12">
      
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2 border-b border-[#E4E8E3]/30">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
            Backup & Safe Recovery
          </h2>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            Encrypted local archives (AES-256-GCM + Argon2id) ensuring complete financial sovereignty
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="verified">Local AES-256 Storage</Badge>
        </div>
      </div>

      {/* 2. Create Encrypted Backup */}
      <div className={`p-6 rounded-[16px] border ${
        isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
      }`}>
        <div className="space-y-4 max-w-xl">
          <span className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            Create Encrypted Local Archive (.wbr)
          </span>

          <p className="text-xs text-[#8B978F] leading-relaxed">
            Exports all accounts, statements, transactions, and rules into an encrypted binary archive. The file is encrypted on your machine using AES-256-GCM and key-stretched with Argon2id.
          </p>

          <div>
            <label className="text-xs font-semibold block mb-1">Set Encryption Passphrase (min 6 characters)</label>
            <div className="flex gap-2 mb-4">
              <input
                type="password"
                placeholder="Choose a strong passphrase..."
                value={exportPassphrase}
                onChange={(e) => setExportPassphrase(e.target.value)}
                className={`flex-1 px-3 py-2 text-xs rounded-[10px] border outline-none ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateBackup}
                loading={isCreating}
                icon={Download}
              >
                Export Encrypted .WBR
              </Button>
            </div>

            {/* Selective Export Checkboxes */}
            <div className="pt-2 border-t border-[#E4E8E3]/40 dark:border-[#2A352D]/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
                  Datasets to include in backup ({exportEntities.length} selected):
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExportEntities(AVAILABLE_ENTITIES.map(e => e.key))}
                    className="text-[10px] font-semibold text-[#3F8F5E] hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-[10px] text-[#8B978F]">•</span>
                  <button
                    type="button"
                    onClick={() => setExportEntities([])}
                    className="text-[10px] font-semibold text-[#8B978F] hover:underline"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {AVAILABLE_ENTITIES.map((item) => {
                  const isChecked = exportEntities.includes(item.key);
                  const Icon = item.icon;
                  return (
                    <label
                      key={item.key}
                      onClick={() => toggleExportEntity(item.key)}
                      className={`flex items-center gap-2 p-2 rounded-[8px] border text-xs cursor-pointer select-none transition-all ${
                        isChecked
                          ? isDark
                            ? 'bg-[#1F2B22] border-[#3F8F5E]/60 text-white'
                            : 'bg-[#EBF5EF] border-[#3F8F5E]/50 text-[#1D2822]'
                          : isDark
                            ? 'bg-[#1C251F]/50 border-[#2A352D] text-[#8B978F] opacity-70'
                            : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#7B877F] opacity-70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="rounded text-[#3F8F5E] focus:ring-0 focus:outline-none"
                      />
                      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: item.color }} />
                      <span className="truncate text-[11px] font-medium">{item.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {backupResult && (
            <div className={`p-4 rounded-[12px] text-xs border space-y-1.5 ${
              isDark ? 'bg-[rgba(91,174,120,0.15)] text-[#7FC39A] border-[#5BAE78]/30' : 'bg-[#E2F1E8] text-[#285A3A] border-[#C6E4D2]'
            }`}>
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Encrypted archive generated: {backupResult.filename}</span>
              </div>
              <div className="text-[11px] opacity-90">
                Downloaded to your browser. Keep your passphrase safe; without it, the archive cannot be restored.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Multi-Step Safe Restore Workflow (Section 26) */}
      <div className={`p-6 rounded-[16px] border ${
        isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
      }`}>
        <h3 className="text-sm font-bold tracking-tight mb-2">Safe Restore WiseRaman</h3>
        <p className="text-xs text-[#8B978F] mb-6">
          Validate integrity and inspect archive contents in memory before applying any changes
        </p>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 text-xs mb-6 overflow-x-auto pb-2">
          {['1. Select Backup', '2. Verify Passphrase', '3. Integrity Diff', '4. Complete'].map((stepName, sIdx) => {
            const num = sIdx + 1;
            const isCurrent = restoreStep === num;
            const isDone = restoreStep > num;
            return (
              <div key={sIdx} className="flex items-center gap-2 shrink-0">
                <span className={`px-2.5 py-1 rounded-[8px] font-semibold ${
                  isCurrent
                    ? 'bg-[#3F8F5E] text-white'
                    : isDone
                      ? 'bg-[#E2F1E8] text-[#285A3A]'
                      : 'bg-black/5 dark:bg-white/5 text-[#8B978F]'
                }`}>
                  {stepName}
                </span>
                {sIdx < 3 && <span className="text-[#8B978F]">→</span>}
              </div>
            );
          })}
        </div>

        {/* Step 1: Select File */}
        {restoreStep === 1 && (
          <div className="space-y-4 max-w-md">
            <label className={`block p-6 rounded-[12px] border border-dashed text-center cursor-pointer transition-colors ${
              isDark ? 'border-[#2A352D] hover:border-[#5BAE78]' : 'border-[#E4E8E3] hover:border-[#3F8F5E]'
            }`}>
              <Upload className="h-6 w-6 text-[#8B978F] mx-auto mb-2" />
              <div className="text-xs font-semibold">Select .wbr or backup archive file</div>
              <span className="text-[11px] text-[#8B978F] mt-1 block">Click to browse your local computer</span>
              <input
                type="file"
                accept=".wbr,.bin,.json"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Step 2: Passphrase */}
        {restoreStep === 2 && (
          <div className="space-y-4 max-w-md">
            <div className="text-xs">
              <span className="text-[#8B978F]">Selected File:</span>
              <span className="font-semibold ml-1">{restoreFileName}</span>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1">Decryption Passphrase</label>
              <input
                type="password"
                placeholder="Enter passphrase used during backup..."
                value={restorePassphrase}
                onChange={(e) => setRestorePassphrase(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-[10px] border outline-none ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              />
            </div>

            {restoreError && (
              <div className="p-2.5 rounded-[8px] text-xs bg-[#FBEAEA] text-[#C85C5C] font-semibold">
                {restoreError}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setRestoreStep(1)}>
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleVerifyRestore}
                loading={restoreTesting}
                icon={ShieldCheck}
              >
                Verify & Preview Diff →
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Granular Selective Restore Matrix */}
        {restoreStep === 3 && (
          <div className="space-y-5 max-w-2xl">
            {/* Verification & Archive Info */}
            <div className={`p-4 rounded-[12px] border text-xs space-y-2.5 ${
              isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="font-bold text-[#3F8F5E] flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Decryption Verified & Integrity Validated</span>
                </div>
                <Badge variant="verified">Format v{restoreTestResult?.version || 1}</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[#8B978F] pt-1 border-t border-[#E4E8E3]/40 dark:border-[#2A352D]/60">
                <div>
                  Archive Creator: <span className="font-medium text-foreground">{restoreTestResult?.user_email || 'Archive User'}</span>
                </div>
                <div>
                  Created: <span className="font-medium text-foreground">
                    {restoreTestResult?.created_at ? new Date(restoreTestResult.created_at).toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Conflict Strategy Selector */}
            <div className={`p-3.5 rounded-[12px] border text-xs ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <label className="font-semibold text-xs flex items-center gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5 text-[#3F8F5E]" />
                  Duplicate Handling Strategy
                </label>
                <span className="text-[11px] text-[#8B978F]">Choose how to handle existing matching records</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConflictStrategy('skip_duplicates')}
                  className={`p-2.5 rounded-[8px] border text-left transition-all ${
                    conflictStrategy === 'skip_duplicates'
                      ? isDark
                        ? 'bg-[#1F2B22] border-[#3F8F5E] text-white'
                        : 'bg-[#EBF5EF] border-[#3F8F5E] text-[#1D2822]'
                      : isDark
                        ? 'bg-[#1C251F]/60 border-[#2A352D] text-[#8B978F]'
                        : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#7B877F]'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <Check className={`h-3 w-3 ${conflictStrategy === 'skip_duplicates' ? 'text-[#3F8F5E]' : 'opacity-0'}`} />
                    Skip Duplicates (Safe)
                  </div>
                  <div className="text-[10px] text-[#8B978F] mt-0.5 ml-4.5">
                    Preserves current data, only imports non-existing records
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setConflictStrategy('overwrite')}
                  className={`p-2.5 rounded-[8px] border text-left transition-all ${
                    conflictStrategy === 'overwrite'
                      ? isDark
                        ? 'bg-[#1F2B22] border-[#3F8F5E] text-white'
                        : 'bg-[#EBF5EF] border-[#3F8F5E] text-[#1D2822]'
                      : isDark
                        ? 'bg-[#1C251F]/60 border-[#2A352D] text-[#8B978F]'
                        : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#7B877F]'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <Check className={`h-3 w-3 ${conflictStrategy === 'overwrite' ? 'text-[#3F8F5E]' : 'opacity-0'}`} />
                    Update / Overwrite
                  </div>
                  <div className="text-[10px] text-[#8B978F] mt-0.5 ml-4.5">
                    Updates matching accounts, categories, and records with backup values
                  </div>
                </button>
              </div>
            </div>

            {/* Checkbox Matrix: What Needs To Be Restored */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#3F8F5E]">
                    Select What Needs To Be Restored
                  </h4>
                  <p className="text-[11px] text-[#8B978F]">
                    {selectedRestoreEntities.length} of {AVAILABLE_ENTITIES.length} categories selected (
                    {selectedRestoreEntities.reduce((acc, k) => acc + (restoreTestResult?.record_counts?.[k] || 0), 0)} total records)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const presentKeys = AVAILABLE_ENTITIES.map(e => e.key).filter(k => (restoreTestResult?.record_counts?.[k] || 0) > 0);
                      setSelectedRestoreEntities(presentKeys.length > 0 ? presentKeys : AVAILABLE_ENTITIES.map(e => e.key));
                    }}
                    className="text-xs font-semibold text-[#3F8F5E] hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-xs text-[#8B978F]">•</span>
                  <button
                    type="button"
                    onClick={() => setSelectedRestoreEntities([])}
                    className="text-xs font-semibold text-[#8B978F] hover:underline cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Entity Checkbox Cards */}
              <div className="space-y-2">
                {AVAILABLE_ENTITIES.map((entity) => {
                  const count = restoreTestResult?.record_counts?.[entity.key] || 0;
                  const isSelected = selectedRestoreEntities.includes(entity.key);
                  const Icon = entity.icon;
                  const isEmpty = count === 0;

                  return (
                    <div
                      key={entity.key}
                      onClick={() => !isEmpty && toggleRestoreEntity(entity.key)}
                      className={`p-3.5 rounded-[12px] border transition-all select-none ${
                        isEmpty
                          ? isDark
                            ? 'bg-[#171E19]/40 border-[#2A352D]/40 opacity-40 cursor-not-allowed'
                            : 'bg-[#F9FAFB] border-[#E5E7EB] opacity-40 cursor-not-allowed'
                          : isSelected
                            ? isDark
                              ? 'bg-[#1C251F] border-[#3F8F5E] cursor-pointer shadow-sm'
                              : 'bg-[#FFFFFF] border-[#3F8F5E] cursor-pointer shadow-xs'
                            : isDark
                              ? 'bg-[#171E19] border-[#2A352D] hover:border-[#3F8F5E]/40 cursor-pointer'
                              : 'bg-[#FFFFFF] border-[#E4E8E3] hover:border-[#3F8F5E]/40 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isEmpty}
                            onChange={() => {}}
                            className="mt-1 rounded text-[#3F8F5E] focus:ring-0 cursor-pointer"
                          />
                          <div
                            className="p-1.5 rounded-[8px] shrink-0 mt-0.5"
                            style={{ backgroundColor: `${entity.color}15` }}
                          >
                            <Icon className="h-4 w-4" style={{ color: entity.color }} />
                          </div>
                          <div>
                            <div className="text-xs font-bold flex items-center gap-2">
                              <span>{entity.label}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-[6px] font-semibold ${
                                isEmpty
                                  ? 'bg-black/5 dark:bg-white/5 text-[#8B978F]'
                                  : isSelected
                                    ? 'bg-[#3F8F5E]/15 text-[#3F8F5E]'
                                    : 'bg-black/5 dark:bg-white/5 text-[#8B978F]'
                              }`}>
                                {isEmpty ? '0 records in archive' : `${count} records`}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#8B978F] mt-0.5 leading-relaxed">
                              {entity.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Dependency Guidance */}
              {selectedRestoreEntities.includes('transactions') && !selectedRestoreEntities.includes('accounts') && (
                <div className={`p-3 rounded-[10px] text-xs flex items-center gap-2 border ${
                  isDark ? 'bg-[#2A2312] border-[#B78332]/40 text-[#D9A74A]' : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
                }`}>
                  <Info className="h-4 w-4 shrink-0" />
                  <span>
                    Transactions will be linked to your existing accounts by name, or a default account if missing.
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="secondary" size="sm" onClick={() => setRestoreStep(2)}>
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleApplyRestore}
                loading={isRestoring}
                icon={Download}
                disabled={selectedRestoreEntities.length === 0}
              >
                Restore Selected ({selectedRestoreEntities.reduce((acc, k) => acc + (restoreTestResult?.record_counts?.[k] || 0), 0)} Records)
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Selective Restore Complete Summary */}
        {restoreStep === 4 && (
          <div className="space-y-4 max-w-xl animate-in fade-in duration-200">
            <div className={`p-5 rounded-[16px] border space-y-4 ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#E2F1E8] text-[#285A3A] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-[#3F8F5E]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">Selected Datasets Restored Successfully</h4>
                  <p className="text-xs text-[#8B978F]">
                    Your database has been safely updated with the chosen categories.
                  </p>
                </div>
              </div>

              {/* Quick totals */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[#E4E8E3]/40 dark:border-[#2A352D]/60">
                <div className={`p-2.5 rounded-[10px] text-center border ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}>
                  <div className="text-[10px] font-semibold text-[#8B978F] uppercase">Total Restored</div>
                  <div className="text-base font-bold text-[#3F8F5E] mt-0.5">
                    {restoreFinalResult?.total_restored ?? 0}
                  </div>
                </div>

                <div className={`p-2.5 rounded-[10px] text-center border ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}>
                  <div className="text-[10px] font-semibold text-[#8B978F] uppercase">Duplicates Skipped</div>
                  <div className="text-base font-bold text-[#8B978F] mt-0.5">
                    {restoreFinalResult?.total_skipped ?? 0}
                  </div>
                </div>

                <div className={`p-2.5 rounded-[10px] text-center border col-span-2 sm:col-span-1 ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}>
                  <div className="text-[10px] font-semibold text-[#8B978F] uppercase">Strategy Applied</div>
                  <div className="text-xs font-bold text-foreground mt-1 capitalize">
                    {restoreFinalResult?.conflict_strategy?.replace('_', ' ') || 'Skip Duplicates'}
                  </div>
                </div>
              </div>

              {/* Entity Detailed Stats */}
              {restoreFinalResult?.stats && (
                <div className="space-y-1.5 pt-2">
                  <div className="text-[11px] font-bold text-[#8B978F] uppercase tracking-wider">
                    Breakdown by Category:
                  </div>
                  <div className="divide-y divide-[#E4E8E3]/30 dark:divide-[#2A352D]/40">
                    {AVAILABLE_ENTITIES.filter(e => selectedRestoreEntities.includes(e.key)).map((entity) => {
                      const stat = restoreFinalResult.stats[entity.key] || { restored: 0, skipped: 0, updated: 0 };
                      const Icon = entity.icon;
                      return (
                        <div key={entity.key} className="py-2 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" style={{ color: entity.color }} />
                            <span className="font-medium">{entity.label}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            {stat.restored > 0 && (
                              <span className="text-[#3F8F5E] font-semibold">
                                +{stat.restored} restored
                              </span>
                            )}
                            {stat.updated > 0 && (
                              <span className="text-[#3B82F6] font-semibold">
                                {stat.updated} updated
                              </span>
                            )}
                            {stat.skipped > 0 && (
                              <span className="text-[#8B978F]">
                                ({stat.skipped} skipped)
                              </span>
                            )}
                            {stat.restored === 0 && stat.updated === 0 && stat.skipped === 0 && (
                              <span className="text-[#8B978F]">No changes</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setRestoreStep(1);
                    setRestoreFileBase64('');
                    setRestoreFileName('');
                    setRestorePassphrase('');
                    setRestoreTestResult(null);
                    setRestoreFinalResult(null);
                    setSelectedRestoreEntities([]);
                  }}
                >
                  Done / Restore Another
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
