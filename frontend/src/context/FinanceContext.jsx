import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const FinanceContext = createContext();

export const FinanceProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) || null; } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  }, []);

  const login = async (email, password) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: email, password: password })
      });
      if (res.ok) {
        const data = await res.json();
        const userData = { id: data.user_id, email: email, name: "User" };
        setUser(userData);
        setToken(data.access_token);
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('token', data.access_token);
        return { success: true };
      } else {
        const err = await res.json();
        return { success: false, error: err.detail || 'Login failed' };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const register = async (name, email, password) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setToken(data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('token', data.token);
        return { success: true };
      } else {
        const err = await res.json();
        return { success: false, error: err.detail || 'Registration failed' };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const authFetch = useCallback(async (url, options = {}) => {
    const headers = { ...options.headers };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      logout();
    }
    return res;
  }, [token, logout]);



  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [cards, setCards] = useState([]);
  const [statements, setStatements] = useState([]);
  const [banks, setBanks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [spendingReport, setSpendingReport] = useState({ categories: [], data: [] });
  const [savingsCashflow, setSavingsCashflow] = useState(null);
  const [creditCardSummary, setCreditCardSummary] = useState(null);
  
  // Phase 2 states
  const [netWorth, setNetWorth] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [cashflow, setCashflow] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [ledgerFocus, setLedgerFocus] = useState(null);

  const openInLedger = useCallback((filters = {}) => {
    setLedgerFocus({
      ts: Date.now(),
      month: 'ALL',
      category: 'ALL',
      search: '',
      flow: 'ALL',
      date: '',
      rail: 'ALL',
      ...filters
    });
  }, []);

  const clearLedgerFocus = useCallback(() => setLedgerFocus(null), []);

  // Background non-blocking upload state
  const [activeUpload, setActiveUpload] = useState(null);
  // activeUpload: { status: 'idle' | 'uploading' | 'processing_algo' | 'processing_ai' | 'success' | 'error', phase: string, progress: number, engine: string, message: string }

  // Rules state
  const [rules, setRules] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, txRes, catRes, cardRes, bankRes, reportRes, stmtRes, rulesRes] = await Promise.all([
        authFetch('/api/accounts'),
        authFetch('/api/transactions?limit=5000'),
        authFetch('/api/categories'),
        authFetch('/api/cards'),
        authFetch('/api/banks'),
        authFetch('/api/reports/spending'),
        authFetch('/api/statements'),
        authFetch('/api/rules')
      ]);

      if (accRes.ok) setAccounts(await accRes.json());
      if (txRes.ok) setTransactions(await txRes.json());
      if (catRes.ok) setCategories(await catRes.json());
      if (cardRes.ok) setCards(await cardRes.json());
      if (bankRes.ok) setBanks(await bankRes.json());
      if (reportRes.ok) setSpendingReport(await reportRes.json());
      if (stmtRes.ok) setStatements(await stmtRes.json());
      if (rulesRes.ok) setRules(await rulesRes.json());
      
      // Fetch analytics
      try {
        const [cashflowRes, ccSumRes, netWorthRes, subsRes, phase2CashflowRes] = await Promise.all([
          authFetch('/api/analytics/savings/cashflow'),
          authFetch('/api/analytics/credit-cards/summary'),
          authFetch('/api/net-worth'),
          authFetch('/api/subscriptions'),
          authFetch('/api/analytics/cashflow')
        ]);
        if (cashflowRes.ok) setSavingsCashflow(await cashflowRes.json());
        if (ccSumRes.ok) setCreditCardSummary(await ccSumRes.json());
        if (netWorthRes.ok) setNetWorth(await netWorthRes.json());
        if (subsRes.ok) setSubscriptions(await subsRes.json());
        if (phase2CashflowRes.ok) setCashflow(await phase2CashflowRes.json());
      } catch (err) {
        console.warn("Analytics endpoints not ready yet:", err);
      }
    } catch (err) {
      console.error("Error fetching financial data:", err);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Non-blocking upload handler for multiple files
  const startDocumentUpload = async ({ documentType = 'STATEMENT', bankId, accountId, fileType, processingEngine, files, pdfPassword }) => {
    if (!files || files.length === 0) return;
    if (documentType === 'STATEMENT' && !accountId) return;

    const isAi = processingEngine === "Local AI LLM (Fallback)" || documentType === 'PAYSLIP';
    
    // We will upload files sequentially to avoid overloading the backend LLM
    let successCount = 0;
    let failCount = 0;
    let lastError = null;

    setActiveUpload({
      status: isAi ? 'processing_ai' : 'processing_algo',
      phase: `Starting upload for ${files.length} document(s)...`,
      progress: 5,
      engine: isAi ? 'Local AI LLM' : processingEngine,
      filename: files.length === 1 ? files[0].name : `${files.length} files selected`
    });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progressBase = Math.floor((i / files.length) * 100);
      const progressNext = Math.floor(((i + 1) / files.length) * 100);

      setActiveUpload(prev => ({
        ...prev,
        progress: progressBase + 5,
        phase: `Processing file ${i + 1} of ${files.length}: ${file.name}...`,
        filename: file.name
      }));

      // Simulate some progress for current file
      const progressTimer = setInterval(() => {
        setActiveUpload(prev => {
          if (!prev || prev.status === 'success' || prev.status === 'error') return prev;
          const currentMax = progressBase + Math.floor((progressNext - progressBase) * 0.9);
          if (prev.progress < currentMax) {
            return { ...prev, progress: prev.progress + 2 };
          }
          return prev;
        });
      }, isAi ? 1500 : 700);

      const formData = new FormData();
      if (documentType === 'STATEMENT') {
        formData.append('bank_id', bankId);
        formData.append('account_id', accountId);
        formData.append('file_type', fileType);
        formData.append('processing_engine', processingEngine);
      }
      if (pdfPassword && pdfPassword.trim()) {
        formData.append('pdf_password', pdfPassword.trim());
      }
      formData.append('file', file);

      try {
        const endpoint = documentType === 'STATEMENT' ? '/api/upload' : '/api/payslips/upload';
        const res = await authFetch(endpoint, {
          method: 'POST',
          body: formData
        });
        
        if (res.ok) {
          successCount++;
        } else {
          const data = await res.json();
          failCount++;
          lastError = data.detail || 'Upload failed.';
        }
      } catch (err) {
        failCount++;
        lastError = 'Could not connect to server.';
      } finally {
        clearInterval(progressTimer);
      }
    }

    if (successCount > 0 && failCount === 0) {
      setActiveUpload({
        status: 'success',
        phase: 'All documents processed successfully.',
        progress: 100,
        engine: isAi ? 'Local AI LLM' : processingEngine,
        message: `Successfully imported ${successCount} document(s).`
      });
      await fetchData();
      setTimeout(() => setActiveUpload(prev => prev?.status === 'success' ? null : prev), 6000);
    } else if (successCount > 0 && failCount > 0) {
      setActiveUpload({
        status: 'error',
        phase: 'Partial Success',
        progress: 100,
        engine: isAi ? 'Local AI LLM' : processingEngine,
        message: `${successCount} succeeded, ${failCount} failed. Last error: ${lastError}`
      });
      await fetchData();
    } else {
      setActiveUpload({
        status: 'error',
        phase: 'Upload Failed',
        progress: 0,
        engine: isAi ? 'Local AI LLM' : processingEngine,
        message: `Failed to import documents. Last error: ${lastError}`
      });
    }
  };

  const dismissUploadSnackbar = () => {
    setActiveUpload(null);
  };

  // Rule additions
  const addRule = async (keyword, category) => {
    const res = await authFetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        match_pattern: keyword.trim(),
        match_field: "raw_text",
        target_category: category,
        priority: 100
      })
    });
    if (res.ok) {
      const newRule = await res.json();
      setRules(prev => [...prev, newRule]);
    }
  };

  const deleteRule = async (id) => {
    const res = await authFetch(`/api/rules/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setRules(prev => prev.filter(r => r.id !== id));
    }
  };

  const processedTransactions = useMemo(() => (
    transactions.map(tx => {
      if (tx.verified) return tx;
      const matchingRule = rules.find(r => tx.description?.toUpperCase().includes(r.match_pattern.toUpperCase()));
      if (matchingRule) return { ...tx, category: matchingRule.target_category };
      return tx;
    })
  ), [transactions, rules]);

  return (
    <FinanceContext.Provider value={{
      user,
      token,
      login,
      register,
      logout,
      authFetch,
      accounts,
      transactions: processedTransactions,
      rawTransactions: transactions,
      cards,
      statements,
      banks,
      categories,
      spendingReport,
      savingsCashflow,
      creditCardSummary,
      netWorth,
      subscriptions,
      cashflow,
      loading,
      rules,
      activeUpload,
      fetchData,
      startDocumentUpload,
      dismissUploadSnackbar,
      addRule,
      deleteRule,
      setTransactions,
      ledgerFocus,
      openInLedger,
      clearLedgerFocus
    }}>
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
};
