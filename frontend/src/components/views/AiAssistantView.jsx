import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { TelemetryTerminal } from '../organisms/TelemetryTerminal';
import { getFinancialContext } from '../../utils/analytics';
import { formatCurrency } from '../../utils/formatters';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { 
  Bot, 
  User, 
  Send, 
  Sparkles, 
  RotateCcw, 
  Sliders, 
  Cpu, 
  CheckCircle2, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Lock,
  ChevronRight
} from 'lucide-react';

export const AiAssistantView = () => {
  const { style } = useTheme();
  const { transactions, user , authFetch} = useFinance();

  // Chat State
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello Abhay! I'm your local AI financial intelligence assistant powered by Qwen2.5:3b and pgvector RAG. Ask me anything about your cashflow, card limits, cashback, or specific merchant expenses."
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [queryMode, setQueryMode] = useState('Analyze');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Financial Context Computation
  const finCtx = useMemo(() => getFinancialContext(transactions), [transactions]);
  const isChatActive = messages.length > 1;

  // LLM Configuration State
  const [showLlmConfig, setShowLlmConfig] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState('http://ollama:11434');
  const [modelName, setModelName] = useState('qwen2.5:3b');
  const [embeddingModel, setEmbeddingModel] = useState('nomic-embed-text');
  const [temperature, setTemperature] = useState(0.0);
  const [numCtx, setNumCtx] = useState(2048);
  const [availableModels, setAvailableModels] = useState([]);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [aiTestStatus, setAiTestStatus] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);

  // Fetch initial LLM settings
  useEffect(() => {
    authFetch('/api/settings/llm')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setOllamaUrl(data.ollama_url || 'http://ollama:11434');
          setModelName(data.llm_model || 'qwen2.5:3b');
          setEmbeddingModel(data.embedding_model || 'nomic-embed-text');
          setTemperature(data.temperature ?? 0.0);
          setNumCtx(data.num_ctx || 2048);
          setOllamaConnected(data.ollama_connected || false);
          setAvailableModels(data.available_models || []);
        }
      })
      .catch(err => console.warn("Could not load LLM settings:", err));
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Test Ollama and fetch models
  const handleTestAi = async () => {
    setAiTestStatus({ type: 'loading', message: 'Testing connection to Ollama...' });
    try {
      const res = await authFetch('/api/settings/test-ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ollamaUrl })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setOllamaConnected(true);
        if (data.models) setAvailableModels(data.models);
        setAiTestStatus({ type: 'success', message: data.message || 'Connected to Ollama successfully!' });
      } else {
        setOllamaConnected(false);
        setAiTestStatus({ type: 'error', message: data.message || 'Failed to reach Ollama endpoint.' });
      }
    } catch (err) {
      setOllamaConnected(false);
      setAiTestStatus({ type: 'error', message: 'Could not connect to backend server.' });
    }
  };

  // Save LLM configuration
  const handleSaveLlmSettings = async () => {
    setSaveStatus({ type: 'loading', message: 'Saving configuration...' });
    try {
      const res = await authFetch('/api/settings/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ollama_url: ollamaUrl,
          llm_model: modelName,
          embedding_model: embeddingModel,
          temperature: parseFloat(temperature),
          num_ctx: parseInt(numCtx)
        })
      });
      if (res.ok) {
        const data = await res.json();
        setOllamaConnected(data.ollama_connected);
        if (data.available_models) setAvailableModels(data.available_models);
        setSaveStatus({ type: 'success', message: 'AI Engine settings saved and applied to RAG pipeline!' });
        setTimeout(() => setSaveStatus(null), 4000);
      } else {
        setSaveStatus({ type: 'error', message: 'Failed to save settings to server.' });
      }
    } catch (err) {
      setSaveStatus({ type: 'error', message: 'Connection error while saving settings.' });
    }
  };

  const handleSendMessage = async (queryText) => {
    const text = queryText || inputQuery;
    if (!text.trim() || loading) return;

    const userMsg = { id: String(Date.now()), role: 'user', content: text.trim(), mode: queryMode };
    setMessages(prev => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const res = await authFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), mode: queryMode })
      });

      if (res.ok) {
        const data = await res.json();
        const aiMsg = { 
          id: String(Date.now() + 1), 
          role: 'assistant', 
          content: data.response,
          evidence: data.evidence 
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        const err = await res.json();
        setMessages(prev => [
          ...prev, 
          { id: String(Date.now() + 1), role: 'assistant', content: `Error: ${err.detail || 'Could not query AI service.'}` }
        ]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev, 
        { id: String(Date.now() + 1), role: 'assistant', content: "Failed to connect to local backend/Ollama service." }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handlePromptClick = (p) => {
    setInputQuery(p);
    handleSendMessage(p);
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: "Chat session refreshed. How can I help you analyze your finances today?"
      }
    ]);
  };

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-300 max-w-6xl mx-auto pb-12">
      
      {/* 1. TOP: Live AI Engine Telemetry Console */}
      {user?.email === 'dev@test.com' && (
        <TelemetryTerminal title="AI Engine Live Telemetry" endpoint="/api/ai/logs" isCollapsible={true} defaultExpanded={false} />
      )}

      {/* 2. LLM Engine Configuration Panel (Expandable) */}
      {user?.email === 'dev@test.com' && (
        <div className={`p-5 rounded-2xl border-0 flex flex-col gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div 
          onClick={() => setShowLlmConfig(!showLlmConfig)}
          className="flex items-center justify-between cursor-pointer select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${style('neu-inset-dark text-purple-400', 'neu-inset-light text-purple-600')}`}>
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${style('text-slate-200', 'text-slate-700')}`}>
                LLM & AI Engine Configuration
                <Badge variant={ollamaConnected ? "success" : "danger"}>
                  {ollamaConnected ? "Online" : "Offline"}
                </Badge>
              </h3>
              <span className="text-xs text-slate-400 font-normal">
                Active Model: <span className="font-bold text-indigo-400">{modelName}</span> • Temp: {temperature.toFixed(2)} • Context: {numCtx} tokens
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all bg-transparent text-slate-400 hover:text-slate-200"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>{showLlmConfig ? "Hide Config" : "Configure Model"}</span>
              {showLlmConfig ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {showLlmConfig && (
          <div className="flex flex-col gap-4 pt-3 border-t border-slate-800/10 animate-in fade-in duration-200">
            
            {/* Endpoint & Presets */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex-1 w-full flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ollama Endpoint URL</span>
                <input
                  type="text"
                  value={ollamaUrl}
                  onChange={e => setOllamaUrl(e.target.value)}
                  placeholder="http://ollama:11434"
                  className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400 pt-5">
                <span>Presets:</span>
                <button
                  type="button"
                  onClick={() => setOllamaUrl('http://ollama:11434')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border-0 cursor-pointer ${style('neu-inset-dark text-slate-300 hover:text-white', 'neu-inset-light text-slate-700')}`}
                >
                  Docker (ollama:11434)
                </button>
                <button
                  type="button"
                  onClick={() => setOllamaUrl('http://localhost:11434')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border-0 cursor-pointer ${style('neu-inset-dark text-slate-300 hover:text-white', 'neu-inset-light text-slate-700')}`}
                >
                  Host (localhost:11434)
                </button>
              </div>
            </div>

            {/* Model Selector & Quick Switches */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Extraction & RAG Model</span>
                <div className="flex gap-2">
                  {availableModels.length > 0 ? (
                    <select
                      value={modelName}
                      onChange={e => setModelName(e.target.value)}
                      className={`flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none border-0 cursor-pointer ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
                    >
                      {availableModels.map(m => (
                        <option key={m} value={m}>{m} {m.includes('qwen2.5:3b') ? '⭐ (Recommended)' : ''}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={modelName}
                      onChange={e => setModelName(e.target.value)}
                      placeholder="e.g. qwen2.5:3b"
                      className={`flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
                    />
                  )}
                </div>
                
                {/* Model Presets */}
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {['qwen2.5:3b', 'qwen2.5:1.5b', 'llama3.2:3b', 'llama3.2:1b'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setModelName(preset)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-bold border-0 cursor-pointer transition-all ${
                        modelName === preset
                          ? style('bg-purple-600/30 text-purple-300 border border-purple-500/40', 'bg-purple-600 text-white')
                          : style('neu-inset-dark text-slate-400 hover:text-slate-200', 'neu-inset-light text-slate-600')
                      }`}
                    >
                      {preset} {preset === 'qwen2.5:3b' ? '⭐' : ''}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Embedding Model (768-dim RAG)</span>
                <input
                  type="text"
                  value={embeddingModel}
                  onChange={e => setEmbeddingModel(e.target.value)}
                  placeholder="nomic-embed-text"
                  className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
                />
                <span className="text-xs text-slate-400 font-normal">
                  Used for pgvector semantic retrieval and financial query similarity
                </span>
              </div>

            </div>

            {/* Hyperparameters: Temperature & Context Window */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs font-bold uppercase text-slate-400">
                  <span>Sampling Temperature</span>
                  <span className="text-indigo-400 font-mono">{temperature.toFixed(2)} {temperature === 0 ? '(Deterministic)' : ''}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={temperature}
                  onChange={e => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Context Window (Tokens)</span>
                <select
                  value={numCtx}
                  onChange={e => setNumCtx(parseInt(e.target.value))}
                  className={`rounded-xl px-3 py-2 text-xs focus:outline-none border-0 cursor-pointer ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
                >
                  <option value="1024">1,024 tokens (Fast Edge / Low RAM)</option>
                  <option value="2048">2,048 tokens (Standard Balanced)</option>
                  <option value="4096">4,096 tokens (Extended Context)</option>
                  <option value="8192">8,192 tokens (Full Ingestion Window)</option>
                </select>
              </div>
            </div>

            {/* Alerts */}
            {aiTestStatus && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border-0 ${
                aiTestStatus.type === 'success' ? 'bg-emerald-950/20 text-emerald-400' : 'bg-red-950/20 text-red-400'
              }`}>
                {aiTestStatus.type === 'success' ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
                <span className="leading-tight font-medium">{aiTestStatus.message}</span>
              </div>
            )}

            {saveStatus && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border-0 ${
                saveStatus.type === 'success' ? 'bg-emerald-950/20 text-emerald-400' : 'bg-red-950/20 text-red-400'
              }`}>
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                <span className="leading-tight font-medium">{saveStatus.message}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/10">
              <Button variant="secondary" size="sm" onClick={handleTestAi} icon={Sparkles}>
                Scan & Test Connection
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveLlmSettings} icon={CheckCircle2}>
                Save AI Configuration
              </Button>
            </div>

          </div>
        )}
      </div>
      )}

      {/* FINANCIAL COPILOT WORKSPACE */}
      <div className={`flex flex-col flex-1 pb-20 sm:pb-0`}>
        
        {/* NEW HEADER & FINANCIAL CONTEXT */}
        <div className={`rounded-2xl border-0 shadow-lg mb-5 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-slate-800/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${style('neu-inset-dark text-[#A78BFA]', 'neu-inset-light text-[#7C3AED]')}`}>
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className={`text-xl font-black tracking-tight ${style('text-[#F4F7FA]', 'text-[#17202A]')}`}>
                      WiseRaman Financial Copilot
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#A78BFA]/15 text-[#A78BFA] border border-[#A78BFA]/30">
                      ✦ AI
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">Your private financial intelligence</span>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#5EEAD4]/10 border border-[#5EEAD4]/20 text-[#5EEAD4] text-xs font-bold tracking-wide self-start sm:self-auto">
                <span className="w-2 h-2 rounded-full bg-[#5EEAD4] animate-pulse" />
                <span>Local · Private · No cloud AI</span>
              </div>
            </div>
          </div>

          {/* Metric Strip */}
          <div className="p-5 sm:p-6">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">Financial Context</h3>
            
            {transactions.length === 0 ? (
              <div className="py-2 text-sm text-slate-400 italic">
                Your Financial Copilot is ready. Import a statement to start asking questions about your finances.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                <div className="flex flex-col">
                  <span className="text-lg sm:text-xl font-black tabular-nums text-emerald-400">{formatCurrency(finCtx.income)}</span>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">Income</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-lg sm:text-xl font-black tabular-nums text-rose-400">{formatCurrency(finCtx.spending)}</span>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">Spending</span>
                </div>
                <div className="flex flex-col">
                  <span className={`text-lg sm:text-xl font-black tabular-nums ${finCtx.netFlow < 0 ? 'text-rose-400' : style('text-[#F4F7FA]', 'text-[#17202A]')}`}>{formatCurrency(finCtx.netFlow)}</span>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">Remaining</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-lg sm:text-xl font-black tabular-nums text-[#5EEAD4]">{finCtx.savingsRate.toFixed(1)}%</span>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">Saving Rate</span>
                </div>
              </div>
            )}

            {/* Freshness Status */}
            {transactions.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-800/10 flex flex-col sm:flex-row sm:items-center justify-between text-[10px] font-medium text-slate-400 gap-2">
                <span>{finCtx.period} · {finCtx.transactionCount} transactions</span>
                {finCtx.dataCompleteness === 'HIGH' ? (
                  <span className="text-emerald-400/80">● {finCtx.freshnessStatus}</span>
                ) : (
                  <span className="text-amber-400/80 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> ⚠ Data may be incomplete · {finCtx.freshnessStatus}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* PROACTIVE INSIGHT (Hidden during deep chat) */}
        {!isChatActive && (
          <div className={`p-5 mb-5 rounded-2xl border-0 flex items-start gap-4 transition-all ${style('neu-flat-dark border-indigo-500/10', 'neu-flat-light')}`}>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 mt-1 shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">One thing worth knowing</h3>
              <p className={`text-sm font-semibold leading-relaxed ${style('text-slate-200', 'text-slate-700')}`}>
                Personalized financial insights will appear here once WiseRaman has analyzed your spending patterns over time.
              </p>
            </div>
          </div>
        )}

        {/* SUGGESTED PROMPTS (Hidden during deep chat) */}
        {!isChatActive && (
          <div className={`p-6 rounded-2xl border-0 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-5">What would you like to know?</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
              
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Understand</span>
                <button onClick={() => handlePromptClick("Where did my money go this month?")} className={`text-left text-sm py-1.5 transition-colors bg-transparent border-0 cursor-pointer ${style('text-slate-300 hover:text-indigo-400', 'text-slate-600 hover:text-indigo-600')}`}>Where did my money go?</button>
                <button onClick={() => handlePromptClick("Why did my spending increase?")} className={`text-left text-sm py-1.5 transition-colors bg-transparent border-0 cursor-pointer ${style('text-slate-300 hover:text-indigo-400', 'text-slate-600 hover:text-indigo-600')}`}>Why did spending increase?</button>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Optimize</span>
                <button onClick={() => handlePromptClick("Where can I save money?")} className={`text-left text-sm py-1.5 transition-colors bg-transparent border-0 cursor-pointer ${style('text-slate-300 hover:text-indigo-400', 'text-slate-600 hover:text-indigo-600')}`}>Where can I save money?</button>
                <button onClick={() => handlePromptClick("What expenses can I reduce?")} className={`text-left text-sm py-1.5 transition-colors bg-transparent border-0 cursor-pointer ${style('text-slate-300 hover:text-indigo-400', 'text-slate-600 hover:text-indigo-600')}`}>What expenses can I reduce?</button>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cards</span>
                <button onClick={() => handlePromptClick("Did I maximize my cashback limits?")} className={`text-left text-sm py-1.5 transition-colors bg-transparent border-0 cursor-pointer ${style('text-slate-300 hover:text-indigo-400', 'text-slate-600 hover:text-indigo-600')}`}>Did I maximize cashback?</button>
                <button onClick={() => handlePromptClick("Which card should I use for groceries?")} className={`text-left text-sm py-1.5 transition-colors bg-transparent border-0 cursor-pointer ${style('text-slate-300 hover:text-indigo-400', 'text-slate-600 hover:text-indigo-600')}`}>Which card should I use?</button>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cash Flow</span>
                <button onClick={() => handlePromptClick("What payments are coming up?")} className={`text-left text-sm py-1.5 transition-colors bg-transparent border-0 cursor-pointer ${style('text-slate-300 hover:text-indigo-400', 'text-slate-600 hover:text-indigo-600')}`}>What payments are coming?</button>
                <button onClick={() => handlePromptClick("How much cash will I have left at month end?")} className={`text-left text-sm py-1.5 transition-colors bg-transparent border-0 cursor-pointer ${style('text-slate-300 hover:text-indigo-400', 'text-slate-600 hover:text-indigo-600')}`}>How much will I have left?</button>
              </div>

            </div>
          </div>
        )}

        {/* CHAT MESSAGES */}
        {isChatActive && (
          <div className={`flex flex-col flex-1 p-4 sm:p-6 rounded-2xl border-0 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
            <div className="flex items-center justify-between border-b pb-3 border-slate-800/10 mb-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Conversation</h3>
              <button
                onClick={handleResetChat}
                className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border-0 bg-transparent cursor-pointer transition-colors ${style('text-slate-400 hover:text-slate-200', 'text-slate-500 hover:text-slate-800')}`}
                title="Reset Conversation"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1 min-h-[300px] max-h-[500px] custom-scrollbar">
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                
                // Skip the initial welcome message if we have actual chat history, to save space.
                if (!isUser && index === 0 && isChatActive) return null;

                if (isUser) {
                  return (
                    <div key={msg.id} className="flex items-start gap-3 flex-row-reverse">
                      <div className={`p-2 rounded-xl flex-shrink-0 ${style('bg-[#5EEAD4] text-[#0A0E14]', 'bg-[#0F766E] text-white')}`}>
                        <User className="h-4 w-4" />
                      </div>
                      <div className={`p-4 rounded-2xl max-w-[85%] text-xs leading-relaxed transition-all ${style('neu-flat-dark text-[#F4F7FA] font-medium', 'neu-flat-light text-[#17202A] font-medium')}`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  );
                }

                // Assistant message rendering (Evidence-capable)
                const hasEvidence = msg.evidence && typeof msg.evidence === 'object';

                return (
                  <div key={msg.id} className="flex items-start gap-3">
                    <div className={`p-2 rounded-xl flex-shrink-0 ${style('neu-inset-dark text-[#A78BFA]', 'neu-inset-light text-[#7C3AED]')}`}>
                      <Bot className="h-4 w-4" />
                    </div>

                    <div className="flex flex-col gap-2 max-w-[90%] sm:max-w-[85%]">
                      {/* Main Text Response */}
                      <div className={`p-4 rounded-2xl text-xs leading-relaxed transition-all ${style('neu-inset-dark text-[#F4F7FA]', 'neu-inset-light text-[#17202A]')}`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>

                      {/* Evidence Package Renderer */}
                      {hasEvidence && (
                        <div className={`mt-1 p-3 rounded-xl border-l-2 border-indigo-500/50 flex flex-col gap-2 ${style('bg-slate-900/40 text-slate-300', 'bg-slate-100 text-slate-700')}`}>
                          <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Deterministic calculation · {msg.evidence.transactionCount || 0} transactions</span>
                          </div>
                          <details className="group">
                            <summary className="text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer list-none flex items-center gap-1 hover:text-slate-200 transition-colors select-none">
                              <ChevronRight className="h-3.5 w-3.5 group-open:rotate-90 transition-transform" />
                              How I know this
                            </summary>
                            <div className="mt-3 pl-4 border-l border-slate-700/50 flex flex-col gap-3 text-xs">
                              {msg.evidence.calculation && (
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] uppercase text-slate-500 font-bold">Calculation</span>
                                  <span className="font-mono text-indigo-300">{msg.evidence.calculation.formula}</span>
                                </div>
                              )}
                              {msg.evidence.sources && msg.evidence.sources.length > 0 && (
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] uppercase text-slate-500 font-bold">Sources</span>
                                  <span className="text-slate-400">{msg.evidence.sources.length} matching transactions</span>
                                </div>
                              )}
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl flex-shrink-0 ${style('neu-inset-dark text-indigo-400', 'neu-inset-light text-indigo-600')}`}>
                    <Bot className="h-4 w-4 animate-spin" />
                  </div>
                  <div className={`p-4 rounded-2xl text-xs flex items-center gap-2 text-slate-400 ${style('neu-inset-dark', 'neu-inset-light')}`}>
                    <Sparkles className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
                    <span>Analyzing financial context...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* INPUT COMPOSER (Anchored bottom on mobile) */}
        <div className="fixed sm:relative bottom-[70px] sm:bottom-0 left-0 right-0 px-4 sm:px-0 sm:pt-4 z-30 pointer-events-none">
          <div className={`pointer-events-auto p-2 sm:p-3 rounded-2xl border-0 shadow-2xl sm:shadow-none transition-all ${style('neu-flat-dark bg-[#1A1A2E]/95 sm:bg-transparent backdrop-blur-md', 'neu-flat-light bg-[#E0E5EC]/95 sm:bg-transparent backdrop-blur-md')}`}>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <div className={`flex-1 flex flex-col sm:flex-row sm:items-center rounded-xl p-1.5 transition-all ${style('neu-inset-dark', 'neu-inset-light')}`}>
                <div className="px-2 py-1.5 sm:py-0 border-b sm:border-b-0 sm:border-r border-slate-700/30 flex shrink-0">
                  <select
                    value={queryMode}
                    onChange={e => setQueryMode(e.target.value)}
                    className={`bg-transparent text-[10px] font-bold uppercase tracking-widest focus:outline-none cursor-pointer ${style('text-indigo-400', 'text-indigo-600')}`}
                    title="Analysis Mode Hint"
                  >
                    <option value="Analyze">Analyze ▾</option>
                    <option value="CashFlow">Cash Flow ▾</option>
                    <option value="Cards">Cards ▾</option>
                    <option value="Search">Search ▾</option>
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="Ask WiseRaman anything about your finances..."
                  value={inputQuery}
                  onChange={e => setInputQuery(e.target.value)}
                  disabled={loading}
                  enterKeyHint="send"
                  className={`flex-1 min-h-[40px] px-3 py-2 text-sm focus:outline-none border-0 bg-transparent ${style('text-slate-200', 'text-slate-800')}`}
                />
              </div>
              
              <Button
                type="submit"
                variant="primary"
                disabled={!inputQuery.trim() || loading}
                className="min-h-[52px] sm:min-h-[48px] px-4 rounded-xl flex items-center justify-center shrink-0"
                aria-label="Send query"
              >
                <Send className="h-5 w-5" />
              </Button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};
