import React, { useState } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { FinanceProvider } from './context/FinanceContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/organisms/Navbar';
import { DashboardView } from './components/views/DashboardView';
import { CardPortfolioView } from './components/views/CardPortfolioView';
import { TransactionLedgerView } from './components/views/TransactionLedgerView';
import { BankAccountsView } from './components/views/BankAccountsView';
import { AiAssistantView } from './components/views/AiAssistantView';
import { SettingsView } from './components/views/SettingsView';
import { UploadStatementModal } from './components/organisms/UploadStatementModal';
import { UploadSnackbar } from './components/molecules/UploadSnackbar';

import { AnalyticsView } from './components/views/AnalyticsView';

const MainLayout = () => {
  const { theme, style } = useTheme();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const handleSelectCardFromDashboard = (cardId) => {
    setSelectedCardId(cardId);
    setActiveTab('cards');
  };

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${
      theme === 'dark' 
        ? 'bg-[#181828] text-[#EAEAEA]' 
        : 'bg-[#E0E5EC] text-[#2D3436]'
    }`}>
      {/* Top Navigation */}
      <Navbar 
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenUploadModal={() => setShowUploadModal(true)}
      />

      {/* Main Content Viewport */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <DashboardView onSelectCard={handleSelectCardFromDashboard} />
        )}
        {activeTab === 'accounts' && (
          <BankAccountsView />
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
    <ThemeProvider>
      <ToastProvider>
        <FinanceProvider>
          <MainLayout />
        </FinanceProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
