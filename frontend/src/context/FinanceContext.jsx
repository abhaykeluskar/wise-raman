import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

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
        const res = await fetch(endpoint, {
          method: 'POST',
          body: formData
        });
        clearInterval(progressTimer);
        
        if (res.ok) {
          successCount++;
        } else {
          const data = await res.json();
          failCount++;
          lastError = data.detail || 'Upload failed.';
        }
      } catch (err) {
        clearInterval(progressTimer);
        failCount++;
        lastError = 'Could not connect to server.';
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

  const processedTransactions = useMemo(() => (
    transactions.map(tx => {
      if (tx.verified) return tx;
      const matchingRule = rules.find(r => tx.description?.toUpperCase().includes(r.keyword.toUpperCase()));
      if (matchingRule) return { ...tx, category: matchingRule.category };
      return tx;
    })
  ), [transactions, rules]);

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
