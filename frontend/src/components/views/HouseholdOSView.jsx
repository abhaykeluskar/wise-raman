import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
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
  DollarSign,
  Calendar,
  Fuel,
  Clock,
  Sparkles,
  PiggyBank,
  ArrowRight,
  Shield,
  Layers,
  HeartHandshake
} from 'lucide-react';

export const HouseholdOSView = () => {
  const { theme, style } = useTheme();
  const { token, API_BASE_URL , authFetch} = useFinance();

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
  const [newMember, setNewMember] = useState({ name: '', relationship: 'SPOUSE', avatar_color: '#6366F1' });

  const [showAddLoan, setShowAddLoan] = useState(false);
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

  const fetchHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }), [token]);

  // Loaders
  const apiBase = API_BASE_URL || '';

  const loadHousehold = async () => {
    try {
      const res = await fetch(`${apiBase}/api/household/dashboard`, { headers: fetchHeaders });
      if (res.ok) setHouseholdData(await res.json());
    } catch (e) { console.error(e); }
  };

  const loadLoans = async () => {
    try {
      const res = await fetch(`${apiBase}/api/loans`, { headers: fetchHeaders });
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
        fetch(`${apiBase}/api/goals`, { headers: fetchHeaders }),
        fetch(`${apiBase}/api/goals/emergency-fund`, { headers: fetchHeaders })
      ]);
      if (gRes.ok) setGoals(await gRes.json());
      if (efRes.ok) setEmergencyFund(await efRes.json());
    } catch (e) { console.error(e); }
  };

  const loadSplits = async () => {
    try {
      const res = await fetch(`${apiBase}/api/splits`, { headers: fetchHeaders });
      if (res.ok) setSplitsData(await res.json());
    } catch (e) { console.error(e); }
  };

  const loadInsurance = async () => {
    try {
      const res = await fetch(`${apiBase}/api/insurance`, { headers: fetchHeaders });
      if (res.ok) setInsuranceData(await res.json());
    } catch (e) { console.error(e); }
  };

  const loadVehiclesAndTrips = async () => {
    try {
      const [vRes, tRes] = await Promise.all([
        fetch(`${apiBase}/api/vehicles`, { headers: fetchHeaders }),
        fetch(`${apiBase}/api/trips`, { headers: fetchHeaders })
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
  }, [token, API_BASE_URL]);

  useEffect(() => {
    if (!selectedLoan || !token) return;
    const fetchAmortization = async () => {
      try {
        const res = await fetch(`${apiBase}/api/loans/${selectedLoan.id}/amortization`, { headers: fetchHeaders });
        if (res.ok) setAmortization(await res.json());
      } catch (e) { console.error(e); }
    };
    fetchAmortization();
    runPrepaySim(prepayLumpSum, prepayExtraEmi);
  }, [selectedLoan, token, API_BASE_URL]);

  const runPrepaySim = async (lump, extra) => {
    if (!selectedLoan || !token) return;
    try {
      const res = await fetch(`${apiBase}/api/loans/${selectedLoan.id}/prepayment-sim`, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify({ lump_sum: parseFloat(lump || 0), extra_monthly_emi: parseFloat(extra || 0) })
      });
      if (res.ok) setPrepaymentSim(await res.json());
    } catch (e) { console.error(e); }
  };

  // Handlers
  const handleAddMember = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiBase}/api/household/members`, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(newMember)
      });
      if (res.ok) {
        setShowAddMember(false);
        setNewMember({ name: '', relationship: 'SPOUSE', avatar_color: '#6366F1' });
        loadHousehold();
      }
    } catch (err) { console.error(err); }
  };

  const handleDeleteMember = async (memberId) => {
    try {
      const res = await fetch(`${apiBase}/api/household/members/${memberId}`, {
        method: 'DELETE',
        headers: fetchHeaders
      });
      if (res.ok) {
        loadHousehold();
      }
    } catch (err) { console.error(err); }
  };

  const handleAddLoan = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiBase}/api/loans`, {
        method: 'POST',
        headers: fetchHeaders,
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
        loadLoans();
      }
    } catch (err) { console.error(err); }
  };

  const handleAddGoal = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiBase}/api/goals`, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify({
          ...newGoal,
          target_amount: parseFloat(newGoal.target_amount),
          current_amount: parseFloat(newGoal.current_amount || 0),
          monthly_contribution: parseFloat(newGoal.monthly_contribution || 0)
        })
      });
      if (res.ok) {
        setShowAddGoal(false);
        loadGoals();
      }
    } catch (err) { console.error(err); }
  };

  const handleAddSplit = async (e) => {
    e.preventDefault();
    try {
      const names = newSplit.participantsStr.split(',').map(n => n.trim()).filter(Boolean);
      const total = parseFloat(newSplit.total_amount);
      const perPerson = names.length > 0 ? (total / (names.length + (newSplit.paid_by_user ? 1 : 1))) : total;

      const participants = names.map(n => ({
        name: n,
        share_amount: perPerson
      }));

      const res = await fetch(`${apiBase}/api/splits`, {
        method: 'POST',
        headers: fetchHeaders,
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
      const res = await fetch(`${apiBase}/api/splits/participant/${participantId}/settle`, {
        method: 'POST',
        headers: fetchHeaders
      });
      if (res.ok) loadSplits();
    } catch (err) { console.error(err); }
  };

  const handleAddInsurance = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiBase}/api/insurance`, {
        method: 'POST',
        headers: fetchHeaders,
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
      const res = await fetch(`${apiBase}/api/vehicles`, {
        method: 'POST',
        headers: fetchHeaders,
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
      const res = await fetch(`${apiBase}/api/trips`, {
        method: 'POST',
        headers: fetchHeaders,
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
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 pb-16">
      
      {/* 1. Sleek Page Header */}
      <div className={`p-5 sm:p-6 rounded-3xl border-0 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-2xl flex items-center justify-center ${style('neu-flat-dark text-indigo-400', 'neu-flat-light text-indigo-600')}`}>
            <Home className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${style('text-white', 'text-slate-800')}`}>
                Household Financial OS
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                Family & Wealth
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Unified household wealth, reducing balance loan amortization, financial goals, UPI split bills, and insurance.
            </p>
          </div>
        </div>

        {/* Header Right Metric Badge */}
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl self-start md:self-auto ${style('neu-inset-dark', 'neu-inset-light')}`}>
          <HeartHandshake className="h-4 w-4 text-indigo-400" />
          <div className="text-left">
            <div className="text-[10px] font-bold uppercase text-slate-400">Combined Net Worth</div>
            <div className={`text-sm font-black text-emerald-400`}>
              {formatCurrency(householdData?.combined_net_worth || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Full-Width Segmented Tab Navigation - Clean Grid, NO horizontal scrollbars */}
      <div className={`p-1.5 rounded-2xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 ${style('neu-inset-dark', 'neu-inset-light')}`}>
        {subTabs.map(t => {
          const Icon = t.icon;
          const active = activeSubTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveSubTab(t.key)}
              className={`flex items-center justify-center gap-2 px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer text-center ${
                active
                  ? style('neu-flat-dark text-indigo-400 ring-1 ring-indigo-500/30', 'bg-indigo-600 text-white shadow-md')
                  : style('text-slate-400 hover:text-slate-200 hover:bg-white/5', 'text-slate-600 hover:text-slate-900 hover:bg-black/5')
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t.label}</span>
              {t.count !== undefined && t.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  active ? 'bg-indigo-500/30 text-indigo-200' : 'bg-slate-700/40 text-slate-400'
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
        <div className="flex flex-col gap-6">
          {/* Top Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-5 rounded-3xl border-0 flex flex-col justify-between ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Combined Net Worth</span>
                <div className={`p-2 rounded-xl ${style('neu-inset-dark text-emerald-400', 'neu-inset-light text-emerald-600')}`}>
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <h3 className={`text-2xl font-black mt-3 ${style('text-white', 'text-slate-800')}`}>
                {formatCurrency(householdData?.combined_net_worth || 0)}
              </h3>
              <span className="text-[11px] text-emerald-400 mt-1 font-semibold">Across all family accounts</span>
            </div>

            <div className={`p-5 rounded-3xl border-0 flex flex-col justify-between ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Shared Net Worth</span>
                <div className={`p-2 rounded-xl ${style('neu-inset-dark text-indigo-400', 'neu-inset-light text-indigo-600')}`}>
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <h3 className={`text-2xl font-black mt-3 ${style('text-white', 'text-slate-800')}`}>
                {formatCurrency(householdData?.shared_net_worth || 0)}
              </h3>
              <span className="text-[11px] text-indigo-400 mt-1 font-semibold">Excludes private accounts</span>
            </div>

            <div className={`p-5 rounded-3xl border-0 flex flex-col justify-between ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Assets</span>
                <div className={`p-2 rounded-xl ${style('neu-inset-dark text-emerald-400', 'neu-inset-light text-emerald-600')}`}>
                  <PiggyBank className="h-4 w-4" />
                </div>
              </div>
              <h3 className={`text-2xl font-black mt-3 text-emerald-500`}>
                {formatCurrency(householdData?.total_assets || 0)}
              </h3>
              <span className="text-[11px] text-slate-500 mt-1 font-medium">Bank + FDs + Investments</span>
            </div>

            <div className={`p-5 rounded-3xl border-0 flex flex-col justify-between ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Liabilities</span>
                <div className={`p-2 rounded-xl ${style('neu-inset-dark text-rose-400', 'neu-inset-light text-rose-600')}`}>
                  <Receipt className="h-4 w-4" />
                </div>
              </div>
              <h3 className={`text-2xl font-black mt-3 text-rose-500`}>
                {formatCurrency(householdData?.total_liabilities || 0)}
              </h3>
              <span className="text-[11px] text-slate-500 mt-1 font-medium">Loans + Credit Cards</span>
            </div>
          </div>

          {/* Family Members & Household Expenses */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Family Members Card */}
            <div className={`p-6 rounded-3xl border-0 flex flex-col gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-400" />
                  <h4 className={`text-base font-bold ${style('text-white', 'text-slate-800')}`}>Family Members</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddMember(true)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 border-0 cursor-pointer ${style('neu-btn-dark text-indigo-400', 'bg-indigo-600 text-white')}`}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Member
                </button>
              </div>

              <div className="flex flex-col gap-2.5 mt-1">
                {(!householdData?.members || householdData.members.length === 0) && (
                  <div className="text-center p-6 text-slate-400 text-xs italic">
                    No family members added. Click "+ Add Member" to set up your household.
                  </div>
                )}
                {householdData?.members?.map(m => (
                  <div key={m.id} className={`p-3.5 rounded-2xl flex items-center justify-between ${style('neu-inset-dark', 'neu-inset-light')}`}>
                    <div className="flex items-center gap-3">
                      <div 
                        className="h-9 w-9 rounded-full flex items-center justify-center text-white font-black text-xs shadow-md"
                        style={{ backgroundColor: m.avatar_color || '#6366F1' }}
                      >
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className={`text-sm font-bold ${style('text-white', 'text-slate-800')}`}>{m.name}</div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">{m.relationship}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteMember(m.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-xl transition-colors border-0 bg-transparent cursor-pointer"
                      title="Remove member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Indian Household Category Spending */}
            <div className={`lg:col-span-2 p-6 rounded-3xl border-0 flex flex-col gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <div className="flex items-center gap-2">
                <Home className="h-5 w-5 text-amber-400" />
                <h4 className={`text-base font-bold ${style('text-white', 'text-slate-800')}`}>Indian Household Monthly Expenses</h4>
              </div>
              <p className="text-xs text-slate-400">
                Track dedicated domestic help (Maid, Cook), utilities, society maintenance, groceries, and school fees.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-1">
                {householdData?.household_spending && Object.keys(householdData.household_spending).length > 0 ? (
                  Object.entries(householdData.household_spending).map(([cat, amt]) => (
                    <div key={cat} className={`p-4 rounded-2xl flex flex-col justify-between ${style('neu-inset-dark', 'neu-inset-light')}`}>
                      <span className="text-xs text-slate-400 font-semibold">{cat}</span>
                      <span className={`text-lg font-black mt-2 ${style('text-white', 'text-slate-800')}`}>
                        {formatCurrency(amt)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="col-span-3 text-center p-8 text-slate-400 text-xs italic">
                    Upload bank statements to automatically track and categorize Indian household expenses.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: 2. LOANS & AMORTIZATION */}
      {activeSubTab === 'loans' && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-lg font-bold ${style('text-white', 'text-slate-800')}`}>Active Loans & Mortgages</h3>
              <p className="text-xs text-slate-400">Reducing balance amortization schedules & prepayment interest calculator</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddLoan(true)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border-0 cursor-pointer ${style('neu-btn-dark text-indigo-400', 'bg-indigo-600 text-white')}`}
            >
              <Plus className="h-4 w-4" /> Add Loan
            </button>
          </div>

          {/* Loans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loans.length === 0 && (
              <div className="col-span-3 p-10 rounded-3xl text-center text-slate-400 text-sm italic border-0">
                No active loans registered. Click "+ Add Loan" to track home, car, or personal loans.
              </div>
            )}
            {loans.map(l => {
              const isSelected = selectedLoan?.id === l.id;
              return (
                <div
                  key={l.id}
                  onClick={() => setSelectedLoan(l)}
                  className={`p-5 rounded-3xl cursor-pointer transition-all border-0 flex flex-col justify-between gap-4 ${
                    isSelected
                      ? style('neu-flat-dark ring-2 ring-indigo-500', 'bg-indigo-50/50 ring-2 ring-indigo-500')
                      : style('neu-flat-dark', 'neu-flat-light')
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">{l.loan_type}</span>
                      <span className="text-xs text-slate-400 font-medium">{l.lender_name}</span>
                    </div>
                    <h4 className={`text-lg font-black mt-1 ${style('text-white', 'text-slate-800')}`}>{l.loan_name}</h4>
                  </div>

                  <div className="pt-3 border-t border-slate-700/30 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Outstanding</div>
                      <div className={`text-base font-black ${style('text-white', 'text-slate-800')}`}>
                        {formatCurrency(l.outstanding_balance)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Monthly EMI</div>
                      <div className="text-base font-black text-rose-400">{formatCurrency(l.emi_amount)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Loan Details: Prepayment Simulator & Amortization */}
          {selectedLoan && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
              {/* Prepayment Simulator */}
              <div className={`p-6 rounded-3xl border-0 flex flex-col gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-indigo-400" />
                  <h4 className={`text-base font-bold ${style('text-white', 'text-slate-800')}`}>Prepayment Simulator</h4>
                </div>
                <p className="text-xs text-slate-400">
                  Calculate the exact interest and tenure you save with prepayment.
                </p>

                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs text-slate-400 font-bold">Lump Sum Prepayment (₹)</label>
                    <input
                      type="number"
                      value={prepayLumpSum}
                      onChange={(e) => {
                        setPrepayLumpSum(e.target.value);
                        runPrepaySim(e.target.value, prepayExtraEmi);
                      }}
                      className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark text-white', 'neu-inset-light text-slate-800')}`}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-bold">Extra Monthly EMI (₹)</label>
                    <input
                      type="number"
                      value={prepayExtraEmi}
                      onChange={(e) => {
                        setPrepayExtraEmi(e.target.value);
                        runPrepaySim(prepayLumpSum, e.target.value);
                      }}
                      className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark text-white', 'neu-inset-light text-slate-800')}`}
                    />
                  </div>
                </div>

                {prepaymentSim && (
                  <div className="p-4 rounded-2xl flex flex-col gap-2 mt-2 bg-emerald-500/10 border border-emerald-500/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300 font-semibold">Total Interest Saved:</span>
                      <span className="text-base font-black text-emerald-400">
                        {formatCurrency(prepaymentSim.interest_saved)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300 font-semibold">Tenure Reduced By:</span>
                      <span className="text-sm font-bold text-white">
                        {prepaymentSim.months_saved} Months ({(prepaymentSim.months_saved / 12).toFixed(1)} yrs)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Amortization Schedule Table */}
              <div className={`lg:col-span-2 p-6 rounded-3xl border-0 flex flex-col gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-indigo-400" />
                    <h4 className={`text-base font-bold ${style('text-white', 'text-slate-800')}`}>
                      Amortization Schedule ({selectedLoan.loan_name})
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400 font-semibold">Rate: {selectedLoan.annual_interest_rate}% p.a.</span>
                </div>

                <div className="max-h-80 overflow-y-auto overflow-x-auto rounded-2xl custom-scrollbar">
                  <table className="w-full text-left text-xs">
                    <thead className={`sticky top-0 ${style('bg-[#1E1E2E] text-slate-400', 'bg-slate-100 text-slate-600')}`}>
                      <tr>
                        <th className="p-3">Period</th>
                        <th className="p-3">EMI</th>
                        <th className="p-3">Principal</th>
                        <th className="p-3">Interest</th>
                        <th className="p-3">Ending Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/20">
                      {amortization?.schedule?.map(row => (
                        <tr key={row.month_index} className="hover:bg-slate-500/5">
                          <td className="p-3 font-medium">{row.period}</td>
                          <td className="p-3 font-bold">{formatCurrency(row.emi)}</td>
                          <td className="p-3 text-emerald-400 font-semibold">{formatCurrency(row.principal)}</td>
                          <td className="p-3 text-rose-400 font-semibold">{formatCurrency(row.interest)}</td>
                          <td className="p-3 font-bold">{formatCurrency(row.ending_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB: 3. GOALS & EMERGENCY FUND */}
      {activeSubTab === 'goals' && (
        <div className="flex flex-col gap-6">
          {/* Emergency Fund Health Widget */}
          {emergencyFund && (
            <div className={`p-6 rounded-3xl border-0 flex flex-col md:flex-row items-center justify-between gap-6 ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <div className="flex items-center gap-4">
                <div 
                  className="p-4 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: `${emergencyFund.status_color}20`, color: emergencyFund.status_color }}
                >
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className={`text-xl font-black ${style('text-white', 'text-slate-800')}`}>Emergency Reserve Health</h3>
                    <span 
                      className="px-2.5 py-0.5 rounded-full text-xs font-black text-white"
                      style={{ backgroundColor: emergencyFund.status_color }}
                    >
                      {emergencyFund.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Coverage: <strong className="text-white">{emergencyFund.coverage_months} Months</strong> of essential burn ({formatCurrency(emergencyFund.total_monthly_burn)}/mo)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 text-right flex-wrap justify-end">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Current Liquid Reserve</div>
                  <div className="text-lg font-black text-emerald-400">{formatCurrency(emergencyFund.liquid_reserves)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Recommended 6-Mo Buffer</div>
                  <div className="text-lg font-black text-indigo-400">{formatCurrency(emergencyFund.recommended_buffer_6m)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Financial Goals Header & List */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-lg font-bold ${style('text-white', 'text-slate-800')}`}>Financial Goals</h3>
              <p className="text-xs text-slate-400">Target milestones for vacation, car, home purchase, and retirement</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddGoal(true)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border-0 cursor-pointer ${style('neu-btn-dark text-indigo-400', 'bg-indigo-600 text-white')}`}
            >
              <Plus className="h-4 w-4" /> Add Goal
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {goals.length === 0 && (
              <div className="col-span-3 p-10 rounded-3xl text-center text-slate-400 text-sm italic">
                No financial goals set. Click "+ Add Goal" to target vacation, car, wedding, or retirement funds.
              </div>
            )}
            {goals.map(g => (
              <div key={g.id} className={`p-5 rounded-3xl border-0 flex flex-col justify-between gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">{g.category}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      g.priority === 'HIGH' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-500/20 text-slate-400'
                    }`}>
                      {g.priority}
                    </span>
                  </div>
                  <h4 className={`text-base font-bold mt-1 ${style('text-white', 'text-slate-800')}`}>{g.name}</h4>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400 font-medium">Progress</span>
                    <span className="font-bold text-indigo-400">{g.progress_percentage}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-700/30 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-indigo-500 transition-all duration-500" 
                      style={{ width: `${Math.min(100, g.progress_percentage)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-700/30 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Saved / Target</div>
                    <div className="font-bold">{formatCurrency(g.current_amount)} / {formatCurrency(g.target_amount)}</div>
                  </div>
                  {g.estimated_months_left && (
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Est. Completion</div>
                      <div className="font-bold text-emerald-400">{g.estimated_months_left} Months</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB: 4. SPLIT BILLS */}
      {activeSubTab === 'splits' && (
        <div className="flex flex-col gap-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className={`p-5 rounded-3xl border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Owed to You</span>
              <h3 className="text-2xl font-black text-emerald-400 mt-2">
                {formatCurrency(splitsData.summary?.total_owed_to_you || 0)}
              </h3>
            </div>

            <div className={`p-5 rounded-3xl border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total You Owe</span>
              <h3 className="text-2xl font-black text-rose-400 mt-2">
                {formatCurrency(splitsData.summary?.total_you_owe || 0)}
              </h3>
            </div>

            <div className={`p-5 rounded-3xl border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Net Balance</span>
              <h3 className={`text-2xl font-black mt-2 ${
                (splitsData.summary?.net_balance || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {formatCurrency(splitsData.summary?.net_balance || 0)}
              </h3>
            </div>
          </div>

          {/* People Balances & Split Expense List */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`p-6 rounded-3xl border-0 flex flex-col gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <h4 className={`text-base font-bold ${style('text-white', 'text-slate-800')}`}>Friends & Balances</h4>
              <div className="flex flex-col gap-2">
                {(!splitsData.summary?.person_balances || splitsData.summary.person_balances.length === 0) && (
                  <p className="text-xs text-slate-400 italic text-center p-6">All split expenses settled!</p>
                )}
                {splitsData.summary?.person_balances?.map(p => (
                  <div key={p.person} className={`p-3.5 rounded-2xl flex items-center justify-between ${style('neu-inset-dark', 'neu-inset-light')}`}>
                    <span className="text-sm font-bold">{p.person}</span>
                    <span className={`text-xs font-black ${p.net_amount > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {p.net_amount > 0 ? `+${formatCurrency(p.net_amount)}` : formatCurrency(p.net_amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`lg:col-span-2 p-6 rounded-3xl border-0 flex flex-col gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <div className="flex items-center justify-between">
                <h4 className={`text-base font-bold ${style('text-white', 'text-slate-800')}`}>Split Expenses</h4>
                <button
                  type="button"
                  onClick={() => setShowAddSplit(true)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 border-0 cursor-pointer ${style('neu-btn-dark text-indigo-400', 'bg-indigo-600 text-white')}`}
                >
                  <Plus className="h-3.5 w-3.5" /> Split a Bill
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {(!splitsData.expenses || splitsData.expenses.length === 0) && (
                  <p className="text-xs text-slate-400 italic text-center p-6">No split bills recorded.</p>
                )}
                {splitsData.expenses?.map(exp => (
                  <div key={exp.id} className={`p-4 rounded-2xl flex flex-col gap-2 ${style('neu-inset-dark', 'neu-inset-light')}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-bold">{exp.title}</span>
                        <span className="text-xs text-slate-400 ml-2 font-medium">({formatDate(exp.expense_date)})</span>
                      </div>
                      <span className="text-sm font-black">{formatCurrency(exp.total_amount)}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700/20">
                      {exp.participants?.map(p => (
                        <div key={p.id} className="flex items-center gap-1.5 text-xs bg-slate-700/20 px-2.5 py-1 rounded-lg">
                          <span>{p.name}: <strong>{formatCurrency(p.share_amount)}</strong></span>
                          {p.is_settled ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSettleParticipant(p.id)}
                              className="text-[10px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded cursor-pointer border-0 hover:bg-indigo-500/50"
                            >
                              Settle
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: 5. INSURANCE VAULT */}
      {activeSubTab === 'insurance' && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={`p-5 rounded-3xl border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Sum Insured</span>
              <h3 className="text-2xl font-black text-indigo-400 mt-2">
                {formatCurrency(insuranceData.total_coverage || 0)}
              </h3>
            </div>
            <div className={`p-5 rounded-3xl border-0 ${style('neu-flat-dark', 'neu-flat-light')}`}>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Annual Premium</span>
              <h3 className="text-2xl font-black text-rose-400 mt-2">
                {formatCurrency(insuranceData.total_annual_premium || 0)}
              </h3>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-lg font-bold ${style('text-white', 'text-slate-800')}`}>Policies & Upcoming Renewals</h3>
              <p className="text-xs text-slate-400">Health, Life, Term, and Vehicle insurance policies</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddInsurance(true)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border-0 cursor-pointer ${style('neu-btn-dark text-indigo-400', 'bg-indigo-600 text-white')}`}
            >
              <Plus className="h-4 w-4" /> Add Policy
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(!insuranceData.policies || insuranceData.policies.length === 0) && (
              <div className="col-span-3 p-10 rounded-3xl text-center text-slate-400 text-sm italic">
                No insurance policies registered. Click "+ Add Policy" to track Health, Term, Life, and Vehicle coverage.
              </div>
            )}
            {insuranceData.policies?.map(p => (
              <div key={p.id} className={`p-5 rounded-3xl border-0 flex flex-col justify-between gap-4 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-indigo-400 tracking-wider">{p.policy_type}</span>
                    <span className="text-xs text-slate-400 font-medium">{p.insurer_name}</span>
                  </div>
                  <h4 className={`text-base font-bold mt-1 ${style('text-white', 'text-slate-800')}`}>{p.policy_name}</h4>
                  {p.policy_number && (
                    <div className="text-[11px] text-slate-400 mt-0.5 font-medium">Policy #{p.policy_number}</div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-700/30 flex items-center justify-between text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Sum Insured</div>
                    <div className="font-black text-emerald-400">{formatCurrency(p.sum_insured)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Renewal Date</div>
                    <div className="font-bold text-amber-400">{formatDate(p.renewal_date)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB: 6. TRIPS & VEHICLES */}
      {activeSubTab === 'travel_vehicles' && (
        <div className="flex flex-col gap-6">
          {/* Vehicles Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Car className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className={`text-lg font-bold ${style('text-white', 'text-slate-800')}`}>Vehicles & Fuel/FASTag Intelligence</h3>
                  <p className="text-xs text-slate-400">Ownership cost, fuel efficiency, and running expenses</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddVehicle(true)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1 border-0 cursor-pointer ${style('neu-btn-dark text-indigo-400', 'bg-indigo-600 text-white')}`}
              >
                <Plus className="h-3.5 w-3.5" /> Add Vehicle
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {vehicles.length === 0 && (
                <div className="col-span-2 p-8 rounded-3xl text-center text-slate-400 text-xs italic">
                  No vehicles tracked yet. Click "+ Add Vehicle" to log fuel, FASTag, and maintenance.
                </div>
              )}
              {vehicles.map(v => (
                <div key={v.vehicle_id} className={`p-5 rounded-3xl border-0 flex flex-col justify-between gap-3 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-base font-bold ${style('text-white', 'text-slate-800')}`}>{v.vehicle_name}</h4>
                      <span className="text-xs text-slate-400 font-medium">{v.registration_number || v.fuel_type}</span>
                    </div>
                    {v.cost_per_km && (
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-bold">Cost / KM</span>
                        <div className="text-sm font-black text-indigo-400">{formatCurrency(v.cost_per_km)}/km</div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-700/30 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400">Total Spend: </span>
                      <strong className="text-white">{formatCurrency(v.total_spend)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Fuel: </span>
                      <strong>{v.total_fuel_liters} L</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Travel Trips Section */}
          <div className="mt-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Plane className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className={`text-lg font-bold ${style('text-white', 'text-slate-800')}`}>Travel Trips & Vacations</h3>
                  <p className="text-xs text-slate-400">Group vacation spends by flights, hotels, and dining</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTrip(true)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1 border-0 cursor-pointer ${style('neu-btn-dark text-indigo-400', 'bg-indigo-600 text-white')}`}
              >
                <Plus className="h-3.5 w-3.5" /> Add Trip
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trips.length === 0 && (
                <div className="col-span-2 p-8 rounded-3xl text-center text-slate-400 text-xs italic">
                  No travel trips tracked yet. Click "+ Add Trip" to organize vacation expenses.
                </div>
              )}
              {trips.map(t => (
                <div key={t.trip_id} className={`p-5 rounded-3xl border-0 flex flex-col justify-between gap-3 ${style('neu-flat-dark', 'neu-flat-light')}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-base font-bold ${style('text-white', 'text-slate-800')}`}>{t.trip_name}</h4>
                      <span className="text-xs text-slate-400 font-medium">{t.destination} ({formatDate(t.start_date)})</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Total Spent</span>
                      <div className="text-base font-black text-emerald-400">{formatCurrency(t.total_spend)}</div>
                    </div>
                  </div>

                  {t.budget && (
                    <div className="pt-2 border-t border-slate-700/30 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Budget: {formatCurrency(t.budget)}</span>
                      <span className="font-bold text-indigo-400">{t.budget_percentage_used}% used</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- MODALS --- */}
      {/* Add Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-6 rounded-3xl shadow-2xl ${style('bg-[#1E1E2E] text-white', 'bg-white text-slate-800')}`}>
            <h3 className="text-lg font-bold mb-4">Add Family Member</h3>
            <form onSubmit={handleAddMember} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-400">Name</label>
                <input
                  type="text"
                  required
                  value={newMember.name}
                  onChange={e => setNewMember({ ...newMember, name: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="e.g. Priya"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Relationship</label>
                <select
                  value={newMember.relationship}
                  onChange={e => setNewMember({ ...newMember, relationship: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark text-white', 'neu-inset-light text-slate-800')}`}
                >
                  <option value="SPOUSE">Spouse</option>
                  <option value="PARENT">Parent</option>
                  <option value="CHILD">Child</option>
                  <option value="SELF">Self</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setShowAddMember(false)} className="px-4 py-2 text-xs font-bold rounded-xl border-0 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white border-0 cursor-pointer">Save Member</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Loan Modal */}
      {showAddLoan && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-lg p-6 rounded-3xl shadow-2xl ${style('bg-[#1E1E2E] text-white', 'bg-white text-slate-800')}`}>
            <h3 className="text-lg font-bold mb-4">Add Loan</h3>
            <form onSubmit={handleAddLoan} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-bold text-slate-400">Loan Name</label>
                <input
                  type="text"
                  required
                  value={newLoan.loan_name}
                  onChange={e => setNewLoan({ ...newLoan, loan_name: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="e.g. HDFC Home Loan"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Lender Bank</label>
                <input
                  type="text"
                  required
                  value={newLoan.lender_name}
                  onChange={e => setNewLoan({ ...newLoan, lender_name: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="e.g. HDFC Bank"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Loan Type</label>
                <select
                  value={newLoan.loan_type}
                  onChange={e => setNewLoan({ ...newLoan, loan_type: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark text-white', 'neu-inset-light text-slate-800')}`}
                >
                  <option value="HOME_LOAN">Home Loan</option>
                  <option value="CAR_LOAN">Car Loan</option>
                  <option value="PERSONAL_LOAN">Personal Loan</option>
                  <option value="EDUCATION_LOAN">Education Loan</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Principal Amount (₹)</label>
                <input
                  type="number"
                  required
                  value={newLoan.principal_amount}
                  onChange={e => setNewLoan({ ...newLoan, principal_amount: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="3000000"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Interest Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newLoan.annual_interest_rate}
                  onChange={e => setNewLoan({ ...newLoan, annual_interest_rate: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="8.5"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Tenure (Months)</label>
                <input
                  type="number"
                  required
                  value={newLoan.tenure_months}
                  onChange={e => setNewLoan({ ...newLoan, tenure_months: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="240"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Start Date</label>
                <input
                  type="date"
                  required
                  value={newLoan.start_date}
                  onChange={e => setNewLoan({ ...newLoan, start_date: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                />
              </div>
              <div className="col-span-2 flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setShowAddLoan(false)} className="px-4 py-2 text-xs font-bold rounded-xl border-0 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white border-0 cursor-pointer">Save Loan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Goal Modal */}
      {showAddGoal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-6 rounded-3xl shadow-2xl ${style('bg-[#1E1E2E] text-white', 'bg-white text-slate-800')}`}>
            <h3 className="text-lg font-bold mb-4">Add Financial Goal</h3>
            <form onSubmit={handleAddGoal} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-400">Goal Name</label>
                <input
                  type="text"
                  required
                  value={newGoal.name}
                  onChange={e => setNewGoal({ ...newGoal, name: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="e.g. Goa Trip Fund"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Category</label>
                <select
                  value={newGoal.category}
                  onChange={e => setNewGoal({ ...newGoal, category: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark text-white', 'neu-inset-light text-slate-800')}`}
                >
                  <option value="EMERGENCY_FUND">Emergency Fund</option>
                  <option value="VACATION">Vacation</option>
                  <option value="CAR">Car</option>
                  <option value="HOUSE">House</option>
                  <option value="EDUCATION">Education</option>
                  <option value="RETIREMENT">Retirement</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Target Amount (₹)</label>
                <input
                  type="number"
                  required
                  value={newGoal.target_amount}
                  onChange={e => setNewGoal({ ...newGoal, target_amount: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="150000"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Monthly Contribution (₹)</label>
                <input
                  type="number"
                  value={newGoal.monthly_contribution}
                  onChange={e => setNewGoal({ ...newGoal, monthly_contribution: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="15000"
                />
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setShowAddGoal(false)} className="px-4 py-2 text-xs font-bold rounded-xl border-0 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white border-0 cursor-pointer">Save Goal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Split Modal */}
      {showAddSplit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-6 rounded-3xl shadow-2xl ${style('bg-[#1E1E2E] text-white', 'bg-white text-slate-800')}`}>
            <h3 className="text-lg font-bold mb-4">Split a Bill</h3>
            <form onSubmit={handleAddSplit} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-400">Expense Title</label>
                <input
                  type="text"
                  required
                  value={newSplit.title}
                  onChange={e => setNewSplit({ ...newSplit, title: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="e.g. Dinner with Friends"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Total Amount (₹)</label>
                <input
                  type="number"
                  required
                  value={newSplit.total_amount}
                  onChange={e => setNewSplit({ ...newSplit, total_amount: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="4000"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Split With (Comma-separated names)</label>
                <input
                  type="text"
                  required
                  value={newSplit.participantsStr}
                  onChange={e => setNewSplit({ ...newSplit, participantsStr: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="Rahul, Amit, Priya"
                />
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setShowAddSplit(false)} className="px-4 py-2 text-xs font-bold rounded-xl border-0 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white border-0 cursor-pointer">Create Split</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Insurance Modal */}
      {showAddInsurance && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-6 rounded-3xl shadow-2xl ${style('bg-[#1E1E2E] text-white', 'bg-white text-slate-800')}`}>
            <h3 className="text-lg font-bold mb-4">Add Insurance Policy</h3>
            <form onSubmit={handleAddInsurance} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-400">Policy Name</label>
                <input
                  type="text"
                  required
                  value={newInsurance.policy_name}
                  onChange={e => setNewInsurance({ ...newInsurance, policy_name: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="e.g. HDFC ERGO Optima Secure"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400">Type</label>
                  <select
                    value={newInsurance.policy_type}
                    onChange={e => setNewInsurance({ ...newInsurance, policy_type: e.target.value })}
                    className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark text-white', 'neu-inset-light text-slate-800')}`}
                  >
                    <option value="HEALTH">Health</option>
                    <option value="TERM">Term Life</option>
                    <option value="LIFE">Life</option>
                    <option value="VEHICLE">Vehicle</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400">Insurer</label>
                  <input
                    type="text"
                    required
                    value={newInsurance.insurer_name}
                    onChange={e => setNewInsurance({ ...newInsurance, insurer_name: e.target.value })}
                    className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                    placeholder="e.g. HDFC ERGO"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400">Sum Insured (₹)</label>
                  <input
                    type="number"
                    required
                    value={newInsurance.sum_insured}
                    onChange={e => setNewInsurance({ ...newInsurance, sum_insured: e.target.value })}
                    className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                    placeholder="1000000"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400">Annual Premium (₹)</label>
                  <input
                    type="number"
                    required
                    value={newInsurance.premium_amount}
                    onChange={e => setNewInsurance({ ...newInsurance, premium_amount: e.target.value })}
                    className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                    placeholder="18500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Renewal Date</label>
                <input
                  type="date"
                  required
                  value={newInsurance.renewal_date}
                  onChange={e => setNewInsurance({ ...newInsurance, renewal_date: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                />
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setShowAddInsurance(false)} className="px-4 py-2 text-xs font-bold rounded-xl border-0 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white border-0 cursor-pointer">Save Policy</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showAddVehicle && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-6 rounded-3xl shadow-2xl ${style('bg-[#1E1E2E] text-white', 'bg-white text-slate-800')}`}>
            <h3 className="text-lg font-bold mb-4">Add Vehicle</h3>
            <form onSubmit={handleAddVehicle} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-400">Vehicle Name / Model</label>
                <input
                  type="text"
                  required
                  value={newVehicle.vehicle_name}
                  onChange={e => setNewVehicle({ ...newVehicle, vehicle_name: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="e.g. Hyundai Creta"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400">Type</label>
                  <select
                    value={newVehicle.vehicle_type}
                    onChange={e => setNewVehicle({ ...newVehicle, vehicle_type: e.target.value })}
                    className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark text-white', 'neu-inset-light text-slate-800')}`}
                  >
                    <option value="CAR">Car</option>
                    <option value="MOTORCYCLE">Motorcycle</option>
                    <option value="SCOOTER">Scooter</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400">Fuel Type</label>
                  <select
                    value={newVehicle.fuel_type}
                    onChange={e => setNewVehicle({ ...newVehicle, fuel_type: e.target.value })}
                    className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark text-white', 'neu-inset-light text-slate-800')}`}
                  >
                    <option value="PETROL">Petrol</option>
                    <option value="DIESEL">Diesel</option>
                    <option value="CNG">CNG</option>
                    <option value="ELECTRIC">Electric</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Registration Number</label>
                <input
                  type="text"
                  value={newVehicle.registration_number}
                  onChange={e => setNewVehicle({ ...newVehicle, registration_number: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="MH12 AB 1234"
                />
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setShowAddVehicle(false)} className="px-4 py-2 text-xs font-bold rounded-xl border-0 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white border-0 cursor-pointer">Save Vehicle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Trip Modal */}
      {showAddTrip && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-6 rounded-3xl shadow-2xl ${style('bg-[#1E1E2E] text-white', 'bg-white text-slate-800')}`}>
            <h3 className="text-lg font-bold mb-4">Add Travel Trip</h3>
            <form onSubmit={handleAddTrip} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-400">Trip Name</label>
                <input
                  type="text"
                  required
                  value={newTrip.trip_name}
                  onChange={e => setNewTrip({ ...newTrip, trip_name: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="e.g. Goa Vacation 2026"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Destination</label>
                <input
                  type="text"
                  required
                  value={newTrip.destination}
                  onChange={e => setNewTrip({ ...newTrip, destination: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="Goa, India"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">Budget (₹)</label>
                <input
                  type="number"
                  value={newTrip.budget}
                  onChange={e => setNewTrip({ ...newTrip, budget: e.target.value })}
                  className={`w-full p-2.5 rounded-xl mt-1 text-sm ${style('neu-inset-dark', 'neu-inset-light')}`}
                  placeholder="50000"
                />
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setShowAddTrip(false)} className="px-4 py-2 text-xs font-bold rounded-xl border-0 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white border-0 cursor-pointer">Save Trip</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
