import React, { useState, useEffect, Suspense, lazy } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { ToastProvider } from './context/ToastContext';

// Shell & Navigation Organisms
import { Sidebar } from './components/organisms/Sidebar';
import { TopBar } from './components/organisms/TopBar';
import { MobileBottomNav } from './components/organisms/MobileBottomNav';
import { UploadStatementModal } from './components/organisms/UploadStatementModal';
import { UploadSnackbar } from './components/molecules/UploadSnackbar';
import { TransactionDetailDrawer } from './components/organisms/TransactionDetailDrawer';
import { GlobalSearchModal } from './components/organisms/GlobalSearchModal';
import { AddAccountModal } from './components/organisms/AddAccountModal';
import { AddCardModal } from './components/organisms/AddCardModal';
import { EditCardModal } from './components/organisms/EditCardModal';
import { ErrorBoundary } from './components/atoms/ErrorBoundary';
import { ViewSkeleton } from './components/atoms/ViewSkeleton';

// Code-Split Dynamic Lazy Loading for all 19 Workspaces
const DashboardView = lazy(() => import('./components/views/DashboardView').then(m => ({ default: m.DashboardView })));
const TransactionLedgerView = lazy(() => import('./components/views/TransactionLedgerView').then(m => ({ default: m.TransactionLedgerView })));
const BankAccountsView = lazy(() => import('./components/views/BankAccountsView').then(m => ({ default: m.BankAccountsView })));
const CardPortfolioView = lazy(() => import('./components/views/CardPortfolioView').then(m => ({ default: m.CardPortfolioView })));
const CashFlowView = lazy(() => import('./components/views/CashFlowView').then(m => ({ default: m.CashFlowView })));
const FinancialHealthView = lazy(() => import('./components/views/FinancialHealthView').then(m => ({ default: m.FinancialHealthView })));
const InsightsView = lazy(() => import('./components/views/InsightsView').then(m => ({ default: m.InsightsView })));
const FinancialCalendarView = lazy(() => import('./components/views/FinancialCalendarView').then(m => ({ default: m.FinancialCalendarView })));
const AiAssistantView = lazy(() => import('./components/views/AiAssistantView').then(m => ({ default: m.AiAssistantView })));
const DocumentsView = lazy(() => import('./components/views/DocumentsView').then(m => ({ default: m.DocumentsView })));
const ReviewCenterView = lazy(() => import('./components/views/ReviewCenterView').then(m => ({ default: m.ReviewCenterView })));
const ReportsView = lazy(() => import('./components/views/ReportsView').then(m => ({ default: m.ReportsView })));
const SettingsView = lazy(() => import('./components/views/SettingsView').then(m => ({ default: m.SettingsView })));
const BackupRecoveryView = lazy(() => import('./components/views/BackupRecoveryView').then(m => ({ default: m.BackupRecoveryView })));
const TruthInspectorView = lazy(() => import('./components/views/TruthInspectorView').then(m => ({ default: m.TruthInspectorView })));
const PayslipsView = lazy(() => import('./components/views/PayslipsView').then(m => ({ default: m.PayslipsView })));
const HouseholdOSView = lazy(() => import('./components/views/HouseholdOSView').then(m => ({ default: m.HouseholdOSView })));

// Auth Views (Lazy loaded)
const LoginView = lazy(() => import('./components/views/LoginView').then(m => ({ default: m.LoginView })));
const RegisterView = lazy(() => import('./components/views/RegisterView').then(m => ({ default: m.RegisterView })));

