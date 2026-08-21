import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Play, Pause, Trash2, ShieldCheck, Activity, ChevronDown, ChevronUp } from 'lucide-react';

export const TelemetryTerminal = ({ 
  title = "AI Engine Live Telemetry",
  endpoint = "/api/ai/logs",
  isCollapsible = true, 
  defaultExpanded = true,
  className = '' 
}) => {
  const [logs, setLogs] = useState([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!isStreaming) return;

    const eventSource = new EventSource(endpoint);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLogs(prev => {
          const updated = [...prev, data];
          return updated.length > 150 ? updated.slice(-150) : updated;
        });
      } catch (err) {
        console.error("Error parsing telemetry event:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn("SSE connection closed/error, reconnecting...", err);
    };

    return () => {
      eventSource.close();
    };
  }, [isStreaming, endpoint]);

  // Auto-scroll on new logs
  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isExpanded]);

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className={`flex flex-col rounded-2xl overflow-hidden bg-[#10121A] border border-slate-800/80 shadow-2xl font-mono text-xs transition-all ${className}`}>
      
      {/* Header bar */}
      <div className="p-3 px-4 bg-[#0A0C12] border-b border-slate-800/80 flex items-center justify-between">
        <div 
          onClick={() => isCollapsible && setIsExpanded(!isExpanded)} 
          className="flex items-center gap-2 cursor-pointer select-none"
        >
          <Terminal className="h-4 w-4 text-emerald-400" />
          <span className="font-bold text-slate-200 tracking-wider text-xs uppercase">
            {title}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            LIVE SSE
          </span>
          <span className="text-xs text-slate-500 hidden sm:inline">
            ({logs.length} events)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsStreaming(!isStreaming)}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-0 bg-transparent cursor-pointer transition-colors"
            title={isStreaming ? "Pause Stream" : "Resume Stream"}
          >
            {isStreaming ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={clearLogs}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-0 bg-transparent cursor-pointer transition-colors"
            title="Clear Console"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {isCollapsible && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-0 bg-transparent cursor-pointer transition-colors"
              title={isExpanded ? "Collapse Telemetry" : "Expand Telemetry"}
            >
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Terminal Output Body */}
      {isExpanded && (
        <>
          <div 
            ref={scrollRef}
            className="h-44 sm:h-48 p-3.5 px-4 overflow-y-auto space-y-1.5 text-xs leading-relaxed custom-scrollbar selection:bg-emerald-500/30 font-mono"
          >
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 select-none">
                <Activity className="h-5 w-5 text-slate-600 animate-pulse" />
                <span className="text-xs">Listening for real-time RAG & statement parsing events...</span>
              </div>
            ) : (
              logs.map((log, idx) => {
                const isError = log.level === 'ERROR';
                const isWarning = log.level === 'WARNING';
                const isAi = log.message?.includes('[AI]') || log.message?.includes('Qwen') || log.message?.includes('Llama');
                
                return (
                  <div key={idx} className="flex items-start gap-2 animate-in fade-in duration-100 text-xs">
                    <span className="text-slate-500 select-none flex-shrink-0">
                      [{log.timestamp}]
                    </span>
                    <span className="text-slate-600 select-none">&gt;</span>
                    <span className={`break-words ${
                      isError 
                        ? 'text-red-400 font-bold' 
                        : isWarning 
                        ? 'text-amber-400' 
                        : isAi 
                        ? 'text-purple-300' 
                        : 'text-emerald-400'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Terminal Footer */}
          <div className="p-1.5 px-4 bg-[#0A0C12] border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center justify-between font-mono">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Local pgvector & Ollama bridge
            </span>
            <span>{logs.length} events logged</span>
          </div>
        </>
      )}

    </div>
  );
};
