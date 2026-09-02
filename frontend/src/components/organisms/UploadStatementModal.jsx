import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { Button } from '../atoms/Button';
import { Select } from '../atoms/Select';
import { Upload, X, FileText, Briefcase, Landmark } from 'lucide-react';

export const UploadStatementModal = ({ isOpen, onClose }) => {
  const { style } = useTheme();
  const { banks, accounts, startDocumentUpload } = useFinance();

  const [documentType, setDocumentType] = useState('STATEMENT'); // 'STATEMENT' or 'PAYSLIP'
  const [fileType, setFileType] = useState('PDF');
  const [bankId, setBankId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [engine, setEngine] = useState('Local AI LLM (Fallback)');
  const [pdfPassword, setPdfPassword] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);

  const handleClose = () => {
    setSelectedFiles([]);
    setPdfPassword('');
    setAccountId('');
    setBankId('');
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) return;
    if (documentType === 'STATEMENT' && (!accountId || !bankId)) return;

    // Immediately trigger background upload and close modal
    startDocumentUpload({
      documentType,
      bankId: documentType === 'STATEMENT' ? bankId : undefined,
      accountId: documentType === 'STATEMENT' ? accountId : undefined,
      fileType,
      processingEngine: documentType === 'PAYSLIP' ? 'Local AI LLM (Fallback)' : engine,
      files: selectedFiles,
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
                Import Document
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

        {/* Tab Selection */}
        <div className={`flex items-center p-1 rounded-xl ${style('neu-inset-dark', 'neu-inset-light')}`}>
          <button 
            type="button"
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer ${documentType === 'STATEMENT' ? style('neu-flat-dark text-white', 'neu-flat-light text-slate-800') : 'bg-transparent text-slate-400 hover:text-slate-300'}`}
            onClick={() => setDocumentType('STATEMENT')}
          >
            <Landmark className="h-3.5 w-3.5" /> Bank Statement
          </button>
          <button 
            type="button"
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer ${documentType === 'PAYSLIP' ? style('neu-flat-dark text-white', 'neu-flat-light text-slate-800') : 'bg-transparent text-slate-400 hover:text-slate-300'}`}
            onClick={() => setDocumentType('PAYSLIP')}
          >
            <Briefcase className="h-3.5 w-3.5" /> Salary Payslip
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
            {documentType === 'STATEMENT' && (
              <>
                <option value="CSV">CSV Data File</option>
                <option value="XLSX">Excel (XLSX)</option>
                <option value="XLS">Excel (XLS)</option>
              </>
            )}
          </Select>

          {documentType === 'STATEMENT' && (
            <>
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
            </>
          )}

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
                Provide if your {documentType === 'STATEMENT' ? 'bank statement' : 'payslip'} is password-protected.
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {documentType === 'STATEMENT' ? '5. Select Statement File(s)' : '2. Select Payslip File(s)'}
            </span>
            <input
              type="file"
              required
              multiple
              accept={
                fileType === 'PDF' ? '.pdf,application/pdf'
                  : fileType === 'CSV' ? '.csv,text/csv'
                  : '.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              }
              onChange={e => setSelectedFiles(Array.from(e.target.files))}
              className={`block w-full text-xs text-slate-400 rounded-xl px-3 py-2 border-0 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600/15 file:text-indigo-400 hover:file:bg-indigo-600/25 file:cursor-pointer ${style('neu-inset-dark', 'neu-inset-light')}`}
            />
            {selectedFiles.length > 0 && (
              <span className="text-[10px] font-medium text-emerald-500 mt-1">
                {selectedFiles.length} file(s) selected
              </span>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-3 mt-2 border-t pt-3 border-slate-800/10">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={selectedFiles.length === 0 || (documentType === 'STATEMENT' && (!accountId || !bankId))}
            >
              Analyze {documentType === 'STATEMENT' ? 'Statement' : 'Payslips'}
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
};
