import React, { useState, useEffect } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/organisms/Navbar';
import { DashboardView } from './components/views/DashboardView';
import { FinancialCalendarView } from './components/views/FinancialCalendarView';
import { CardPortfolioView } from './components/views/CardPortfolioView';
import { TransactionLedgerView } from './components/views/TransactionLedgerView';
import { BankAccountsView } from './components/views/BankAccountsView';
import { AiAssistantView } from './components/views/AiAssistantView';
import { SettingsView } from './components/views/SettingsView';
import { UploadStatementModal } from './components/organisms/UploadStatementModal';
import { UploadSnackbar } from './components/molecules/UploadSnackbar';

import { PayslipsView } from './components/views/PayslipsView';
import { AnalyticsView } from './components/views/AnalyticsView';
import { LoginView } from './components/views/LoginView';
import { RegisterView } from './components/views/RegisterView';
import { DevToolsView } from './components/views/DevToolsView';
import { HouseholdOSView } from './components/views/HouseholdOSView';
import { ReviewCenterView } from './components/views/ReviewCenterView';
import { FinancialHealthView } from './components/views/FinancialHealthView';
import { ErrorBoundary } from './components/atoms/ErrorBoundary';

const MainLayout = () => {
  const { theme } = useTheme();
  const { loading, accounts, ledgerFocus, token } = useFinance();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  useEffect(() => {
    if (!loading) setIsInitialLoad(false);
  }, [loading]);
  
  const isBootstrapping = loading && isInitialLoad;
  useEffect(() => {
    if (ledgerFocus?.ts) setActiveTab('transactions');
  }, [ledgerFocus?.ts]);

  const handleSelectCardFromDashboard = (cardId) => {
    setSelectedCardId(cardId);
    setActiveTab('cards');
  };

  if (!token) {
    return (
      <div className={`min-h-screen font-sans transition-colors duration-300 ${
        theme === 'dark' 
          ? 'bg-[#0E1117] text-[#F4F7FA]' 
          : 'bg-[#F4F7F9] text-[#17202A]'
      }`}>
        {authMode === 'login' 
          ? <LoginView onNavigateRegister={() => setAuthMode('register')} />
          : <RegisterView onNavigateLogin={() => setAuthMode('login')} />
        }
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${
      theme === 'dark' 
        ? 'bg-[#0E1117] text-[#F4F7FA]' 
        : 'bg-[#F4F7F9] text-[#17202A]'
    }`}>
      {/* Top Navigation */}
      <Navbar 
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenUploadModal={() => setShowUploadModal(true)}
      />

      {/* Main Content Viewport */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6">
        {isBootstrapping && (
          <div className="mb-4 text-xs text-slate-400 font-medium tracking-wide">
            Loading your accounts and ledger…
          </div>
        )}
        {activeTab === 'dashboard' && (
          <DashboardView 
            onSelectCard={handleSelectCardFromDashboard}
            onNavigateCalendar={() => setActiveTab('calendar')}
          />
        )}
        {activeTab === 'calendar' && (
          <FinancialCalendarView />
        )}
        {activeTab === 'accounts' && (
          <BankAccountsView />
        )}
        {activeTab === 'health' && (
          <FinancialHealthView />
        )}
        {activeTab === 'review' && (
          <ReviewCenterView />
        )}
        {activeTab === 'household' && (
          <HouseholdOSView />
        )}
        {activeTab === 'payslips' && (
          <PayslipsView />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsView />
        )}
        {activeTab === 'transactions' && (
          <TransactionLedgerView />
        )}
        {activeTab === 'cards' && (
          <CardPortfolioView initialCardId={selectedCardId} />
        )}
        {activeTab === 'ai-assistant' && (
          <AiAssistantView />
        )}
        {activeTab === 'settings' && (
          <SettingsView />
        )}
        {activeTab === 'dev-tools' && (
          <DevToolsView />
        )}
      </main>

      {/* Non-Blocking Upload Modal */}
      <UploadStatementModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
      />

      {/* Floating Bottom-Right Background Processing Snackbar */}
      <UploadSnackbar />
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
