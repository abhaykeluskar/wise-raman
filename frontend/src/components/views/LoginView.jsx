import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../atoms/Button';
import { Mail, Lock, ArrowRight, ShieldCheck } from 'lucide-react';

export const LoginView = ({ onNavigateRegister }) => {
  const { login } = useFinance();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Failed to login');
    }
  };

  return (
    <div className="flex justify-center items-center min-h-[80vh] w-full py-12 px-4">
      <div className={`w-full max-w-md p-8 rounded-[16px] border shadow-xs transition-all ${
        isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
      }`}>
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="h-10 w-10 rounded-[10px] bg-[#3F8F5E] flex items-center justify-center text-white font-bold text-lg mb-3 shadow-xs">
            W
          </div>
          <h2 className="text-xl font-bold tracking-tight">Sign in to WiseRaman</h2>
          <p className={`text-xs mt-1 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`}>
            Private, sovereign financial command center
          </p>
        </div>

        {error && (
          <div className="bg-[#C85C5C]/10 border border-[#C85C5C]/30 text-[#C85C5C] text-xs p-3 rounded-[10px] mb-6 text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={`text-[11px] font-semibold uppercase tracking-wider ${
              isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
            }`}>
              Email Address
            </label>
            <div className={`flex items-center px-3 py-2 rounded-[10px] border transition-all ${
              isDark 
                ? 'bg-[#1C251F] border-[#2A352D] focus-within:border-[#5BAE78]' 
                : 'bg-[#FBFCFA] border-[#E4E8E3] focus-within:border-[#5BAE78]'
            }`}>
              <Mail className={`h-4 w-4 mr-2.5 shrink-0 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`} />
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="name@domain.com"
                className={`bg-transparent outline-none w-full text-xs ${
                  isDark ? 'text-[#F1F5F2] placeholder-[#5E6962]' : 'text-[#1D2822] placeholder-[#A8B0AA]'
                }`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={`text-[11px] font-semibold uppercase tracking-wider ${
              isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'
            }`}>
              Password
            </label>
            <div className={`flex items-center px-3 py-2 rounded-[10px] border transition-all ${
              isDark 
                ? 'bg-[#1C251F] border-[#2A352D] focus-within:border-[#5BAE78]' 
                : 'bg-[#FBFCFA] border-[#E4E8E3] focus-within:border-[#5BAE78]'
            }`}>
              <Lock className={`h-4 w-4 mr-2.5 shrink-0 ${isDark ? 'text-[#8B978F]' : 'text-[#7B877F]'}`} />
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className={`bg-transparent outline-none w-full text-xs ${
                  isDark ? 'text-[#F1F5F2] placeholder-[#5E6962]' : 'text-[#1D2822] placeholder-[#A8B0AA]'
                }`}
              />
            </div>
          </div>

          <div className="mt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={loading}
              icon={!loading ? ArrowRight : undefined}
              className="w-full justify-center"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </Button>
          </div>
        </form>

        <div className={`mt-6 pt-5 border-t text-center text-xs ${
          isDark ? 'border-[#2A352D] text-[#8B978F]' : 'border-[#E4E8E3] text-[#7B877F]'
        }`}>
          <span>Don't have an account? </span>
          <button 
            onClick={onNavigateRegister}
            type="button"
            className="font-semibold text-[#3F8F5E] hover:underline cursor-pointer bg-transparent border-0 ml-1"
          >
            Create one
          </button>
        </div>

        {/* Security watermark */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-[#8B978F]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#3F8F5E]" />
          <span>Local Sovereign Financial OS</span>
        </div>
      </div>
    </div>
  );
};
