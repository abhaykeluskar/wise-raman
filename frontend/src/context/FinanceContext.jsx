import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const FinanceContext = createContext();

export const FinanceProvider = ({ children }) => {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [cards, setCards] = useState([]);
  const [statements, setStatements] = useState([]);
  const [banks, setBanks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [spendingReport, setSpendingReport] = useState({ categories: [], data: [] });
  const [savingsCashflow, setSavingsCashflow] = useState(null);
  const [creditCardSummary, setCreditCardSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  // Background non-blocking upload state
  const [activeUpload, setActiveUpload] = useState(null);
  // activeUpload: { status: 'idle' | 'uploading' | 'processing_algo' | 'processing_ai' | 'success' | 'error', phase: string, progress: number, engine: string, message: string }

  // Rules state
  const [rules, setRules] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('rules')) || [
        { id: 1, keyword: "SWIGGY", category: "Dining" },
        { id: 2, keyword: "ZOMATO", category: "Dining" },
        { id: 3, keyword: "NETFLIX", category: "Entertainment" }
      ];
    } catch {
      return [];
    }
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, txRes, catRes, cardRes, bankRes, reportRes, stmtRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/transactions?limit=5000'),
        fetch('/api/categories'),
        fetch('/api/cards'),
        fetch('/api/banks'),
        fetch('/api/reports/spending'),
        fetch('/api/statements')
      ]);

      if (accRes.ok) setAccounts(await accRes.json());
      if (txRes.ok) setTransactions(await txRes.json());
      if (catRes.ok) setCategories(await catRes.json());
      if (cardRes.ok) setCards(await cardRes.json());
      if (bankRes.ok) setBanks(await bankRes.json());
      if (reportRes.ok) setSpendingReport(await reportRes.json());
      if (stmtRes.ok) setStatements(await stmtRes.json());
      
      // Fetch analytics
      try {
        const [cashflowRes, ccSumRes] = await Promise.all([
          fetch('/api/analytics/savings/cashflow'),
          fetch('/api/analytics/credit-cards/summary')
        ]);
        if (cashflowRes.ok) setSavingsCashflow(await cashflowRes.json());
        if (ccSumRes.ok) setCreditCardSummary(await ccSumRes.json());
      } catch (err) {
        console.warn("Analytics endpoints not ready yet:", err);
      }
    } catch (err) {
      console.error("Error fetching financial data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Non-blocking upload handler
  const startStatementUpload = async ({ bankId, accountId, fileType, processingEngine, file, pdfPassword }) => {
    if (!file || !accountId) return;

    const isAi = processingEngine === "Local AI LLM (Fallback)";
    
    // 1. Set initial upload state
    setActiveUpload({
      status: isAi ? 'processing_ai' : 'processing_algo',
      phase: isAi 
        ? '[AI] Initializing structured Qwen2.5:3b parser...' 
        : 'Phase 1/3: Extracting PDF Text & Ruled Coordinates...',
      progress: 15,
      engine: processingEngine,
      filename: file.name
    });

    // 2. Simulated phase updates for UI smoothness while backend processes
    let progressTimer;
    if (!isAi) {
      progressTimer = setInterval(() => {
        setActiveUpload(prev => {
          if (!prev || prev.status === 'success' || prev.status === 'error') return prev;
          if (prev.progress < 50) {
            return { ...prev, progress: 50, phase: 'Phase 2/3: Validating Completeness Proof (Opening vs Closing)...' };
          } else if (prev.progress < 85) {
            return { ...prev, progress: 85, phase: 'Phase 3/3: Persisting normalized transactions to PostgreSQL...' };
          }
          return prev;
        });
      }, 700);
    } else {
      progressTimer = setInterval(() => {
        setActiveUpload(prev => {
          if (!prev || prev.status === 'success' || prev.status === 'error') return prev;
          const nextProg = Math.min(92, prev.progress + 12);
          const chunkNum = Math.floor(nextProg / 30) + 1;
          return {
            ...prev,
            progress: nextProg,
            phase: `[AI] Processing Chunk ${chunkNum}: Categorizing merchant entities via Qwen2.5:3b...`
          };
        });
      }, 1500);
    }

    const formData = new FormData();
    formData.append('bank_id', bankId);
    formData.append('account_id', accountId);
    formData.append('file_type', fileType);
    formData.append('processing_engine', processingEngine);
    if (pdfPassword && pdfPassword.trim()) {
      formData.append('pdf_password', pdfPassword.trim());
    }
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      clearInterval(progressTimer);
      const data = await res.json();

      if (res.ok) {
        setActiveUpload({
          status: 'success',
          phase: isAi ? '[AI] Successfully extracted and categorized all transactions.' : 'Phase 3/3: Statement successfully imported & verified.',
          progress: 100,
          engine: processingEngine,
          message: data.message || `Imported ${data.transaction_count || ''} transactions successfully!`
        });
        await fetchData();
        // Auto-dismiss success notification after 6 seconds
        setTimeout(() => {
          setActiveUpload(prev => prev?.status === 'success' ? null : prev);
        }, 6000);
      } else {
        setActiveUpload({
          status: 'error',
          phase: 'Upload Failed',
          progress: 0,
          engine: processingEngine,
          message: data.detail || 'Failed to extract transactions from statement.'
        });
      }
    } catch (err) {
      clearInterval(progressTimer);
      setActiveUpload({
        status: 'error',
        phase: 'Connection Error',
        progress: 0,
        engine: processingEngine,
        message: 'Could not connect to backend server.'
      });
    }
  };

  const dismissUploadSnackbar = () => {
    setActiveUpload(null);
  };

  // Rule additions
  const addRule = (keyword, category) => {
    const newRule = { id: Date.now(), keyword: keyword.trim().toUpperCase(), category };
    const updated = [...rules, newRule];
    setRules(updated);
    localStorage.setItem('rules', JSON.stringify(updated));
  };

  const deleteRule = (id) => {
    const updated = rules.filter(r => r.id !== id);
    setRules(updated);
    localStorage.setItem('rules', JSON.stringify(updated));
  };

  // Overridden transactions with rule engine (only applied to unverified transactions)
  const processedTransactions = transactions.map(tx => {
    if (tx.verified) {
      return tx;
    }
    const matchingRule = rules.find(r => tx.description?.toUpperCase().includes(r.keyword.toUpperCase()));
    if (matchingRule) {
      return { ...tx, category: matchingRule.category };
    }
    return tx;
  });

  return (
    <FinanceContext.Provider value={{
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
      loading,
      rules,
      activeUpload,
      fetchData,
      startStatementUpload,
      dismissUploadSnackbar,
      addRule,
      deleteRule,
      setTransactions
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
