import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { useToast } from '../../context/ToastContext';
import { TelemetryTerminal } from '../organisms/TelemetryTerminal';
import { Button } from '../atoms/Button';
import { Terminal, Database, Trash2 } from 'lucide-react';

export const DevToolsView = () => {
  const { style } = useTheme();
  const { authFetch, fetchData, setTransactions } = useFinance();
  const { toast, confirm } = useToast();
  const [isPurging, setIsPurging] = useState(false);

  const handlePurgeAll = async () => {
    const isConfirmed = await confirm({
      title: 'Purge All Database Data',
      message: 'Are you sure you want to purge all data? This cannot be undone.',
      confirmText: 'Purge Everything',
      isDanger: true
    });

    if (!isConfirmed) return;

    setIsPurging(true);
    try {
      const res = await authFetch('/api/dev/purge', { method: 'DELETE' });
      if (res.ok) {
        setTransactions([]);
        await fetchData();
        toast.success('Database purged successfully.', 'Database Reset');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to purge database.', 'Error');
      }
    } catch (err) {
      console.error("Error purging database:", err);
      toast.error('Network connection error while purging data.', 'Error');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 max-w-5xl mx-auto pb-16">
      <div className="flex items-center gap-2">
        <Terminal className={`h-5 w-5 ${style('text-[#FF7E67]', 'text-[#4A90E2]')}`} />
        <h2 className="text-base font-bold">Developer Tools</h2>
      </div>

      {/* Database Management */}
      <div className={`p-6 rounded-2xl border-0 flex flex-col gap-4 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex items-center gap-2 mb-2">
          <Database className="h-4 w-4 text-slate-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Database Management
          </h3>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-xs font-bold">Purge All Data</span>
            <span className="text-xs text-slate-400 font-normal">Wipe out all user data and reset the database</span>
          </div>
          <Button 
            variant="danger" 
            size="sm" 
            icon={Trash2} 
            onClick={handlePurgeAll}
            disabled={isPurging}
            className="shrink-0"
          >
            {isPurging ? 'Purging...' : 'Purge All Database Data'}
          </Button>
        </div>
      </div>

      {/* System Logs */}
      <div className={`p-6 rounded-2xl border-0 flex flex-col gap-6 transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-slate-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            System Logs
          </h3>
        </div>

        <div className="flex flex-col gap-6">
          <TelemetryTerminal 
            title="Backend Server Logs" 
            endpoint="/api/backend/logs" 
            isCollapsible={true} 
            defaultExpanded={true} 
          />
          <TelemetryTerminal 
            title="AI Engine Logs" 
            endpoint="/api/ai/logs" 
            isCollapsible={true} 
            defaultExpanded={true} 
          />
        </div>
      </div>
    </div>
  );
};
