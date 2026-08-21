import React from 'react';

export const NetworkLogo = ({ network = 'Visa', className = '' }) => {
  const net = (network || '').toLowerCase();

  if (net.includes('mastercard') || net.includes('master')) {
    return (
      <div 
        className={`inline-flex items-center justify-center p-1 px-1.5 rounded-lg bg-slate-900/80 border border-slate-700/50 shadow-inner shrink-0 ${className}`} 
        title="Mastercard"
      >
        <svg className="h-3.5 w-5" viewBox="0 0 36 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="13" cy="12" r="10" fill="#EB001B" fillOpacity="0.95" />
          <circle cx="23" cy="12" r="10" fill="#F79E1B" fillOpacity="0.95" />
          <path d="M18 5.6C19.8 7.3 21 9.8 21 12.5C21 15.2 19.8 17.7 18 19.4C16.2 17.7 15 15.2 15 12.5C15 9.8 16.2 7.3 18 5.6Z" fill="#FF5F00" />
        </svg>
      </div>
    );
  }

  if (net.includes('rupay')) {
    return (
      <div 
        className={`inline-flex items-center justify-center px-2 py-0.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 shadow-inner shrink-0 ${className}`} 
        title="RuPay"
      >
        <div className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 18L12 4L20 18H4Z" fill="#00A859" fillOpacity="0.9" />
            <path d="M9 18L13 11L17 18H9Z" fill="#0072BC" />
          </svg>
          <span className="text-[10px] font-black tracking-tighter text-emerald-400">RuPay</span>
        </div>
      </div>
    );
  }

  if (net.includes('amex') || net.includes('american')) {
    return (
      <div 
        className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-lg bg-cyan-950/50 border border-cyan-500/40 shadow-inner shrink-0 ${className}`} 
        title="American Express"
      >
        <span className="text-[9px] font-black tracking-widest text-cyan-400">AMEX</span>
      </div>
    );
  }

  // Default: VISA
  return (
    <div 
      className={`inline-flex items-center justify-center px-2 py-0.5 rounded-lg bg-blue-950/50 border border-blue-500/40 shadow-inner shrink-0 ${className}`} 
      title="VISA"
    >
      <span className="text-[11px] font-black italic tracking-wider text-blue-400">VISA</span>
    </div>
  );
};