const MainLayout = () => {
  const { theme } = useTheme();
  const { loading, token, ledgerFocus, openInLedger } = useFinance();
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Modals state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [cardToEdit, setCardToEdit] = useState(null);
  const [selectedTxForDrawer, setSelectedTxForDrawer] = useState(null);

  // Period filter state
  const [selectedPeriod, setSelectedPeriod] = useState('August 2026');

  const [authMode, setAuthMode] = useState('login');
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (!loading) setIsInitialLoad(false);
  }, [loading]);

  // Sync ledger focus from deep links
  useEffect(() => {
    if (ledgerFocus?.ts) {
      setActiveTab('transactions');
    }
  }, [ledgerFocus?.ts]);

  // Global Keyboard shortcut listener for ⌘K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearchModal(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!token) {
    return (
      <div className={`min-h-screen font-sans ${
        theme === 'dark' ? 'bg-[#111713] text-[#F1F5F2]' : 'bg-[#F7F8F5] text-[#1D2822]'
      }`}>
        <Suspense fallback={<ViewSkeleton />}>
          {authMode === 'login' ? (
            <LoginView onNavigateRegister={() => setAuthMode('register')} />
          ) : (
            <RegisterView onNavigateLogin={() => setAuthMode('login')} />
          )}
        </Suspense>
      </div>
    );
  }

  return (
    <div className={`h-screen flex font-sans overflow-hidden ${
      theme === 'dark' ? 'bg-[#111713] text-[#F1F5F2]' : 'bg-[#F7F8F5] text-[#1D2822]'
    }`}>
      {/* 1. Desktop Persistent Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        className="hidden md:flex"
      />

      {/* 2. Main Workspace Viewport */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar
          activeTab={activeTab}
          onOpenUploadModal={() => setShowUploadModal(true)}
          onOpenSearch={() => setShowSearchModal(true)}
          selectedPeriod={selectedPeriod}
          onPeriodChange={(p) => setSelectedPeriod(p)}
        />

        <div className="flex-1 overflow-y-auto">
          <main className="w-full max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-12">
            {loading && isInitialLoad && (
              <div className="mb-4 text-xs text-[#8B978F] font-medium tracking-wide">
                Loading financial accounts and statement ledger…
              </div>
            )}

            <Suspense fallback={<ViewSkeleton />}>
              {/* Page 01: Dashboard */}
              {activeTab === 'dashboard' && (
                <DashboardView
                  onSelectTransaction={(tx) => setSelectedTxForDrawer(tx)}
                  onNavigateTransactions={() => setActiveTab('transactions')}
                  onNavigateCashFlow={() => setActiveTab('cashflow')}
                  onNavigateInsights={() => setActiveTab('insights')}
                  selectedPeriod={selectedPeriod}
                />
              )}

              {/* Page 02: Transactions */}
              {activeTab === 'transactions' && (
                <TransactionLedgerView
                  onOpenUploadModal={() => setShowUploadModal(true)}
                  onViewSource={() => setActiveTab('documents')}
                />
              )}

              {/* Page 03: Accounts */}
              {activeTab === 'accounts' && (
                <BankAccountsView
                  onOpenAddAccount={() => setShowAddAccountModal(true)}
                  onNavigateLedger={() => setActiveTab('transactions')}
                />
              )}

              {/* Page 04: Credit Cards */}
              {activeTab === 'cards' && (
                <CardPortfolioView
                  onOpenAddCard={() => setShowAddCardModal(true)}
                  onOpenEditCard={(card) => setCardToEdit(card)}
                  onNavigateLedger={() => setActiveTab('transactions')}
                />
              )}

              {/* Page 05: Cash Flow */}
              {activeTab === 'cashflow' && (
                <CashFlowView />
              )}

              {/* Page 06: Financial Health */}
              {activeTab === 'health' && (
                <FinancialHealthView />
              )}

              {/* Page 07: Insights */}
              {activeTab === 'insights' && (
                <InsightsView
                  onOpenTransactionsWithFilter={(filter) => {
                    openInLedger(filter);
                    setActiveTab('transactions');
                  }}
                />
              )}

              {/* Page 08: Financial Calendar */}
              {activeTab === 'calendar' && (
                <FinancialCalendarView />
              )}

              {/* Page 09: Financial Copilot */}
              {(activeTab === 'copilot' || activeTab === 'ai-assistant') && (
                <AiAssistantView />
              )}

              {/* Page 10: Documents */}
              {activeTab === 'documents' && (
                <DocumentsView
                  onOpenUploadModal={() => setShowUploadModal(true)}
                  onNavigateLedger={() => setActiveTab('transactions')}
                />
              )}

              {/* Page 11: Needs Review */}
              {activeTab === 'review' && (
                <ReviewCenterView />
              )}

              {/* Page 12: Reports */}
              {(activeTab === 'reports' || activeTab === 'analytics') && (
                <ReportsView />
              )}

              {/* Payslips & Salary Analysis */}
              {activeTab === 'payslips' && (
                <PayslipsView />
              )}

              {/* Household OS (Family, Loans, Goals, Splits, Vehicles, Trips) */}
              {activeTab === 'household' && (
                <HouseholdOSView />
              )}

              {/* Page 13: Settings */}
              {activeTab === 'settings' && (
                <SettingsView />
              )}

              {/* Page 14: Backup & Recovery */}
              {activeTab === 'backup' && (
                <BackupRecoveryView />
              )}

              {/* Page 15: Financial Truth Inspector */}
              {(activeTab === 'truth-inspector' || activeTab === 'dev-tools') && (
                <TruthInspectorView />
              )}
            </Suspense>
          </main>
        </div>
      </div>

      {/* 3. Mobile 5-Tab Bottom Navigation */}
      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* 4. Global Modals */}
      <UploadStatementModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
      />

      <UploadSnackbar />

      <GlobalSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onNavigate={(tab) => setActiveTab(tab)}
        onSelectTransaction={(tx) => setSelectedTxForDrawer(tx)}
      />

      <AddAccountModal
        isOpen={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
      />

      <AddCardModal
        isOpen={showAddCardModal}
        onClose={() => setShowAddCardModal(false)}
      />

      <EditCardModal
        card={cardToEdit}
        isOpen={!!cardToEdit}
        onClose={() => setCardToEdit(null)}
      />

      {/* Slide-over Transaction Detail Drawer */}
      <TransactionDetailDrawer
        transaction={selectedTxForDrawer}
        isOpen={!!selectedTxForDrawer}
        onClose={() => setSelectedTxForDrawer(null)}
        onViewSource={() => {
          setSelectedTxForDrawer(null);
          setActiveTab('documents');
        }}
      />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <FinanceProvider>
            <MainLayout />
          </FinanceProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
