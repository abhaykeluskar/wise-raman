import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { Loader2, CheckCircle2, AlertTriangle, X, Sparkles, Cpu } from 'lucide-react';

export const UploadSnackbar = () => {
  const { style } = useTheme();
  const { activeUpload, dismissUploadSnackbar } = useFinance();

  if (!activeUpload) return null;

  const isAi = activeUpload.engine === "Local AI LLM (Fallback)";
  const isSuccess = activeUpload.status === 'success';
  const isError = activeUpload.status === 'error';
  const isLoading = !isSuccess && !isError;

  return (
    <div className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-50 max-w-md w-[min(90vw,420px)] animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className={`p-4 rounded-2xl border-0 shadow-2xl flex flex-col gap-3 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLoading && (
              isAi ? (
                <div className="relative flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-purple-400 animate-pulse" />
                </div>
              ) : (
                <Cpu className="h-4 w-4 text-indigo-400 animate-pulse" />
              )
            )}
            {isSuccess && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            {isError && <AlertTriangle className="h-4 w-4 text-red-400" />}
            
            <span className="text-xs font-bold tracking-wide">
              {isSuccess ? "Statement Ingestion Complete" : isError ? "Statement Parsing Error" : isAi ? "Local AI Statement Parsing" : "Standard Algorithmic Parsing"}
            </span>
          </div>

          <button
            onClick={dismissUploadSnackbar}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800/20 border-0 bg-transparent cursor-pointer transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Status Line / Phase */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xxs font-semibold">
            <span className={`truncate max-w-[280px] ${isSuccess ? 'text-emerald-400' : isError ? 'text-red-400' : isAi ? 'text-purple-300' : 'text-slate-300'}`}>
              {activeUpload.phase}
            </span>
            {isLoading && (
              <span className="text-slate-400 ml-2 font-mono">
                {activeUpload.progress}%
              </span>
            )}
          </div>

          {/* Progress Bar (Determinate for Algo, Pulsing for AI) */}
          {isLoading && (
            <div className={`w-full h-2 rounded-full overflow-hidden ${style('neu-inset-dark', 'bg-slate-100')}`}>
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isAi 
                    ? 'bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-400 animate-pulse' 
                    : 'bg-gradient-to-r from-indigo-500 to-emerald-400'
                }`}
                style={{ width: `${activeUpload.progress}%` }}
              />
            </div>
          )}

          {/* Additional details on finish */}
          {(isSuccess || isError) && activeUpload.message && (
            <span className={`text-[11px] leading-tight ${isSuccess ? 'text-slate-300' : 'text-red-300'}`}>
              {activeUpload.message}
            </span>
          )}
        </div>

      </div>
    </div>
  );
};
