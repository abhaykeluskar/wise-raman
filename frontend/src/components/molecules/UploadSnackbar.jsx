import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { Loader2, CheckCircle2, AlertTriangle, X, Sparkles, Cpu } from 'lucide-react';

export const UploadSnackbar = () => {
  const { theme } = useTheme();
  const { activeUpload, dismissUploadSnackbar } = useFinance();
  const isDark = theme === 'dark';

  if (!activeUpload) return null;

  const isAi = activeUpload.engine === "Local AI LLM (Fallback)";
  const isSuccess = activeUpload.status === 'success';
  const isError = activeUpload.status === 'error';
  const isLoading = !isSuccess && !isError;

  return (
    <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 max-w-md w-[min(92vw,400px)] animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className={`p-4 rounded-[14px] border shadow-2xl flex flex-col gap-3 transition-all ${
        isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
      }`}>
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLoading && (
              isAi ? (
                <div className="p-1 rounded-[6px] bg-[#8A78A8]/15 text-[#8A78A8]">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                </div>
              ) : (
                <div className="p-1 rounded-[6px] bg-[#3F8F5E]/15 text-[#3F8F5E]">
                  <Cpu className="h-3.5 w-3.5 animate-pulse" />
                </div>
              )
            )}
            {isSuccess && (
              <div className="p-1 rounded-[6px] bg-[#3F8F5E]/15 text-[#3F8F5E]">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </div>
            )}
            {isError && (
              <div className="p-1 rounded-[6px] bg-[#C85C5C]/15 text-[#C85C5C]">
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
            )}
            
            <span className="text-xs font-bold tracking-tight">
              {isSuccess 
                ? "Document Ingested" 
                : isError 
                  ? "Ingestion Error" 
                  : isAi 
                    ? "Local AI Extraction" 
                    : "Deterministic Ingestion"}
            </span>
          </div>

          <button
            onClick={dismissUploadSnackbar}
            type="button"
            className="text-[#8B978F] hover:text-foreground p-1 rounded-[6px] border-0 bg-transparent cursor-pointer transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Status Line / Phase */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-medium gap-2">
            <span className={`min-w-0 flex-1 truncate ${
              isSuccess 
                ? 'text-[#3F8F5E]' 
                : isError 
                  ? 'text-[#C85C5C]' 
                  : isAi 
                    ? 'text-[#8A78A8]' 
                    : isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'
            }`}>
              {activeUpload.phase}
            </span>
            {isLoading && (
              <span className="text-[#8B978F] ml-2 font-mono text-[11px]">
                {activeUpload.progress}%
              </span>
            )}
          </div>

          {/* Progress Bar */}
          {isLoading && (
            <div className="w-full h-1.5 rounded-full overflow-hidden bg-black/5 dark:bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isAi 
                    ? 'bg-[#8A78A8] animate-pulse' 
                    : 'bg-[#3F8F5E]'
                }`}
                style={{ width: `${activeUpload.progress}%` }}
              />
            </div>
          )}

          {/* Additional details on finish */}
          {(isSuccess || isError) && activeUpload.message && (
            <span className={`text-[11px] leading-tight ${
              isSuccess 
                ? isDark ? 'text-[#8B978F]' : 'text-[#7B877F]' 
                : 'text-[#C85C5C]'
            }`}>
              {activeUpload.message}
            </span>
          )}
        </div>

      </div>
    </div>
  );
};
