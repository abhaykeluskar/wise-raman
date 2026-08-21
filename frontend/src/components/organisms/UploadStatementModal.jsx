import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { Button } from '../atoms/Button';
import { Select } from '../atoms/Select';
import { Upload, X, FileText } from 'lucide-react';

export const UploadStatementModal = ({ isOpen, onClose }) => {
  const { style } = useTheme();
  const { banks, accounts, startStatementUpload } = useFinance();

  const [fileType, setFileType] = useState('PDF');
  const [bankId, setBankId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [engine, setEngine] = useState('Local AI LLM (Fallback)');
  const [pdfPassword, setPdfPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const handleClose = () => {
    setSelectedFile(null);
    setPdfPassword('');
    setAccountId('');
    setBankId('');
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedFile || !accountId || !bankId) return;

    // Immediately trigger background upload and close modal
    startStatementUpload({
      bankId,
      accountId,
      fileType,
      processingEngine: engine,
      file: selectedFile,
      pdfPassword: pdfPassword.trim()
    });

    handleClose();
  };

  const filteredBanks = banks.filter(b => accounts.some(a => String(a.bank_id) === String(b.id)));
  const filteredAccounts = accounts.filter(a => String(a.bank_id) === String(bankId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className={`w-full max-w-md p-6 rounded-2xl flex flex-col gap-4 border-0 shadow-2xl transition-all ${style('neu-flat-dark', 'neu-flat-light')}`}>
        
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-3 border-slate-800/10">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${style('neu-inset-dark text-[#FF7E67]', 'neu-inset-light text-[#4A90E2]')}`}>
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                Import Bank Statement
              </h3>
              <span className="text-xs text-slate-400 font-normal">
                Non-blocking background extraction
              </span>
            </div>
          </div>

          <button 
            type="button" 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-xl border-0 bg-transparent cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          
          <Select
            label="1. File Format"
            value={fileType}
            onChange={e => setFileType(e.target.value)}
          >
            <option value="PDF">PDF Document (Digital / Scanned)</option>
            <option value="CSV">CSV Data File</option>
            <option value="XLSX">Excel (XLSX)</option>
          </Select>

          <Select
            label="2. Select Bank"
            value={bankId}
            onChange={e => {
              setBankId(e.target.value);
              setAccountId('');
            }}
          >
            <option value="">-- Select Bank --</option>
            {filteredBanks.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>

          <Select
            label="3. Select Account / Card"
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            disabled={!bankId}
          >
            <option value="">-- Select Account / Card --</option>
            {filteredAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.subtype})</option>
            ))}
          </Select>

          <Select
            label="4. Ingestion Engine"
            value={engine}
            onChange={e => setEngine(e.target.value)}
          >
            <option value="Standard Algo Parser">⚡ Standard Deterministic Parser (Instant)</option>
            <option value="Local AI LLM (Fallback)">🧠 Local AI Engine (Qwen2.5:3b - JSON Schema)</option>
          </Select>

          {fileType === 'PDF' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                PDF Password (Optional)
              </label>
              <input
                type="password"
                placeholder="e.g. PAN (ABCDE1234F) or DOB (DDMMYYYY)"
                value={pdfPassword}
                onChange={e => setPdfPassword(e.target.value)}
                className={`w-full rounded-xl px-3 py-2 text-xs focus:outline-none border-0 ${style('neu-inset-dark text-[#EAEAEA]', 'neu-inset-light text-[#2D3436]')}`}
              />
              <span className="text-[10px] text-slate-400">
                Most Indian bank/card statements are password-protected with PAN or DOB
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              5. Select Statement File
            </span>
            <input
              type="file"
              required
              onChange={e => setSelectedFile(e.target.files[0])}
              className={`block w-full text-xs text-slate-400 rounded-xl px-3 py-2 border-0 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600/15 file:text-indigo-400 hover:file:bg-indigo-600/25 file:cursor-pointer ${style('neu-inset-dark', 'neu-inset-light')}`}
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-3 mt-2 border-t pt-3 border-slate-800/10">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!selectedFile || !accountId || !bankId}
            >
              Analyze Statement
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
};
