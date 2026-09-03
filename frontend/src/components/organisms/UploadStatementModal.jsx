import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { Button } from '../atoms/Button';
import { Upload, X, FileText, Briefcase, Landmark } from 'lucide-react';

export const UploadStatementModal = ({ isOpen, onClose }) => {
  const { theme } = useTheme();
  const { banks, accounts, startDocumentUpload } = useFinance();
  const isDark = theme === 'dark';

  const [documentType, setDocumentType] = useState('STATEMENT'); // 'STATEMENT' or 'PAYSLIP'
  const [fileType, setFileType] = useState('PDF');
  const [bankId, setBankId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [engine, setEngine] = useState('Standard Algo Parser');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={handleClose}
      />

      {/* Modal Card */}
      <div className={`relative w-full max-w-md rounded-[16px] p-6 border shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 ${
        isDark ? 'bg-[#171E19] border-[#2A352D] text-[#F1F5F2]' : 'bg-[#FFFFFF] border-[#E4E8E3] text-[#1D2822]'
      }`}>
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-[#E4E8E3]/20 mb-4">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-[8px] ${
              isDark ? 'bg-[#1C251F] text-[#7FC39A]' : 'bg-[#F1F8F4] text-[#3F8F5E]'
            }`}>
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Import Document</h3>
              <p className="text-[11px] text-[#8B978F]">Local background extraction without cloud sync</p>
            </div>
          </div>

          <button 
            type="button" 
            onClick={handleClose}
            className="p-1 text-[#8B978F] hover:text-foreground border-0 bg-transparent cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className={`flex items-center p-1 rounded-[10px] border mb-4 ${
          isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
        }`}>
          <button 
            type="button"
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-[8px] text-xs font-semibold transition-all border-0 cursor-pointer ${
              documentType === 'STATEMENT'
                ? 'bg-[#3F8F5E] text-white shadow-xs'
                : isDark ? 'bg-transparent text-[#8B978F] hover:text-[#F1F5F2]' : 'bg-transparent text-[#7B877F] hover:text-[#1D2822]'
            }`}
            onClick={() => setDocumentType('STATEMENT')}
          >
            <Landmark className="h-3.5 w-3.5" /> Bank Statement
          </button>
          <button 
            type="button"
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-[8px] text-xs font-semibold transition-all border-0 cursor-pointer ${
              documentType === 'PAYSLIP'
                ? 'bg-[#3F8F5E] text-white shadow-xs'
                : isDark ? 'bg-transparent text-[#8B978F] hover:text-[#F1F5F2]' : 'bg-transparent text-[#7B877F] hover:text-[#1D2822]'
            }`}
            onClick={() => setDocumentType('PAYSLIP')}
          >
            <Briefcase className="h-3.5 w-3.5" /> Salary Payslip
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          
          <div>
            <label className="font-semibold block mb-1">1. File Format</label>
            <select
              value={fileType}
              onChange={e => setFileType(e.target.value)}
              className={`w-full px-3 py-2 text-xs rounded-[10px] border outline-none cursor-pointer ${
                isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
              }`}
            >
              <option value="PDF">PDF Document (Digital / Scanned)</option>
              {documentType === 'STATEMENT' && (
                <>
                  <option value="CSV">CSV Data File</option>
                  <option value="XLSX">Excel (XLSX)</option>
                  <option value="XLS">Excel (XLS)</option>
                </>
              )}
            </select>
          </div>

          {documentType === 'STATEMENT' && (
            <>
              <div>
                <label className="font-semibold block mb-1">2. Select Bank</label>
                <select
                  value={bankId}
                  onChange={e => {
                    setBankId(e.target.value);
                    setAccountId('');
                  }}
                  className={`w-full px-3 py-2 text-xs rounded-[10px] border outline-none cursor-pointer ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                >
                  <option value="">-- Select Bank --</option>
                  {filteredBanks.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">3. Select Account / Card</label>
                <select
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  disabled={!bankId}
                  className={`w-full px-3 py-2 text-xs rounded-[10px] border outline-none cursor-pointer ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                >
                  <option value="">-- Select Account / Card --</option>
                  {filteredAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.subtype})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">4. Ingestion Engine</label>
                <select
                  value={engine}
                  onChange={e => setEngine(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-[10px] border outline-none cursor-pointer ${
                    isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                  }`}
                >
                  <option value="Standard Algo Parser">⚡ Deterministic Parser (Zero Error / Instant)</option>
                  <option value="Local AI LLM (Fallback)">🧠 Local AI Engine (Qwen2.5:3b - JSON Schema)</option>
                </select>
              </div>
            </>
          )}

          {fileType === 'PDF' && (
            <div>
              <label className="font-semibold block mb-1">PDF Password (Optional)</label>
              <input
                type="password"
                placeholder="e.g. PAN (ABCDE1234F) or DOB (DDMMYYYY)"
                value={pdfPassword}
                onChange={e => setPdfPassword(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-[10px] border outline-none ${
                  isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
                }`}
              />
              <span className="text-[10px] text-[#8B978F] mt-1 block">
                Provide if your {documentType === 'STATEMENT' ? 'bank statement' : 'payslip'} is password-protected.
              </span>
            </div>
          )}

          <div>
            <label className="font-semibold block mb-1">
              {documentType === 'STATEMENT' ? '5. Select Statement File(s)' : '2. Select Payslip File(s)'}
            </label>
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
              className={`block w-full text-xs text-[#8B978F] rounded-[10px] p-2 border ${
                isDark ? 'bg-[#1C251F] border-[#2A352D]' : 'bg-[#FBFCFA] border-[#E4E8E3]'
              }`}
            />
            {selectedFiles.length > 0 && (
              <span className="text-[11px] font-semibold text-[#3F8F5E] mt-1 block">
                ✓ {selectedFiles.length} file(s) selected
              </span>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t border-[#E4E8E3]/20">
            <Button variant="secondary" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
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
