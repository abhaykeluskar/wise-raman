import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useDialog } from '../../context/ToastContext';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { 
  Settings as SettingsIcon, 
  ShieldCheck, 
  Lock, 
  Cpu, 
  Moon, 
  Sun, 
  Plus, 
  Trash2, 
  Tag, 
  Database,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  User as UserIcon,
  Mail,
  Key,
  Eye,
  EyeOff,
  Save,
  Check
} from 'lucide-react';

export const SettingsView = () => {
  const { theme, setTheme } = useTheme();
  const { rules, categories, addRule, deleteRule, user, authFetch, fetchData, transactions, accounts, cards, updateUserProfile, changePassword } = useFinance();
  const { confirm, alert, toast } = useDialog();
  const isDark = theme === 'dark';

  // Profile management state
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  const [showProfilePw, setShowProfilePw] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfileEmail(user.email || '');
    }
  }, [user?.name, user?.email]);

  const isEmailChanged = Boolean(
    user?.email && profileEmail.trim().toLowerCase() !== user.email.toLowerCase()
  );

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileMsg(null);

    if (!profileName.trim() || profileName.trim().length < 2) {
      setProfileMsg({ type: 'error', text: 'Display name must be at least 2 characters.' });
      return;
    }

    if (isEmailChanged && !profileCurrentPassword) {
      setProfileMsg({ type: 'error', text: 'Current password is required to change your email address.' });
      return;
    }

    setProfileLoading(true);
    const result = await updateUserProfile({
      name: profileName.trim(),
      email: profileEmail.trim(),
      current_password: isEmailChanged ? profileCurrentPassword : undefined
    });
    setProfileLoading(false);

    if (result.success) {
      setProfileCurrentPassword('');
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
      toast.success('Profile updated successfully.');
    } else {
      setProfileMsg({ type: 'error', text: result.error || 'Failed to update profile.' });
    }
  };

  // Password management state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMsg, setPwdMsg] = useState(null);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setPwdMsg(null);

    if (!currentPassword) {
      setPwdMsg({ type: 'error', text: 'Current password is required.' });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setPwdMsg({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }
    if (newPassword === currentPassword) {
      setPwdMsg({ type: 'error', text: 'New password must be different from current password.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setPwdLoading(true);
    const result = await changePassword({
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword
    });
    setPwdLoading(false);

    if (result.success) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdMsg({ type: 'success', text: result.message || 'Password changed successfully.' });
      toast.success('Password updated successfully.');
    } else {
      setPwdMsg({ type: 'error', text: result.error || 'Failed to update password.' });
    }
  };

  const [ruleKeyword, setRuleKeyword] = useState('');
  const [ruleCategory, setRuleCategory] = useState(categories[0]?.name || 'Food & Dining');

  // Category management
  const [newCatName, setNewCatName] = useState('');
  const [catLoading, setCatLoading] = useState(false);

  // Selective Purge state
  const [isPurging, setIsPurging] = useState(false);
  const [purgeSelections, setPurgeSelections] = useState({
    transactions: true,
    payslips: false,
    bank: false,
    card: false,
    account: false
  });

  const allSelected = Object.values(purgeSelections).every(Boolean);
  const someSelected = Object.values(purgeSelections).some(Boolean);

  const toggleAll = () => {
    const nextState = !allSelected;
    setPurgeSelections({
      transactions: nextState,
      payslips: nextState,
      bank: nextState,
      card: nextState,
      account: nextState
    });
  };

  const toggleSelection = (key) => {
    setPurgeSelections(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleAddRule = async (e) => {
    e.preventDefault();
    if (!ruleKeyword.trim()) return;
    await addRule(ruleKeyword.trim(), ruleCategory);
    setRuleKeyword('');
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setCatLoading(true);
    try {
      const res = await authFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName.trim(), description: 'User created' })
      });
      if (res.ok) {
        setNewCatName('');
        await fetchData();
        toast.success(`Category "${newCatName.trim()}" created.`);
      }
    } catch (err) {
      console.error('Failed to create category:', err);
    } finally {
      setCatLoading(false);
    }
  };

  const handleDeleteCategory = async (catName) => {
    const confirmed = await confirm({
      title: 'Delete Category',
      message: `Are you sure you want to delete "${catName}"? Existing transactions will retain their historical classification.`,
      confirmText: 'Delete Category',
      isDanger: true
    });
    if (!confirmed) return;

    try {
      const res = await authFetch(`/api/categories/${encodeURIComponent(catName)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchData();
        toast.success(`Category "${catName}" deleted.`);
      }
    } catch (err) {
      console.error('Failed to delete category:', err);
    }
  };

  const handlePurgeData = async () => {
    if (!someSelected) {
      await alert({
        title: 'No Selection',
        message: 'Please select at least one data category (transactions, payslips, bank accounts, cards, or banks) to purge.',
        type: 'warning'
      });
      return;
    }

    const selectedKeys = Object.entries(purgeSelections)
      .filter(([_, v]) => v)
      .map(([k]) => {
        switch (k) {
          case 'transactions': return 'Transactions & Statement rows';
          case 'payslips': return 'Salary Payslips & Tax deductions';
          case 'bank': return 'Connected Banks & Institutions';
          case 'card': return 'Credit Cards & Limits';
          case 'account': return 'Bank Accounts & Balances';
          default: return k;
        }
      });

    const confirmed = await confirm({
      title: 'Confirm Selective Data Purge',
      message: (
        <div className="space-y-2">
          <p>You are about to permanently delete the following local records:</p>
          <ul className="list-disc pl-5 space-y-1 font-semibold text-rose-500">
            {selectedKeys.map(k => <li key={k}>{k}</li>)}
          </ul>
          <p className="text-[11px] text-[#8B978F] pt-1">This action cannot be undone. Other unselected categories will remain intact.</p>
        </div>
      ),
      confirmText: 'Permanently Purge Selected',
      cancelText: 'Keep My Data',
      isDanger: true
    });

    if (!confirmed) return;

    setIsPurging(true);
    try {
      const res = await authFetch('/api/data/selective-purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(purgeSelections)
      });
      const data = await res.json();
      if (res.ok) {
        await fetchData();
        await alert({
          title: 'Purge Complete',
          message: data.message || 'The selected records have been purged from your local database.',
          type: 'success'
        });
      } else {
        await alert({
          title: 'Purge Error',
          message: data.detail || 'Failed to purge data.',
          type: 'error'
        });
      }
    } catch (err) {
      console.error('Failed to purge data:', err);
      await alert({
        title: 'Network Error',
        message: 'Could not communicate with the local server to execute purge.',
        type: 'error'
      });
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200 pb-12">
      
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2 border-b border-[#E4E8E3]/30">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
            System & Privacy Settings
          </h2>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            Local runtime configuration, merchant classification rules, and categories
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="verified">Local-First Architecture</Badge>
        </div>
      </div>

      {/* 2. Privacy & Data Sovereignty Banner (Section 25) */}
      <div className={`p-6 rounded-[16px] border ${
        isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FAF6F1] border-[#E5D4C1]'
      }`}>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-5 w-5 text-[#3F8F5E]" />
          <h3 className="text-sm font-bold tracking-tight">YOUR DATA STAYS WITH YOU</h3>
        </div>
        <p className={`text-xs max-w-2xl leading-relaxed ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
          WiseRaman runs completely isolated on your private machine. We do not maintain any cloud financial databases, advertising tracking, or external telemetry pipelines.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 text-xs font-medium">
          <div className="flex items-center gap-2 text-[#3F8F5E]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Financial data stored locally</span>
          </div>
          <div className="flex items-center gap-2 text-[#3F8F5E]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Local AI processing (Ollama)</span>
          </div>
          <div className="flex items-center gap-2 text-[#3F8F5E]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>No advertising profile</span>
          </div>
          <div className="flex items-center gap-2 text-[#3F8F5E]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>No cloud financial sync</span>
          </div>
        </div>
      </div>

      {/* 3. Settings Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Profile & Account Details */}
        <div className={`p-6 rounded-[16px] border flex flex-col justify-between ${
          isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
        }`}>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <UserIcon className="h-4 w-4 text-[#3F8F5E]" />
              <h3 className="text-sm font-bold tracking-tight">Account Profile</h3>
            </div>
            <p className="text-xs text-[#8B978F] mb-4">
              Manage your display name and registered email address
            </p>

            {profileMsg && (
              <div className={`p-3 rounded-[10px] text-xs mb-4 flex items-center gap-2 ${
                profileMsg.type === 'success'
                  ? (isDark ? 'bg-[#1C2C22] text-[#5BAE78] border border-[#2D5A3C]' : 'bg-[#EBF7EE] text-[#2F6B45] border border-[#BDE3C8]')
                  : (isDark ? 'bg-[#2E1818] text-[#E06A6A] border border-[#582929]' : 'bg-[#FDF0ED] text-[#C85C5C] border border-[#F5C7BE]')
              }`}>
                {profileMsg.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                <span>{profileMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-3.5">
              <div>
                <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
                  Full Name / Display Name
                </label>
                <div className="relative flex items-center">
                  <UserIcon className="absolute left-3 h-3.5 w-3.5 text-[#8B978F] pointer-events-none" />
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Enter your name"
                    required
                    className={`w-full pl-9 pr-3 py-2 text-xs rounded-[10px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#1D2822]'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
                  Email Address
                </label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3 h-3.5 w-3.5 text-[#8B978F] pointer-events-none" />
                  <input
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    placeholder="user@example.com"
                    required
                    className={`w-full pl-9 pr-3 py-2 text-xs rounded-[10px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#1D2822]'
                    }`}
                  />
                </div>
              </div>

              {isEmailChanged && (
                <div className={`p-3 rounded-[10px] border animate-in fade-in duration-150 space-y-2 ${
                  isDark ? 'bg-[#262118] border-[#4A3B22]' : 'bg-[#FFF9F2] border-[#F0E0C8]'
                }`}>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#A77B58]">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>Current password required for email change</span>
                  </div>
                  <div className="relative flex items-center">
                    <Key className="absolute left-3 h-3.5 w-3.5 text-[#8B978F] pointer-events-none" />
                    <input
                      type={showProfilePw ? 'text' : 'password'}
                      value={profileCurrentPassword}
                      onChange={(e) => setProfileCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      required
                      className={`w-full pl-9 pr-9 py-2 text-xs rounded-[10px] border outline-none ${
                        isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowProfilePw(!showProfilePw)}
                      className="absolute right-3 text-[#8B978F] hover:text-[#5BAE78] border-0 bg-transparent cursor-pointer p-0"
                    >
                      {showProfilePw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={profileLoading}
                  disabled={profileLoading || (!isEmailChanged && profileName === (user?.name || ''))}
                  icon={Save}
                >
                  Save Profile
                </Button>
              </div>
            </form>
          </div>

          <div className="pt-4 border-t border-[#E4E8E3]/20 mt-4 text-[11px] text-[#8B978F]">
            Email modification requires your current password to protect your account.
          </div>
        </div>

        {/* Security & Password Management */}
        <div className={`p-6 rounded-[16px] border flex flex-col justify-between ${
          isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
        }`}>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lock className="h-4 w-4 text-[#3F8F5E]" />
              <h3 className="text-sm font-bold tracking-tight">Security & Password</h3>
            </div>
            <p className="text-xs text-[#8B978F] mb-4">
              Update your account password with industry-standard bcrypt encryption
            </p>

            {pwdMsg && (
              <div className={`p-3 rounded-[10px] text-xs mb-4 flex items-center gap-2 ${
                pwdMsg.type === 'success'
                  ? (isDark ? 'bg-[#1C2C22] text-[#5BAE78] border border-[#2D5A3C]' : 'bg-[#EBF7EE] text-[#2F6B45] border border-[#BDE3C8]')
                  : (isDark ? 'bg-[#2E1818] text-[#E06A6A] border border-[#582929]' : 'bg-[#FDF0ED] text-[#C85C5C] border border-[#F5C7BE]')
              }`}>
                {pwdMsg.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                <span>{pwdMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-3.5">
              <div>
                <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
                  Current Password
                </label>
                <div className="relative flex items-center">
                  <Key className="absolute left-3 h-3.5 w-3.5 text-[#8B978F] pointer-events-none" />
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                    className={`w-full pl-9 pr-9 py-2 text-xs rounded-[10px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#1D2822]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3 text-[#8B978F] hover:text-[#5BAE78] border-0 bg-transparent cursor-pointer p-0"
                  >
                    {showCurrentPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
                  New Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3 h-3.5 w-3.5 text-[#8B978F] pointer-events-none" />
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    className={`w-full pl-9 pr-9 py-2 text-xs rounded-[10px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#1D2822]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3 text-[#8B978F] hover:text-[#5BAE78] border-0 bg-transparent cursor-pointer p-0"
                  >
                    {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
                  Confirm New Password
                </label>
                <div className="relative flex items-center">
                  <Check className="absolute left-3 h-3.5 w-3.5 text-[#8B978F] pointer-events-none" />
                  <input
                    type={showConfirmPw ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    className={`w-full pl-9 pr-9 py-2 text-xs rounded-[10px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FBFCFA] border-[#E4E8E3] text-[#1D2822]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    className="absolute right-3 text-[#8B978F] hover:text-[#5BAE78] border-0 bg-transparent cursor-pointer p-0"
                  >
                    {showConfirmPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Password Requirement Indicators */}
              <div className="flex flex-wrap gap-3 pt-1 text-[11px]">
                <span className={`inline-flex items-center gap-1 ${
                  newPassword.length >= 8 ? 'text-[#3F8F5E] font-medium' : 'text-[#8B978F]'
                }`}>
                  <Check className={`h-3 w-3 ${newPassword.length >= 8 ? 'opacity-100' : 'opacity-30'}`} />
                  8+ characters
                </span>
                <span className={`inline-flex items-center gap-1 ${
                  newPassword && confirmPassword && newPassword === confirmPassword
                    ? 'text-[#3F8F5E] font-medium'
                    : 'text-[#8B978F]'
                }`}>
                  <Check className={`h-3 w-3 ${newPassword && confirmPassword && newPassword === confirmPassword ? 'opacity-100' : 'opacity-30'}`} />
                  Passwords match
                </span>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={pwdLoading}
                  disabled={pwdLoading || !currentPassword || !newPassword || !confirmPassword}
                  icon={Key}
                >
                  Update Password
                </Button>
              </div>
            </form>
          </div>

          <div className="pt-4 border-t border-[#E4E8E3]/20 mt-4 text-[11px] text-[#8B978F]">
            Passwords are hashed using salted bcrypt before database persistence.
          </div>
        </div>

        {/* Appearance & Preferences */}
        <div className={`p-6 rounded-[16px] border flex flex-col justify-between ${
          isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
        }`}>
          <div>
            <h3 className="text-sm font-bold tracking-tight mb-4">Appearance</h3>
            <div className="flex items-center justify-between text-xs py-3 border-b border-[#E4E8E3]/20">
              <div>
                <div className="font-semibold">Interface Theme</div>
                <div className="text-[11px] text-[#8B978F]">Toggle between Pastel Light and Soft Dark</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={theme === 'light' ? 'primary' : 'secondary'}
                  size="xs"
                  onClick={() => setTheme('light')}
                  icon={Sun}
                >
                  Light
                </Button>
                <Button
                  variant={theme === 'dark' ? 'primary' : 'secondary'}
                  size="xs"
                  onClick={() => setTheme('dark')}
                  icon={Moon}
                >
                  Dark
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs py-3">
              <div>
                <div className="font-semibold">Brand Accent</div>
                <div className="text-[11px] text-[#8B978F]">WiseRaman Pastel Green & Warm Earth</div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-4 w-4 rounded-full bg-[#5BAE78]" title="Pastel Green" />
                <span className="h-4 w-4 rounded-full bg-[#A77B58]" title="Warm Brown" />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E4E8E3]/20 text-[11px] text-[#8B978F]">
            Design follows 70% Neutral / 20% Green / 10% Earth.
          </div>
        </div>

        {/* Categories Management */}
        <div className={`p-6 rounded-[16px] border flex flex-col justify-between ${
          isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
        }`}>
          <div>
            <h3 className="text-sm font-bold tracking-tight mb-2">Category Management</h3>
            <p className="text-xs text-[#8B978F] mb-4">
              Add or remove expense and income categories
            </p>

            <form onSubmit={handleCreateCategory} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="New Category Name..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className={`flex-1 px-3 py-1.5 text-xs rounded-[10px] border outline-none ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              />
              <Button type="submit" variant="primary" size="xs" loading={catLoading} icon={Plus}>
                Create
              </Button>
            </form>

            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
              {categories.map(c => (
                <span
                  key={c.id || c.name}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-xs border bg-black/5 dark:bg-white/5"
                >
                  <span>{c.name}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(c.name)}
                    className="p-0.5 text-[#8B978F] hover:text-[#C85C5C] border-0 bg-transparent cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-[#E4E8E3]/20 text-[11px] text-[#8B978F]">
            Categories are mapped to ML classification targets.
          </div>
        </div>

        {/* Merchant Rules Engine */}
        <div className={`p-6 rounded-[16px] border flex flex-col justify-between ${
          isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
        }`}>
          <div>
            <h3 className="text-sm font-bold tracking-tight mb-2">Merchant Classification Rules</h3>
            <p className="text-xs text-[#8B978F] mb-4">
              Deterministic string patterns for auto-categorization
            </p>

            <form onSubmit={handleAddRule} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="e.g. ZOMATO or SWIGGY"
                value={ruleKeyword}
                onChange={(e) => setRuleKeyword(e.target.value)}
                className={`flex-1 px-3 py-1.5 text-xs rounded-[10px] border outline-none ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              />
              <select
                value={ruleCategory}
                onChange={(e) => setRuleCategory(e.target.value)}
                className={`px-3 py-1.5 text-xs rounded-[10px] border outline-none cursor-pointer ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              >
                {categories.map(c => (
                  <option key={c.id || c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              <Button type="submit" variant="primary" size="xs" icon={Plus}>
                Add
              </Button>
            </form>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {rules.map(r => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded-[8px] border text-xs bg-black/5 dark:bg-white/5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{r.match_pattern}</span>
                    <span className="text-[#8B978F]">→</span>
                    <Badge variant="brown" size="xs">{r.target_category}</Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteRule(r.id)}
                    className="p-1 text-[#C85C5C] hover:opacity-80 border-0 bg-transparent cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-[#E4E8E3]/20 mt-4 text-[11px] text-[#8B978F]">
            Rules are evaluated in memory before LLM fallback.
          </div>
        </div>

        {/* Database Danger Zone: Selective Purge */}
        <div className={`p-6 rounded-[16px] border flex flex-col justify-between ${
          isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
        }`}>
          <div>
            <div className="flex items-center gap-2 text-[#C85C5C] mb-2">
              <AlertOctagon className="h-5 w-5" />
              <h3 className="text-sm font-bold tracking-tight">Selective Data Purge</h3>
            </div>
            <p className="text-xs text-[#8B978F] mb-4">
              Select specific entities or perform a complete wipe of your local financial database.
            </p>

            {/* Checkbox Options Grid */}
            <div className={`p-4 rounded-[12px] border mb-4 space-y-2.5 text-xs ${
              isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
            }`}>
              {/* Select All */}
              <label className="flex items-center gap-2.5 font-bold cursor-pointer select-none pb-2 border-b border-[#E4E8E3]/20">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-[#E4E8E3] text-[#3F8F5E] focus:ring-[#3F8F5E] h-4 w-4 cursor-pointer"
                />
                <span className="text-[#3F8F5E]">Select All (Complete Database Wipe)</span>
              </label>

              {/* Individual Entities */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={purgeSelections.transactions}
                    onChange={() => toggleSelection('transactions')}
                    className="rounded border-[#E4E8E3] text-[#3F8F5E] focus:ring-[#3F8F5E] h-3.5 w-3.5 cursor-pointer"
                  />
                  <span>Transactions ({transactions.length})</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={purgeSelections.payslips}
                    onChange={() => toggleSelection('payslips')}
                    className="rounded border-[#E4E8E3] text-[#3F8F5E] focus:ring-[#3F8F5E] h-3.5 w-3.5 cursor-pointer"
                  />
                  <span>Payslips & Deductions</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={purgeSelections.account}
                    onChange={() => toggleSelection('account')}
                    className="rounded border-[#E4E8E3] text-[#3F8F5E] focus:ring-[#3F8F5E] h-3.5 w-3.5 cursor-pointer"
                  />
                  <span>Bank Accounts ({accounts.length})</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={purgeSelections.card}
                    onChange={() => toggleSelection('card')}
                    className="rounded border-[#E4E8E3] text-[#3F8F5E] focus:ring-[#3F8F5E] h-3.5 w-3.5 cursor-pointer"
                  />
                  <span>Credit Cards ({cards.length})</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={purgeSelections.bank}
                    onChange={() => toggleSelection('bank')}
                    className="rounded border-[#E4E8E3] text-[#3F8F5E] focus:ring-[#3F8F5E] h-3.5 w-3.5 cursor-pointer"
                  />
                  <span>Banks & Institutions</span>
                </label>
              </div>
            </div>

            <Button
              variant="danger"
              size="sm"
              onClick={handlePurgeData}
              disabled={!someSelected || isPurging}
              loading={isPurging}
              icon={Trash2}
            >
              Purge Selected Data
            </Button>
          </div>

          <div className="pt-4 border-t border-[#E4E8E3]/20 mt-4 text-[11px] text-[#8B978F]">
            Destructive action requires explicit confirmation. Only chosen entities will be removed.
          </div>
        </div>

      </div>

    </div>
  );
};
