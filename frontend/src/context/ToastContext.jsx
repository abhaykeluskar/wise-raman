import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useTheme } from './ThemeContext';
import { Button } from '../components/atoms/Button';
import { 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  AlertOctagon, 
  Info, 
  X, 
  Trash2 
} from 'lucide-react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [alertDialog, setAlertDialog] = useState(null);
  
  const confirmResolveRef = useRef(null);
  const alertResolveRef = useRef(null);

  // Add toast notification
  const addToast = useCallback((type, message, title) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, type, message, title }]);

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

  // Promise-based Custom Confirmation Dialog
  const confirm = useCallback(({ 
    title = 'Confirm Action', 
    message, 
    confirmText = 'Confirm', 
    cancelText = 'Cancel', 
    isDanger = true 
  }) => {
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

  // Promise-based Custom Alert Dialog
  const alert = useCallback(({ 
    title = 'Notice', 
    message, 
    buttonText = 'Understood', 
    type = 'info' 
  }) => {
    return new Promise((resolve) => {
      alertResolveRef.current = resolve;
      setAlertDialog({
        title,
        message,
        buttonText,
        type
      });
    });
  }, []);

  const handleAlertClose = () => {
    if (alertResolveRef.current) {
      alertResolveRef.current(true);
      alertResolveRef.current = null;
    }
    setAlertDialog(null);
  };

  return (
    <ToastContext.Provider value={{ toast, confirm, alert }}>
      {children}

      {/* Floating Toast Notification Container */}
      <div className="fixed bottom-20 right-4 md:bottom-5 md:right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map(t => {
          let icon = <Info className="h-4 w-4 text-[#5BAE78] shrink-0" />;
          let borderAccent = 'border-[#5BAE78]/30';
          let titleColor = 'text-[#3F8F5E] dark:text-[#5BAE78]';

          if (t.type === 'success') {
            icon = <CheckCircle2 className="h-4 w-4 text-[#3F8F5E] shrink-0" />;
            borderAccent = 'border-[#3F8F5E]/30';
            titleColor = 'text-[#3F8F5E] dark:text-[#7FC39A]';
          } else if (t.type === 'error') {
            icon = <AlertCircle className="h-4 w-4 text-[#C85C5C] shrink-0" />;
            borderAccent = 'border-[#C85C5C]/30';
            titleColor = 'text-[#C85C5C]';
          } else if (t.type === 'warning') {
            icon = <AlertTriangle className="h-4 w-4 text-[#B78332] shrink-0" />;
            borderAccent = 'border-[#B78332]/30';
            titleColor = 'text-[#B78332]';
          }

          return (
            <div
              key={t.id}
              className={`pointer-events-auto p-3.5 rounded-[12px] shadow-lg border flex items-start gap-3 transition-all duration-200 animate-in slide-in-from-right-6 fade-in ${borderAccent} ${
                isDark ? 'bg-[#171E19] text-[#F1F5F2]' : 'bg-[#FFFFFF] text-[#1D2822]'
              }`}
            >
              <div className="pt-0.5">{icon}</div>
              <div className="flex-1 flex flex-col min-w-0 pr-1">
                {t.title && <span className={`text-xs font-bold ${titleColor}`}>{t.title}</span>}
                <span className={`text-xs font-normal leading-relaxed mt-0.5 break-words ${
                  isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'
                }`}>
                  {t.message}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="text-[#8B978F] hover:text-foreground border-0 bg-transparent cursor-pointer p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Custom Confirmation Modal Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity" 
            onClick={() => handleConfirmClose(false)} 
          />
          <div className={`relative w-full max-w-md p-6 rounded-[16px] border shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-4 ${
            isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-[10px] flex items-center justify-center ${
                confirmDialog.isDanger 
                  ? 'bg-[#C85C5C]/15 text-[#C85C5C]' 
                  : 'bg-[#B78332]/15 text-[#B78332]'
              }`}>
                {confirmDialog.isDanger ? <AlertOctagon className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">
                  {confirmDialog.title}
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#8B978F]">Action Verification</span>
              </div>
            </div>

            <div className={`text-xs leading-relaxed ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
              {confirmDialog.message}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E4E8E3]/20">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleConfirmClose(false)}
              >
                {confirmDialog.cancelText}
              </Button>
              <Button
                variant={confirmDialog.isDanger ? 'danger' : 'primary'}
                size="sm"
                onClick={() => handleConfirmClose(true)}
              >
                {confirmDialog.confirmText}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert Modal Dialog */}
      {alertDialog && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity" 
            onClick={handleAlertClose} 
          />
          <div className={`relative w-full max-w-md p-6 rounded-[16px] border shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-4 ${
            isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-[10px] flex items-center justify-center ${
                alertDialog.type === 'error' 
                  ? 'bg-[#C85C5C]/15 text-[#C85C5C]' 
                  : alertDialog.type === 'success'
                    ? 'bg-[#3F8F5E]/15 text-[#3F8F5E]'
                    : alertDialog.type === 'warning'
                      ? 'bg-[#B78332]/15 text-[#B78332]'
                      : 'bg-[#5BAE78]/15 text-[#5BAE78]'
              }`}>
                {alertDialog.type === 'error' ? (
                  <AlertOctagon className="h-5 w-5" />
                ) : alertDialog.type === 'success' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : alertDialog.type === 'warning' ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <Info className="h-5 w-5" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">
                  {alertDialog.title}
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#8B978F]">System Notice</span>
              </div>
            </div>

            <div className={`text-xs leading-relaxed ${isDark ? 'text-[#C2CCC5]' : 'text-[#4F5D55]'}`}>
              {alertDialog.message}
            </div>

            <div className="flex items-center justify-end pt-4 border-t border-[#E4E8E3]/20">
              <Button
                variant="primary"
                size="sm"
                onClick={handleAlertClose}
              >
                {alertDialog.buttonText}
              </Button>
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

export const useDialog = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useDialog must be used within a ToastProvider');
  }
  return context;
};
