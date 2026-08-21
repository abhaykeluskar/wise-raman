import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useTheme } from './ThemeContext';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, Trash2 } from 'lucide-react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const { style } = useTheme();
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const confirmResolveRef = useRef(null);

  // Add toast
  const addToast = useCallback((type, message, title) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, type, message, title }]);

    // Auto-remove after 4.5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (msg, title = 'Success') => addToast('success', msg, title),
    error: (msg, title = 'Error') => addToast('error', msg, title),
    warning: (msg, title = 'Warning') => addToast('warning', msg, title),
    info: (msg, title = 'Notice') => addToast('info', msg, title),
  };

  // Promise-based Confirm Dialog
  const confirm = useCallback(({ title = 'Confirm Action', message, confirmText = 'Confirm', cancelText = 'Cancel', isDanger = true }) => {
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmDialog({
        title,
        message,
        confirmText,
        cancelText,
        isDanger
      });
    });
  }, []);

  const handleConfirmClose = (result) => {
    if (confirmResolveRef.current) {
      confirmResolveRef.current(result);
      confirmResolveRef.current = null;
    }
    setConfirmDialog(null);
  };

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Floating Toast Notification Container */}
      <div className="fixed bottom-24 right-4 md:bottom-5 md:right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map(t => {
          let icon = <Info className="h-5 w-5 text-blue-400 shrink-0" />;
          let borderAccent = 'border-blue-500/40';
          let titleColor = 'text-blue-400';

          if (t.type === 'success') {
            icon = <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />;
            borderAccent = 'border-emerald-500/40';
            titleColor = 'text-emerald-400';
          } else if (t.type === 'error') {
            icon = <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />;
            borderAccent = 'border-red-500/40';
            titleColor = 'text-red-400';
          } else if (t.type === 'warning') {
            icon = <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />;
            borderAccent = 'border-amber-500/40';
            titleColor = 'text-amber-400';
          }

          return (
            <div
              key={t.id}
              className={`pointer-events-auto p-4 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-start gap-3 transition-all duration-300 animate-in slide-in-from-right-8 fade-in ${borderAccent} ${style('neu-flat-dark bg-[#12121E]/95 text-slate-100', 'neu-flat-light bg-white/95 text-slate-800')}`}
            >
              {icon}
              <div className="flex-1 flex flex-col min-w-0 pr-1">
                {t.title && <span className={`text-xs font-bold ${titleColor}`}>{t.title}</span>}
                <span className={`text-xs font-normal leading-relaxed mt-0.5 break-words ${style('text-slate-300', 'text-slate-600')}`}>
                  {t.message}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="text-slate-400 hover:text-slate-200 border-0 bg-transparent cursor-pointer p-0.5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Modern Confirmation Modal Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-md p-6 rounded-2xl border-0 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200 ${style('neu-flat-dark text-[#EAEAEA]', 'neu-flat-light text-[#2D3436]')}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl flex items-center justify-center ${confirmDialog.isDanger ? 'bg-red-500/15 text-red-400 border border-red-500/30' : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'}`}>
                {confirmDialog.isDanger ? <Trash2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              </div>
              <h3 className="text-sm font-bold tracking-tight">
                {confirmDialog.title}
              </h3>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed font-normal">
              {confirmDialog.message}
            </p>

            <div className="flex items-center justify-end gap-3 mt-2 pt-3 border-t border-slate-800/20">
              <button
                type="button"
                onClick={() => handleConfirmClose(false)}
                className={`px-4 py-2 text-xs font-bold rounded-xl border-0 cursor-pointer transition-all ${style('neu-flat-dark text-slate-300 hover:text-white', 'neu-flat-light text-slate-700 hover:text-black')}`}
              >
                {confirmDialog.cancelText}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmClose(true)}
                className={`px-4 py-2 text-xs font-bold rounded-xl border-0 cursor-pointer transition-all ${
                  confirmDialog.isDanger
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
                    : 'bg-[#FF7E67] hover:bg-[#ff6950] text-white shadow-lg shadow-[#FF7E67]/20'
                }`}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
