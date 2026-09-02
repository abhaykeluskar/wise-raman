import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { useTheme } from '../../context/ThemeContext';
import { Mail, Lock, User, ArrowRight } from 'lucide-react';

export const RegisterView = ({ onNavigateLogin }) => {
  const { register } = useFinance();
  const { theme, style } = useTheme();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await register(name, email, password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Failed to register');
    }
  };

  return (
    <div className="flex justify-center items-center h-full w-full py-16">
      <div className={`w-full max-w-md p-8 rounded-3xl ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="text-center mb-8">
          <h2 className={`text-2xl font-black mb-2 ${style('text-[#F4F7FA]', 'text-[#17202A]')}`}>Create Account</h2>
          <p className="text-slate-400 text-sm">Sign up to get started</p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/50 text-rose-400 text-sm p-3 rounded-xl mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Full Name</label>
            <div className={`flex items-center px-4 py-3 rounded-2xl border-0 ${style('neu-inset-dark', 'neu-inset-light')}`}>
              <User className="h-4 w-4 text-slate-400 mr-3" />
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="John Doe"
                className={`bg-transparent outline-none w-full text-sm ${style('text-[#F4F7FA]', 'text-[#17202A]')}`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Email Address</label>
            <div className={`flex items-center px-4 py-3 rounded-2xl border-0 ${style('neu-inset-dark', 'neu-inset-light')}`}>
              <Mail className="h-4 w-4 text-slate-400 mr-3" />
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="john@example.com"
                className={`bg-transparent outline-none w-full text-sm ${style('text-[#F4F7FA]', 'text-[#17202A]')}`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Password</label>
            <div className={`flex items-center px-4 py-3 rounded-2xl border-0 ${style('neu-inset-dark', 'neu-inset-light')}`}>
              <Lock className="h-4 w-4 text-slate-400 mr-3" />
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className={`bg-transparent outline-none w-full text-sm ${style('text-[#F4F7FA]', 'text-[#17202A]')}`}
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className={`mt-4 py-3 px-6 rounded-2xl font-bold flex justify-center items-center transition-all cursor-pointer border-0 ${
              style(
                'neu-btn-dark text-[#5EEAD4] hover:shadow-[0_0_15px_rgba(94,234,212,0.2)]',
                'bg-[#5EEAD4] text-[#0A0E14]',
                'neu-btn-light text-[#0F766E]',
                'bg-[#0F766E] text-white'
              )
            }`}
          >
            {loading ? 'Creating...' : 'Create Account'}
            {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
          </button>
        </form>

        <div className="mt-8 text-center text-sm">
          <span className="text-slate-400">Already have an account? </span>
          <button 
            onClick={onNavigateLogin}
            className={`font-bold transition-colors cursor-pointer bg-transparent border-0 ${style('text-[#5EEAD4] hover:underline', 'text-[#0F766E] hover:underline')}`}
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
};
