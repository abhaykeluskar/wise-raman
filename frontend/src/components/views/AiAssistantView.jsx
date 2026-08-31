import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { TelemetryTerminal } from '../organisms/TelemetryTerminal';
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
  ChevronUp
} from 'lucide-react';

export const AiAssistantView = () => {
  const { style } = useTheme();
  const { transactions, user } = useFinance();

  // Chat State
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello Abhay! I'm your local AI financial intelligence assistant powered by Qwen2.5:3b and pgvector RAG. Ask me anything about your cashflow, card limits, cashback, or specific merchant expenses."
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

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

  const suggestedPrompts = [
    "What is my highest expense category this month?",
    "How much have I spent on food delivery (Swiggy/Zomato)?",
    "Did I maximize my SBI Cashback 5% online cap?",
    "What were my utility bill spends across all cards?"
  ];

  // Fetch initial LLM settings
  useEffect(() => {
    fetch('/api/settings/llm')
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
      const res = await fetch('/api/settings/test-ollama', {
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
      const res = await fetch('/api/settings/llm', {
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

    const userMsg = { id: String(Date.now()), role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        const aiMsg = { id: String(Date.now() + 1), role: 'assistant', content: data.response };
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

      {/* 3. Conversational Financial RAG Chat Interface */}
      <div className={`flex flex-col justify-between p-4 sm:p-6 rounded-2xl border-0 shadow-xl transition-all min-h-[420px] sm:min-h-[500px] ${style('neu-flat-dark', 'neu-flat-light')}`}>
        
        {/* Chat Header */}
        <div className="flex items-center justify-between border-b pb-3 border-slate-800/10">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${style('neu-inset-dark text-[#FF7E67]', 'neu-inset-light text-[#4A90E2]')}`}>
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                WiseRaman Local Financial RAG
                <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-indigo-500/10 text-indigo-400">
                  {modelName}
                </span>
              </h3>
              <span className="text-xs text-slate-400 font-normal">
                Contextualized with {transactions.length} local transactions & pgvector embeddings
              </span>
            </div>
          </div>

          <button
            onClick={handleResetChat}
            className={`p-2 rounded-xl border-0 bg-transparent cursor-pointer transition-colors ${style('text-slate-400 hover:text-slate-200', 'text-slate-500 hover:text-slate-800')}`}
            title="Reset Conversation"
            aria-label="Reset conversation"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 min-h-[260px] max-h-[480px] custom-scrollbar">
          {messages.map(msg => {
            const isUser = msg.role === 'user';
            return (
              <div key={msg.id} className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                <div className={`p-2 rounded-xl flex-shrink-0 ${
                  isUser 
                    ? style('bg-[#FF7E67] text-white', 'bg-[#4A90E2] text-white') 
                    : style('neu-inset-dark text-indigo-400', 'neu-inset-light text-indigo-600')
                }`}>
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                <div className={`p-4 rounded-2xl max-w-[85%] text-xs leading-relaxed transition-all ${
                  isUser 
                    ? style('neu-flat-dark text-slate-100 font-medium', 'neu-flat-light text-slate-900 font-medium')
                    : style('neu-inset-dark text-slate-200', 'neu-inset-light text-slate-800')
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
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
                <span>Searching vector database & formulating response...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompts & Input Bar */}
        <div className="flex flex-col gap-3 pt-3 border-t border-slate-800/10">
          
          {/* Prompt Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
            {suggestedPrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(p)}
                className={`text-xs px-3 py-1.5 rounded-xl whitespace-nowrap border-0 cursor-pointer transition-all font-medium ${style(
                  'neu-inset-dark text-slate-300 hover:text-white',
                  'neu-inset-light text-slate-700 hover:text-black'
                )}`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask about spends, limits, or cashflow…"
              value={inputQuery}
              onChange={e => setInputQuery(e.target.value)}
              disabled={loading}
              enterKeyHint="send"
              className={`flex-1 min-h-11 rounded-xl px-4 py-3 text-sm focus:outline-none border-0 transition-all ${style(
                'neu-inset-dark text-[#EAEAEA]',
                'neu-inset-light text-[#2D3436]'
              )}`}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={!inputQuery.trim() || loading}
              icon={Send}
              className="min-h-11"
            >
              <span className="hidden sm:inline">Ask AI</span>
            </Button>
          </form>

        </div>

      </div>

    </div>
  );
};
