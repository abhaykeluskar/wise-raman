import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useDialog } from '../../context/ToastContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { 
  Users, 
  Home, 
  Landmark, 
  Target, 
  Receipt, 
  ShieldCheck, 
  Car, 
  Plane, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  Calculator, 
  Calendar, 
  Fuel, 
  Clock, 
  PiggyBank, 
  ArrowRight, 
  Shield, 
  HeartHandshake,
  ChevronRight,
  X,
  CreditCard,
  Edit2
} from 'lucide-react';

export const HouseholdOSView = () => {
  const { theme } = useTheme();
  const { authFetch, token } = useFinance();
  const { confirm, toast } = useDialog();
  const isDark = theme === 'dark';

  const [activeSubTab, setActiveSubTab] = useState('overview');
  const [loading, setLoading] = useState(false);

  // Data states
  const [householdData, setHouseholdData] = useState(null);
  const [loans, setLoans] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [amortization, setAmortization] = useState(null);
  const [prepaymentSim, setPrepaymentSim] = useState(null);
  const [prepayLumpSum, setPrepayLumpSum] = useState(100000);
  const [prepayExtraEmi, setPrepayExtraEmi] = useState(5000);

  const [goals, setGoals] = useState([]);
  const [emergencyFund, setEmergencyFund] = useState(null);

  const [splitsData, setSplitsData] = useState({ summary: {}, expenses: [] });
  const [insuranceData, setInsuranceData] = useState({ total_coverage: 0, total_annual_premium: 0, policies: [] });
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);

  // Form Modals
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', relationship: 'SPOUSE', avatar_color: '#3F8F5E' });

  const [showAddLoan, setShowAddLoan] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  const [newLoan, setNewLoan] = useState({
    loan_name: '',
    loan_type: 'HOME_LOAN',
    lender_name: '',
    principal_amount: '',
    outstanding_balance: '',
    annual_interest_rate: '8.5',
    tenure_months: '240',
    start_date: new Date().toISOString().split('T')[0]
  });

  const [showAddGoal, setShowAddGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [newGoal, setNewGoal] = useState({
    name: '',
    category: 'EMERGENCY_FUND',
    target_amount: '',
    current_amount: '',
    monthly_contribution: '',
    priority: 'HIGH'
  });

  const [showAddSplit, setShowAddSplit] = useState(false);
  const [newSplit, setNewSplit] = useState({
    title: '',
    total_amount: '',
    paid_by_user: true,
    payer_name: 'Me',
    expense_date: new Date().toISOString().split('T')[0],
    category: 'Dining',
    participantsStr: ''
  });

  const [showAddInsurance, setShowAddInsurance] = useState(false);
  const [newInsurance, setNewInsurance] = useState({
    policy_name: '',
    policy_type: 'HEALTH',
    insurer_name: '',
    policy_number: '',
    sum_insured: '',
    premium_amount: '',
    premium_frequency: 'ANNUAL',
    renewal_date: new Date().toISOString().split('T')[0]
  });

  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    vehicle_name: '',
    vehicle_type: 'CAR',
    registration_number: '',
    fuel_type: 'PETROL',
    odometer_reading: ''
  });

  const [showAddTrip, setShowAddTrip] = useState(false);
  const [newTrip, setNewTrip] = useState({
    trip_name: '',
    destination: '',
    start_date: new Date().toISOString().split('T')[0],
    budget: ''
  });

  // Loaders using authFetch
  const loadHousehold = async () => {
    try {
      const res = await authFetch('/api/household/dashboard');
      if (res.ok) setHouseholdData(await res.json());
    } catch (e) { console.error(e); }
  };

  const loadLoans = async () => {
    try {
      const res = await authFetch('/api/loans');
      if (res.ok) {
        const data = await res.json();
        setLoans(data);
        if (data.length > 0 && !selectedLoan) {
          setSelectedLoan(data[0]);
        }
      }
    } catch (e) { console.error(e); }
  };

  const loadGoals = async () => {
    try {
      const [gRes, efRes] = await Promise.all([
        authFetch('/api/goals'),
        authFetch('/api/goals/emergency-fund')
      ]);
      if (gRes.ok) setGoals(await gRes.json());
      if (efRes.ok) setEmergencyFund(await efRes.json());
    } catch (e) { console.error(e); }
  };

  const loadSplits = async () => {
    try {
      const res = await authFetch('/api/splits');
      if (res.ok) setSplitsData(await res.json());
    } catch (e) { console.error(e); }
  };

  const loadInsurance = async () => {
    try {
      const res = await authFetch('/api/insurance');
      if (res.ok) setInsuranceData(await res.json());
    } catch (e) { console.error(e); }
  };

  const loadVehiclesAndTrips = async () => {
    try {
      const [vRes, tRes] = await Promise.all([
        authFetch('/api/vehicles'),
        authFetch('/api/trips')
      ]);
      if (vRes.ok) setVehicles(await vRes.json());
      if (tRes.ok) setTrips(await tRes.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      loadHousehold(),
      loadLoans(),
      loadGoals(),
      loadSplits(),
      loadInsurance(),
      loadVehiclesAndTrips()
    ]).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!selectedLoan || !token) return;
    const fetchAmortization = async () => {
      try {
        const res = await authFetch(`/api/loans/${selectedLoan.id}/amortization`);
        if (res.ok) setAmortization(await res.json());
      } catch (e) { console.error(e); }
    };
    fetchAmortization();
    runPrepaySim(prepayLumpSum, prepayExtraEmi);
  }, [selectedLoan, token]);

  const runPrepaySim = async (lump, extra) => {
    if (!selectedLoan || !token) return;
    try {
      const res = await authFetch(`/api/loans/${selectedLoan.id}/prepayment-sim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lump_sum: parseFloat(lump || 0), extra_monthly_emi: parseFloat(extra || 0) })
      });
      if (res.ok) setPrepaymentSim(await res.json());
    } catch (e) { console.error(e); }
  };

  // Handlers
  const handleAddMember = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/household/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember)
      });
      if (res.ok) {
        setShowAddMember(false);
        setNewMember({ name: '', relationship: 'SPOUSE', avatar_color: '#3F8F5E' });
        loadHousehold();
      }
    } catch (err) { console.error(err); }
  };

  const handleDeleteMember = async (memberId) => {
    const ok = await confirm({
      title: 'Remove Family Member',
      message: 'Are you sure you want to remove this family member from your household profile?',
      confirmText: 'Remove Member',
      isDanger: true
    });
    if (!ok) return;

    try {
      const res = await authFetch(`/api/household/members/${memberId}`, { method: 'DELETE' });
      if (res.ok) {
        loadHousehold();
        toast.success('Family member removed.');
      }
    } catch (err) { console.error(err); }
  };

  const handleAddLoan = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newLoan,
          principal_amount: parseFloat(newLoan.principal_amount),
          outstanding_balance: parseFloat(newLoan.outstanding_balance || newLoan.principal_amount),
          annual_interest_rate: parseFloat(newLoan.annual_interest_rate),
          tenure_months: parseInt(newLoan.tenure_months)
        })
      });
      if (res.ok) {
        setShowAddLoan(false);
        setNewLoan({
          loan_name: '',
          loan_type: 'HOME_LOAN',
          lender_name: '',
          principal_amount: '',
          outstanding_balance: '',
          annual_interest_rate: '8.5',
          tenure_months: '240',
          start_date: new Date().toISOString().split('T')[0]
        });
        toast.success('Loan added successfully.');
        loadLoans();
      }
    } catch (err) { console.error(err); }
  };

  const handleUpdateLoan = async (e) => {
    e.preventDefault();
    if (!editingLoan) return;
    try {
      const res = await authFetch(`/api/loans/${editingLoan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_name: editingLoan.loan_name,
          loan_type: editingLoan.loan_type,
          lender_name: editingLoan.lender_name,
          principal_amount: parseFloat(editingLoan.principal_amount),
          outstanding_balance: parseFloat(editingLoan.outstanding_balance),
          annual_interest_rate: parseFloat(editingLoan.annual_interest_rate),
          tenure_months: parseInt(editingLoan.tenure_months),
          start_date: editingLoan.start_date
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setEditingLoan(null);
        toast.success('Loan updated successfully.');
        await loadLoans();
        if (selectedLoan?.id === updated.id) {
          setSelectedLoan(updated);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Failed to update loan');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error updating loan');
    }
  };

  const handleDeleteLoan = async (loanId, e) => {
    if (e) e.stopPropagation();
    const ok = await confirm({
      title: 'Delete Loan',
      message: 'Are you sure you want to delete this loan? Associated amortization schedules will be removed.',
      confirmText: 'Delete Loan',
      isDanger: true
    });
    if (!ok) return;

    try {
      const res = await authFetch(`/api/loans/${loanId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Loan deleted.');
        if (selectedLoan?.id === loanId) {
          setSelectedLoan(null);
        }
        await loadLoans();
      } else {
        toast.error('Failed to delete loan');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error deleting loan');
    }
  };

  const handleAddGoal = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newGoal,
          target_amount: parseFloat(newGoal.target_amount),
          current_amount: parseFloat(newGoal.current_amount || 0),
          monthly_contribution: parseFloat(newGoal.monthly_contribution || 0)
        })
      });
      if (res.ok) {
        setShowAddGoal(false);
        setNewGoal({
          name: '',
          category: 'EMERGENCY_FUND',
          target_amount: '',
          current_amount: '',
          monthly_contribution: '',
          priority: 'HIGH'
        });
        toast.success('Financial goal created.');
        loadGoals();
      }
    } catch (err) { console.error(err); }
  };

  const handleUpdateGoal = async (e) => {
    e.preventDefault();
    if (!editingGoal) return;
    try {
      const res = await authFetch(`/api/goals/${editingGoal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingGoal.name,
          category: editingGoal.category,
          target_amount: parseFloat(editingGoal.target_amount),
          current_amount: parseFloat(editingGoal.current_amount || 0),
          monthly_contribution: parseFloat(editingGoal.monthly_contribution || 0),
          priority: editingGoal.priority
        })
      });
      if (res.ok) {
        setEditingGoal(null);
        toast.success('Goal updated successfully.');
        loadGoals();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Failed to update goal');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error updating goal');
    }
  };

  const handleDeleteGoal = async (goalId, e) => {
    if (e) e.stopPropagation();
    const ok = await confirm({
      title: 'Delete Financial Goal',
      message: 'Are you sure you want to delete this financial goal?',
      confirmText: 'Delete Goal',
      isDanger: true
    });
    if (!ok) return;

    try {
      const res = await authFetch(`/api/goals/${goalId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Goal deleted.');
        loadGoals();
      } else {
        toast.error('Failed to delete goal');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error deleting goal');
    }
  };

  const handleAddSplit = async (e) => {
    e.preventDefault();
    try {
      const names = newSplit.participantsStr.split(',').map(n => n.trim()).filter(Boolean);
      const total = parseFloat(newSplit.total_amount);
      const perPerson = names.length > 0 ? (total / (names.length + (newSplit.paid_by_user ? 1 : 1))) : total;

      const participants = names.map(n => ({ name: n, share_amount: perPerson }));

      const res = await authFetch('/api/splits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newSplit.title,
          total_amount: total,
          paid_by_user: newSplit.paid_by_user,
          payer_name: newSplit.payer_name,
          expense_date: newSplit.expense_date,
          category: newSplit.category,
          participants
        })
      });
      if (res.ok) {
        setShowAddSplit(false);
        setNewSplit({ title: '', total_amount: '', paid_by_user: true, payer_name: 'Me', expense_date: new Date().toISOString().split('T')[0], category: 'Dining', participantsStr: '' });
        loadSplits();
      }
    } catch (err) { console.error(err); }
  };

  const handleSettleParticipant = async (participantId) => {
    try {
      const res = await authFetch(`/api/splits/participant/${participantId}/settle`, { method: 'POST' });
      if (res.ok) loadSplits();
    } catch (err) { console.error(err); }
  };

  const handleAddInsurance = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/insurance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newInsurance,
          sum_insured: parseFloat(newInsurance.sum_insured),
          premium_amount: parseFloat(newInsurance.premium_amount)
        })
      });
      if (res.ok) {
        setShowAddInsurance(false);
        loadInsurance();
      }
    } catch (err) { console.error(err); }
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newVehicle,
          odometer_reading: parseFloat(newVehicle.odometer_reading || 0)
        })
      });
      if (res.ok) {
        setShowAddVehicle(false);
        loadVehiclesAndTrips();
      }
    } catch (err) { console.error(err); }
  };

  const handleAddTrip = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newTrip,
          budget: newTrip.budget ? parseFloat(newTrip.budget) : null
        })
      });
      if (res.ok) {
        setShowAddTrip(false);
        loadVehiclesAndTrips();
      }
    } catch (err) { console.error(err); }
  };

  const subTabs = [
    { key: 'overview', label: 'Overview & Family', count: householdData?.members?.length, icon: Users },
    { key: 'loans', label: 'Loans & Mortgages', count: loans.length, icon: Landmark },
    { key: 'goals', label: 'Goals & Emergency', count: goals.length, icon: Target },
    { key: 'splits', label: 'Split Bills', count: splitsData.expenses?.length, icon: Receipt },
    { key: 'insurance', label: 'Insurance Vault', count: insuranceData.policies?.length, icon: ShieldCheck },
    { key: 'travel_vehicles', label: 'Trips & Vehicles', count: (vehicles.length + trips.length), icon: Plane }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-200 pb-12">
      
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pb-2 border-b border-[#E4E8E3]/30">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-[#F1F5F2]' : 'text-[#1D2822]'}`}>
              Household & Family OS
            </h2>
            <Badge variant="verified">Family & Wealth</Badge>
          </div>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            Consolidated family assets, reducing balance home loans, goals, UPI splits, and policy renewals
          </p>
        </div>

        <div className={`p-3 rounded-[12px] border flex items-center gap-3 ${
          isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
        }`}>
          <HeartHandshake className="h-4 w-4 text-[#3F8F5E]" />
          <div>
            <div className="text-[10px] font-bold uppercase text-[#8B978F]">Combined Net Worth</div>
            <div className="text-sm font-bold text-[#3F8F5E] tabular-nums">
              {formatCurrency(householdData?.combined_net_worth || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Sub-Tab Segmented Navigation */}
      <div className={`p-1 rounded-[12px] border flex flex-wrap gap-1 ${
        isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
      }`}>
        {subTabs.map(t => {
          const Icon = t.icon;
          const active = activeSubTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveSubTab(t.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-[8px] text-xs font-semibold transition-all border-0 cursor-pointer ${
                active
                  ? 'bg-[#3F8F5E] text-white shadow-xs'
                  : isDark ? 'bg-transparent text-[#C2CCC5] hover:text-[#F1F5F2] hover:bg-[#1C251F]' : 'bg-transparent text-[#4F5D55] hover:text-[#1D2822] hover:bg-[#F1F8F4]'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{t.label}</span>
              {t.count !== undefined && t.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  active ? 'bg-white/20 text-white' : isDark ? 'bg-[#2A352D] text-[#8B978F]' : 'bg-[#E4E8E3] text-[#7B877F]'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* SUB-TAB: 1. OVERVIEW & FAMILY */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Top Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-5 rounded-[16px] border flex flex-col justify-between ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B978F]">Combined Net Worth</span>
              <h3 className="text-xl font-bold tabular-nums text-[#3F8F5E] mt-2">
                {formatCurrency(householdData?.combined_net_worth || 0)}
              </h3>
              <span className="text-[10px] text-[#8B978F] mt-1 font-medium">Across all family accounts</span>
            </div>

            <div className={`p-5 rounded-[16px] border flex flex-col justify-between ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B978F]">Shared Liquid Assets</span>
              <h3 className="text-xl font-bold tabular-nums mt-2">
                {formatCurrency(householdData?.shared_net_worth || 0)}
              </h3>
              <span className="text-[10px] text-[#8B978F] mt-1 font-medium">Excludes private accounts</span>
            </div>

            <div className={`p-5 rounded-[16px] border flex flex-col justify-between ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B978F]">Total Assets</span>
              <h3 className="text-xl font-bold tabular-nums text-[#3F8F5E] mt-2">
                {formatCurrency(householdData?.total_assets || 0)}
              </h3>
              <span className="text-[10px] text-[#8B978F] mt-1 font-medium">Bank + FDs + Investments</span>
            </div>

            <div className={`p-5 rounded-[16px] border flex flex-col justify-between ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B978F]">Active Liabilities</span>
              <h3 className="text-xl font-bold tabular-nums mt-2">
                {formatCurrency(householdData?.total_liabilities || 0)}
              </h3>
              <span className="text-[10px] text-[#8B978F] mt-1 font-medium">Loans + Credit Facilities</span>
            </div>
          </div>

          {/* Family Members & Household Expenses */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Family Members Card */}
            <div className={`p-6 rounded-[16px] border flex flex-col gap-4 ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#3F8F5E]" />
                  <h4 className="text-sm font-bold">Family Members</h4>
                </div>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => setShowAddMember(true)}
                  icon={Plus}
                >
                  Add Member
                </Button>
              </div>

              <div className="space-y-2 mt-1">
                {(!householdData?.members || householdData.members.length === 0) ? (
                  <div className="text-center p-6 text-[#8B978F] text-xs">
                    No family members added. Click "Add Member" to configure household.
                  </div>
                ) : (
                  householdData.members.map(m => (
                    <div key={m.id} className={`p-3 rounded-[10px] border flex items-center justify-between ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div 
                          className="h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                          style={{ backgroundColor: m.avatar_color || '#3F8F5E' }}
                        >
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-bold">{m.name}</div>
                          <div className="text-[10px] uppercase font-bold text-[#8B978F]">{m.relationship}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteMember(m.id)}
                        className="p-1 text-[#8B978F] hover:text-[#C85C5C] border-0 bg-transparent cursor-pointer"
                        title="Remove member"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Indian Household Category Spending */}
            <div className={`lg:col-span-2 p-6 rounded-[16px] border flex flex-col gap-4 ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4 text-[#A77B58]" />
                <h4 className="text-sm font-bold">Household Monthly Commitments</h4>
              </div>
              <p className="text-xs text-[#8B978F]">
                Dedicated domestic help (Maid, Cook), utilities, society maintenance, groceries, and school fees.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-1">
                {(() => {
                  const spending = householdData?.household_spending || {};
                  const getCatSum = (keys) => keys.reduce((acc, k) => acc + (spending[k] || 0), 0);
                  const commitmentItems = [
                    { cat: 'Society Maintenance', amt: getCatSum(['Society Maintenance']) },
                    { cat: 'Domestic Staff (Maid/Cook)', amt: getCatSum(['Domestic Help', 'Cook', 'Maid']) },
                    { cat: 'Groceries & Provisions', amt: getCatSum(['Groceries', 'Milk']) },
                    { cat: 'Electricity & Water', amt: getCatSum(['Electricity', 'Gas', 'Water']) },
                    { cat: 'School & Tuition', amt: getCatSum(['School', 'Tuition']) },
                    { cat: 'Internet & Streaming', amt: getCatSum(['Internet']) }
                  ];
                  return commitmentItems.map((item, idx) => (
                    <div key={idx} className={`p-3.5 rounded-[10px] border flex flex-col justify-between ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}>
                      <span className="text-[11px] text-[#8B978F] font-medium truncate">{item.cat}</span>
                      <span className="text-base font-bold tabular-nums mt-1.5">
                        {formatCurrency(item.amt)}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: 2. LOANS & REDUCING BALANCE MORTGAGES */}
      {activeSubTab === 'loans' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Active Loans & Mortgages ({loans.length})</h3>
              <p className="text-xs text-[#8B978F]">Reducing balance interest calculations and prepayment simulator</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => setShowAddLoan(true)} icon={Plus}>
              Add Loan
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Loan Selector List (4 cols) */}
            <div className="lg:col-span-4 space-y-3">
              {loans.length === 0 ? (
                <div className={`p-6 rounded-[14px] border text-center text-xs text-[#8B978F] ${
                  isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
                }`}>
                  No active loans recorded. Add a home loan or car loan to simulate prepayments.
                </div>
              ) : (
                loans.map(l => (
                  <div
                    key={l.id}
                    onClick={() => setSelectedLoan(l)}
                    className={`p-4 rounded-[12px] border cursor-pointer transition-all ${
                      selectedLoan?.id === l.id
                        ? isDark ? 'bg-[#1C251F] border-[#5BAE78]' : 'bg-[#F1F8F4] border-[#7FC39A]'
                        : isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">{l.loan_name}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="brown" size="xs">{l.annual_interest_rate}% p.a.</Badge>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingLoan({ ...l });
                          }}
                          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-[#8B978F] hover:text-[#1D2822] dark:hover:text-white transition-colors"
                          title="Edit Loan"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteLoan(l.id, e)}
                          className="p-1 rounded hover:bg-rose-500/10 text-[#8B978F] hover:text-rose-500 transition-colors"
                          title="Delete Loan"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-base font-bold tabular-nums mt-2">
                      {formatCurrency(parseFloat(l.outstanding_balance || l.principal_amount))}
                    </div>
                    <div className="text-[11px] text-[#8B978F] mt-1">{l.lender_name} · {l.tenure_months}m tenure</div>
                  </div>
                ))
              )}
            </div>

            {/* Selected Loan & Prepayment Simulator (8 cols) */}
            <div className={`lg:col-span-8 p-6 rounded-[16px] border flex flex-col gap-6 ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              {selectedLoan ? (
                <>
                  <div className="flex items-center justify-between pb-4 border-b border-[#E4E8E3]/20">
                    <div>
                      <h4 className="text-base font-bold">{selectedLoan.loan_name}</h4>
                      <span className="text-xs text-[#8B978F]">{selectedLoan.lender_name} · Started {selectedLoan.start_date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingLoan({ ...selectedLoan })}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-[8px] border border-[#E4E8E3] dark:border-[#2A352D] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        title="Edit Loan"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteLoan(selectedLoan.id, e)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-[8px] border border-rose-200 dark:border-rose-900/40 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                        title="Delete Loan"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                      <Badge variant="verified">Reducing Balance</Badge>
                    </div>
                  </div>

                  {/* Prepayment Simulator Controls */}
                  <div className={`p-4 rounded-[12px] border space-y-4 ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}>
                    <div className="flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-[#3F8F5E]" />
                      <span className="text-xs font-bold">Prepayment & Tenure Reduction Simulator</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="font-semibold block mb-1">One-time Lump Sum Prepayment (₹)</label>
                        <input
                          type="number"
                          value={prepayLumpSum}
                          onChange={(e) => {
                            setPrepayLumpSum(e.target.value);
                            runPrepaySim(e.target.value, prepayExtraEmi);
                          }}
                          className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="font-semibold block mb-1">Extra Monthly EMI (₹)</label>
                        <input
                          type="number"
                          value={prepayExtraEmi}
                          onChange={(e) => {
                            setPrepayExtraEmi(e.target.value);
                            runPrepaySim(prepayLumpSum, e.target.value);
                          }}
                          className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
                          }`}
                        />
                      </div>
                    </div>

                    {prepaymentSim && (
                      <div className="p-3 rounded-[10px] bg-[#E2F1E8] text-[#285A3A] text-xs font-medium space-y-1">
                        <div>Estimated Interest Saved: <strong>{formatCurrency(prepaymentSim.interest_saved || 0)}</strong></div>
                        <div>Tenure Reduced by: <strong>{prepaymentSim.months_saved || 0} months</strong></div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-xs text-[#8B978F]">
                  Select or add a loan to inspect amortization and prepayment options.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: 3. GOALS & EMERGENCY RUNWAY */}
      {activeSubTab === 'goals' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Financial Goals & Emergency Reserve</h3>
              <p className="text-xs text-[#8B978F]">Target accumulation, monthly SIP commitments, and survival runway</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => setShowAddGoal(true)} icon={Plus}>
              Add Goal
            </Button>
          </div>

          {/* Emergency Runway Assessment Card */}
          {emergencyFund && (
            <div className={`p-6 rounded-[16px] border flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#3F8F5E]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#8B978F]">Emergency Reserve Runway</span>
                  <Badge variant={emergencyFund.status === 'EXCELLENT' ? 'verified' : emergencyFund.status === 'MODERATE' ? 'brand' : 'brown'}>
                    {emergencyFund.status || 'UNASSESSED'}
                  </Badge>
                </div>
                <div className="text-2xl font-bold tracking-tight mt-1">
                  {emergencyFund.coverage_months || 0} <span className="text-sm font-normal text-[#8B978F]">Months Runway</span>
                </div>
                <p className="text-xs text-[#8B978F]">
                  Liquid reserves cover your essential monthly burn (expenses + EMIs) of {formatCurrency(emergencyFund.total_monthly_burn || 0)}/mo.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
                <div className={`p-3 rounded-[10px] border ${isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'}`}>
                  <span className="text-[10px] uppercase font-bold text-[#8B978F]">Liquid Reserves</span>
                  <div className="text-sm font-bold tabular-nums mt-0.5">{formatCurrency(emergencyFund.liquid_reserves || 0)}</div>
                </div>
                <div className={`p-3 rounded-[10px] border ${isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'}`}>
                  <span className="text-[10px] uppercase font-bold text-[#8B978F]">Target (6 Months)</span>
                  <div className="text-sm font-bold tabular-nums mt-0.5">{formatCurrency(emergencyFund.recommended_buffer_6m || 0)}</div>
                </div>
                <div className={`p-3 rounded-[10px] border ${isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'}`}>
                  <span className="text-[10px] uppercase font-bold text-[#8B978F]">Shortfall</span>
                  <div className={`text-sm font-bold tabular-nums mt-0.5 ${(emergencyFund.shortfall || 0) > 0 ? 'text-amber-500' : 'text-[#3F8F5E]'}`}>
                    {formatCurrency(emergencyFund.shortfall || 0)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {goals.length === 0 ? (
            <div className={`p-8 rounded-[16px] border text-center text-xs text-[#8B978F] ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3]'
            }`}>
              No financial goals configured yet. Click "Add Goal" to set emergency buffers, vacation funds, or milestone targets.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {goals.map(g => {
                const current = parseFloat(g.current_amount || 0);
                const target = parseFloat(g.target_amount || 1);
                const pct = Math.min(100, Math.round((current / target) * 100));

                return (
                  <div key={g.id} className={`p-5 rounded-[16px] border flex flex-col justify-between ${
                    isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs">{g.name}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="brown" size="xs">{g.category}</Badge>
                          <button
                            type="button"
                            onClick={() => setEditingGoal({ ...g })}
                            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-[#8B978F] hover:text-[#1D2822] dark:hover:text-white transition-colors"
                            title="Edit Goal"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteGoal(g.id, e)}
                            className="p-1 rounded hover:bg-rose-500/10 text-[#8B978F] hover:text-rose-500 transition-colors"
                            title="Delete Goal"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="text-lg font-bold tabular-nums mt-3">
                        {formatCurrency(current)} <span className="text-xs font-normal text-[#8B978F]">/ {formatCurrency(target)}</span>
                      </div>

                      <div className="w-full h-1.5 rounded-full bg-black/5 dark:bg-white/10 my-3 overflow-hidden">
                        <div className="h-full bg-[#3F8F5E] rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#8B978F] pt-3 border-t border-[#E4E8E3]/20">
                      <span>{pct}% Completed</span>
                      <span>+{formatCurrency(g.monthly_contribution || 0)} / mo</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB: 4. SPLIT BILLS */}
      {activeSubTab === 'splits' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Shared Bills & Settlements</h3>
              <p className="text-xs text-[#8B978F]">Track group trips, roommate rent, and UPI settlements</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => setShowAddSplit(true)} icon={Plus}>
              Record Split Bill
            </Button>
          </div>

          <div className="divide-y divide-[#E4E8E3]/20 rounded-[16px] border overflow-hidden">
            {splitsData.expenses?.map(s => (
              <div key={s.id} className={`p-4 flex items-center justify-between text-xs ${
                isDark ? 'bg-[#171E19]' : 'bg-[#FFFFFF]'
              }`}>
                <div>
                  <div className="font-bold">{s.title}</div>
                  <div className="text-[11px] text-[#8B978F] mt-0.5">{s.expense_date} · Paid by {s.payer_name}</div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-bold tabular-nums">{formatCurrency(s.total_amount)}</span>
                  {s.participants?.map(p => (
                    !p.is_settled && (
                      <Button
                        key={p.id}
                        variant="secondary"
                        size="xs"
                        onClick={() => handleSettleParticipant(p.id)}
                      >
                        Settle {p.name} ({formatCurrency(p.share_amount)})
                      </Button>
                    )
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB: 5. INSURANCE VAULT */}
      {activeSubTab === 'insurance' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Insurance Portfolio Vault</h3>
              <p className="text-xs text-[#8B978F]">Health, Term Life, and Motor vehicle policies with renewal countdowns</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => setShowAddInsurance(true)} icon={Plus}>
              Add Policy
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {insuranceData.policies?.map(p => (
              <div key={p.id} className={`p-5 rounded-[16px] border flex flex-col justify-between ${
                isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
              }`}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs">{p.policy_name}</span>
                    <Badge variant="verified" size="xs">{p.policy_type}</Badge>
                  </div>
                  <div className="text-base font-bold tabular-nums mt-2">
                    Sum Insured: {formatCurrency(p.sum_insured)}
                  </div>
                  <div className="text-xs text-[#8B978F] mt-1">{p.insurer_name} · #{p.policy_number}</div>
                </div>

                <div className="pt-3 border-t border-[#E4E8E3]/20 mt-4 flex items-center justify-between text-xs">
                  <span className="text-[#8B978F]">Premium: {formatCurrency(p.premium_amount)} / {p.premium_frequency}</span>
                  <span className="text-[#3F8F5E] font-semibold">Renews: {p.renewal_date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB: 6. TRIPS & VEHICLES */}
      {activeSubTab === 'travel_vehicles' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Vehicles, Fuel & Travel Trips</h3>
              <p className="text-xs text-[#8B978F]">Automobile maintenance logs and travel budget monitoring</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowAddVehicle(true)} icon={Car}>
                Add Vehicle
              </Button>
              <Button variant="primary" size="sm" onClick={() => setShowAddTrip(true)} icon={Plane}>
                Add Trip
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Vehicles */}
            <div className={`p-6 rounded-[16px] border flex flex-col gap-4 ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#8B978F]">Vehicles & Fuel Logs</h4>
              <div className="space-y-3">
                {vehicles.map(v => (
                  <div key={v.id} className={`p-3.5 rounded-[10px] border flex items-center justify-between ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}>
                    <div>
                      <div className="font-bold text-xs">{v.vehicle_name} ({v.registration_number})</div>
                      <div className="text-[11px] text-[#8B978F] mt-0.5">{v.fuel_type} · Odometer: {v.odometer_reading} km</div>
                    </div>
                    <Badge variant="brown" size="xs">Active</Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Travel Trips */}
            <div className={`p-6 rounded-[16px] border flex flex-col gap-4 ${
              isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] shadow-xs'
            }`}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#8B978F]">Travel Trips & Holidays</h4>
              <div className="space-y-3">
                {trips.map(t => (
                  <div key={t.id} className={`p-3.5 rounded-[10px] border flex items-center justify-between ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}>
                    <div>
                      <div className="font-bold text-xs">{t.trip_name} ({t.destination})</div>
                      <div className="text-[11px] text-[#8B978F] mt-0.5">Budget: {formatCurrency(t.budget || 0)}</div>
                    </div>
                    <Badge variant="positive" size="xs">Planned</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MINIMALIST MODALS --- */}

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setShowAddMember(false)} />
          <div className={`relative w-full max-w-md rounded-[16px] p-6 border shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 ${
            isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E8E3]/20 mb-4">
              <h3 className="text-sm font-bold">Add Family Member</h3>
              <button type="button" onClick={() => setShowAddMember(false)} className="border-0 bg-transparent text-[#8B978F] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddMember} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold block mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={newMember.name}
                  onChange={e => setNewMember({ ...newMember, name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                  placeholder="e.g. Priya"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Relationship</label>
                <select
                  value={newMember.relationship}
                  onChange={e => setNewMember({ ...newMember, relationship: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none cursor-pointer ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                >
                  <option value="SPOUSE">Spouse</option>
                  <option value="PARENT">Parent</option>
                  <option value="CHILD">Child</option>
                  <option value="SELF">Self</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="pt-4 border-t border-[#E4E8E3]/20 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowAddMember(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit">Save Member</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Loan Modal */}
      {showAddLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setShowAddLoan(false)} />
          <div className={`relative w-full max-w-lg rounded-[16px] p-6 border shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 ${
            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E8E3]/20 mb-4">
              <h3 className="text-sm font-bold">Add Loan Facility</h3>
              <button type="button" onClick={() => setShowAddLoan(false)} className="border-0 bg-transparent text-[#8B978F] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddLoan} className="grid grid-cols-2 gap-4 text-xs">
              <div className="col-span-2">
                <label className="font-semibold block mb-1">Loan Name</label>
                <input
                  type="text"
                  required
                  value={newLoan.loan_name}
                  onChange={e => setNewLoan({ ...newLoan, loan_name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                  placeholder="e.g. HDFC Home Loan"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Lender Bank</label>
                <input
                  type="text"
                  required
                  value={newLoan.lender_name}
                  onChange={e => setNewLoan({ ...newLoan, lender_name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                  placeholder="e.g. HDFC Bank"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Loan Type</label>
                <select
                  value={newLoan.loan_type}
                  onChange={e => setNewLoan({ ...newLoan, loan_type: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none cursor-pointer ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                >
                  <option value="HOME_LOAN">Home Loan</option>
                  <option value="CAR_LOAN">Car Loan</option>
                  <option value="PERSONAL_LOAN">Personal Loan</option>
                  <option value="EDUCATION_LOAN">Education Loan</option>
                </select>
              </div>
              <div>
                <label className="font-semibold block mb-1">Principal Amount (₹)</label>
                <input
                  type="number"
                  required
                  value={newLoan.principal_amount}
                  onChange={e => setNewLoan({ ...newLoan, principal_amount: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                  placeholder="3000000"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Interest Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newLoan.annual_interest_rate}
                  onChange={e => setNewLoan({ ...newLoan, annual_interest_rate: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                  placeholder="8.5"
                />
              </div>
              <div className="col-span-2 pt-4 border-t border-[#E4E8E3]/20 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowAddLoan(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit">Save Loan</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Loan Modal */}
      {editingLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setEditingLoan(null)} />
          <div className={`relative w-full max-w-lg rounded-[16px] p-6 border shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 ${
            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E8E3]/20 mb-4">
              <h3 className="text-sm font-bold">Edit Loan Facility</h3>
              <button type="button" onClick={() => setEditingLoan(null)} className="border-0 bg-transparent text-[#8B978F] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateLoan} className="grid grid-cols-2 gap-4 text-xs">
              <div className="col-span-2">
                <label className="font-semibold block mb-1">Loan Name</label>
                <input
                  type="text"
                  required
                  value={editingLoan.loan_name || ''}
                  onChange={e => setEditingLoan({ ...editingLoan, loan_name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Lender Bank</label>
                <input
                  type="text"
                  required
                  value={editingLoan.lender_name || ''}
                  onChange={e => setEditingLoan({ ...editingLoan, lender_name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Loan Type</label>
                <select
                  value={editingLoan.loan_type || 'HOME_LOAN'}
                  onChange={e => setEditingLoan({ ...editingLoan, loan_type: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none cursor-pointer ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                >
                  <option value="HOME_LOAN">Home Loan</option>
                  <option value="CAR_LOAN">Car Loan</option>
                  <option value="PERSONAL_LOAN">Personal Loan</option>
                  <option value="EDUCATION_LOAN">Education Loan</option>
                </select>
              </div>
              <div>
                <label className="font-semibold block mb-1">Principal Sanctioned (₹)</label>
                <input
                  type="number"
                  required
                  value={editingLoan.principal_amount ?? ''}
                  onChange={e => setEditingLoan({ ...editingLoan, principal_amount: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Outstanding Balance (₹)</label>
                <input
                  type="number"
                  required
                  value={editingLoan.outstanding_balance ?? ''}
                  onChange={e => setEditingLoan({ ...editingLoan, outstanding_balance: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Interest Rate (% p.a.)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editingLoan.annual_interest_rate ?? ''}
                  onChange={e => setEditingLoan({ ...editingLoan, annual_interest_rate: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Tenure (Months)</label>
                <input
                  type="number"
                  required
                  value={editingLoan.tenure_months ?? ''}
                  onChange={e => setEditingLoan({ ...editingLoan, tenure_months: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                />
              </div>
              <div className="col-span-2 pt-4 border-t border-[#E4E8E3]/20 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditingLoan(null)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit">Update Loan</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Goal Modal */}
      {showAddGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setShowAddGoal(false)} />
          <div className={`relative w-full max-w-md rounded-[16px] p-6 border shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 ${
            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E8E3]/20 mb-4">
              <h3 className="text-sm font-bold">Add Financial Goal</h3>
              <button type="button" onClick={() => setShowAddGoal(false)} className="border-0 bg-transparent text-[#8B978F] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddGoal} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Goal Name</label>
                <input
                  type="text"
                  required
                  value={newGoal.name}
                  onChange={e => setNewGoal({ ...newGoal, name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                  placeholder="e.g. 6-Month Emergency Runway"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Target Amount (₹)</label>
                  <input
                    type="number"
                    required
                    value={newGoal.target_amount}
                    onChange={e => setNewGoal({ ...newGoal, target_amount: e.target.value })}
                    className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Current Saved (₹)</label>
                  <input
                    type="number"
                    value={newGoal.current_amount}
                    onChange={e => setNewGoal({ ...newGoal, current_amount: e.target.value })}
                    className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}
                  />
                </div>
              </div>
              <div className="pt-4 border-t border-[#E4E8E3]/20 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowAddGoal(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit">Save Goal</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Goal Modal */}
      {editingGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setEditingGoal(null)} />
          <div className={`relative w-full max-w-md rounded-[16px] p-6 border shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 ${
            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E8E3]/20 mb-4">
              <h3 className="text-sm font-bold">Edit Financial Goal</h3>
              <button type="button" onClick={() => setEditingGoal(null)} className="border-0 bg-transparent text-[#8B978F] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateGoal} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Goal Name</label>
                <input
                  type="text"
                  required
                  value={editingGoal.name || ''}
                  onChange={e => setEditingGoal({ ...editingGoal, name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Category</label>
                <input
                  type="text"
                  value={editingGoal.category || ''}
                  onChange={e => setEditingGoal({ ...editingGoal, category: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Target Amount (₹)</label>
                  <input
                    type="number"
                    required
                    value={editingGoal.target_amount ?? ''}
                    onChange={e => setEditingGoal({ ...editingGoal, target_amount: e.target.value })}
                    className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Current Saved (₹)</label>
                  <input
                    type="number"
                    value={editingGoal.current_amount ?? ''}
                    onChange={e => setEditingGoal({ ...editingGoal, current_amount: e.target.value })}
                    className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold block mb-1">Monthly Contribution (₹)</label>
                <input
                  type="number"
                  value={editingGoal.monthly_contribution ?? ''}
                  onChange={e => setEditingGoal({ ...editingGoal, monthly_contribution: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                />
              </div>
              <div className="pt-4 border-t border-[#E4E8E3]/20 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditingGoal(null)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit">Update Goal</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Split Modal */}
      {showAddSplit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setShowAddSplit(false)} />
          <div className={`relative w-full max-w-md rounded-[16px] p-6 border shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 ${
            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E8E3]/20 mb-4">
              <h3 className="text-sm font-bold">Split An Expense</h3>
              <button type="button" onClick={() => setShowAddSplit(false)} className="border-0 bg-transparent text-[#8B978F] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddSplit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Expense Title</label>
                <input
                  type="text"
                  required
                  value={newSplit.title}
                  onChange={e => setNewSplit({ ...newSplit, title: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                  placeholder="e.g. Dinner at Smoke House Deli"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Total Amount (₹)</label>
                  <input
                    type="number"
                    required
                    value={newSplit.total_amount}
                    onChange={e => setNewSplit({ ...newSplit, total_amount: e.target.value })}
                    className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Category</label>
                  <input
                    type="text"
                    value={newSplit.category}
                    onChange={e => setNewSplit({ ...newSplit, category: e.target.value })}
                    className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold block mb-1">Participants (comma separated names)</label>
                <input
                  type="text"
                  required
                  value={newSplit.participantsStr}
                  onChange={e => setNewSplit({ ...newSplit, participantsStr: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                  placeholder="e.g. Rahul, Sneha, Rohan"
                />
              </div>
              <div className="pt-4 border-t border-[#E4E8E3]/20 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowAddSplit(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit">Create Split</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Insurance Modal */}
      {showAddInsurance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setShowAddInsurance(false)} />
          <div className={`relative w-full max-w-md rounded-[16px] p-6 border shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 ${
            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E8E3]/20 mb-4">
              <h3 className="text-sm font-bold">Add Insurance Policy</h3>
              <button type="button" onClick={() => setShowAddInsurance(false)} className="border-0 bg-transparent text-[#8B978F] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddInsurance} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Policy Name</label>
                <input
                  type="text"
                  required
                  value={newInsurance.policy_name}
                  onChange={e => setNewInsurance({ ...newInsurance, policy_name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                  placeholder="e.g. HDFC Ergo Optima Restore"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Sum Insured (₹)</label>
                  <input
                    type="number"
                    required
                    value={newInsurance.sum_insured}
                    onChange={e => setNewInsurance({ ...newInsurance, sum_insured: e.target.value })}
                    className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Annual Premium (₹)</label>
                  <input
                    type="number"
                    required
                    value={newInsurance.premium_amount}
                    onChange={e => setNewInsurance({ ...newInsurance, premium_amount: e.target.value })}
                    className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}
                  />
                </div>
              </div>
              <div className="pt-4 border-t border-[#E4E8E3]/20 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowAddInsurance(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit">Save Policy</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showAddVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setShowAddVehicle(false)} />
          <div className={`relative w-full max-w-md rounded-[16px] p-6 border shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 ${
            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E8E3]/20 mb-4">
              <h3 className="text-sm font-bold">Add Vehicle</h3>
              <button type="button" onClick={() => setShowAddVehicle(false)} className="border-0 bg-transparent text-[#8B978F] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddVehicle} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Vehicle Name / Model</label>
                <input
                  type="text"
                  required
                  value={newVehicle.vehicle_name}
                  onChange={e => setNewVehicle({ ...newVehicle, vehicle_name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                  placeholder="e.g. Hyundai Creta SX"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Registration #</label>
                  <input
                    type="text"
                    required
                    value={newVehicle.registration_number}
                    onChange={e => setNewVehicle({ ...newVehicle, registration_number: e.target.value })}
                    className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}
                    placeholder="KA 03 MP 1234"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Fuel Type</label>
                  <select
                    value={newVehicle.fuel_type}
                    onChange={e => setNewVehicle({ ...newVehicle, fuel_type: e.target.value })}
                    className={`w-full px-3 py-2 rounded-[8px] border outline-none cursor-pointer ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}
                  >
                    <option value="PETROL">Petrol</option>
                    <option value="DIESEL">Diesel</option>
                    <option value="EV">Electric (EV)</option>
                    <option value="CNG">CNG</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 border-t border-[#E4E8E3]/20 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowAddVehicle(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit">Save Vehicle</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Trip Modal */}
      {showAddTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setShowAddTrip(false)} />
          <div className={`relative w-full max-w-md rounded-[16px] p-6 border shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 ${
            isDark ? 'bg-[#171E19] border-[#2A352D]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E8E3]/20 mb-4">
              <h3 className="text-sm font-bold">Plan Travel Trip</h3>
              <button type="button" onClick={() => setShowAddTrip(false)} className="border-0 bg-transparent text-[#8B978F] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddTrip} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Trip Name</label>
                <input
                  type="text"
                  required
                  value={newTrip.trip_name}
                  onChange={e => setNewTrip({ ...newTrip, trip_name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                  placeholder="e.g. Goa Family Vacation"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Destination</label>
                  <input
                    type="text"
                    required
                    value={newTrip.destination}
                    onChange={e => setNewTrip({ ...newTrip, destination: e.target.value })}
                    className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Budget (₹)</label>
                  <input
                    type="number"
                    value={newTrip.budget}
                    onChange={e => setNewTrip({ ...newTrip, budget: e.target.value })}
                    className={`w-full px-3 py-2 rounded-[8px] border outline-none ${
                      isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                    }`}
                  />
                </div>
              </div>
              <div className="pt-4 border-t border-[#E4E8E3]/20 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowAddTrip(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit">Save Trip</Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
