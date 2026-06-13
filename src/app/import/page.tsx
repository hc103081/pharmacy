'use client';

import React, { useState } from 'react';
import { importDrugs, ImportDrugItem } from '@/app/actions/import';
import { FileUp, Loader2, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ImportPage() {
  const [manifestName, setManifestName] = useState('');
  const [jsonData, setJsonData] = useState('[\n  { "barcode": "12345678", "name": "藥品 A", "expected_quantity": 10 },\n  { "barcode": "87654321", "name": "藥品 B", "expected_quantity": 5 }\n]');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleImport = async () => {
    if (!manifestName) {
      alert('請輸入清單名稱');
      return;
    }

    try {
      const drugs: ImportDrugItem[] = JSON.parse(jsonData);
      setStatus('loading');
      setMessage('正在匯入並進行分頁處理...');

      const result = await importDrugs(manifestName, drugs);

      if (result.success) {
        setStatus('success');
        setMessage(`匯入成功！共匯入 ${result.totalItems} 項藥品。清單 ID: ${result.manifestId}`);
      } else {
        setStatus('error');
        setMessage(`匯入失敗: ${result.error}`);
      }
    } catch (e) {
      setStatus('error');
      setMessage('JSON 格式錯誤，請檢查輸入內容');
    }
  };

  return (
    <div className="min-h-screen bg-[#07142b] text-slate-200 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-slate-400" />
          </Link>
          <h1 className="text-2xl font-bold text-white">匯入藥品清單</h1>
        </div>

        <div className="tech-card p-6 space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-400">清單名稱</label>
            <input
              id="manifest-name"
              name="manifestName"
              type="text"
              value={manifestName}
              onChange={(e) => setManifestName(e.target.value)}
              placeholder="例如: 2026-06-12 早班清點"
              className="tech-input w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-400">藥品數據 (JSON 格式)</label>
            <textarea
              id="json-data"
              name="jsonData"
              value={jsonData}
              onChange={(e) => setJsonData(e.target.value)}
              rows={10}
              className="tech-input w-full font-mono text-sm bg-slate-950/50"
            />
          </div>

          <button
            onClick={handleImport}
            disabled={status === 'loading'}
            className={`tech-button w-full py-3 ${
              status === 'loading' ? 'bg-slate-700 text-slate-400' : 'tech-button-primary'
            }`}
          >
            {status === 'loading' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                處理中...
              </>
            ) : (
              <>
                <FileUp className="w-5 h-5" />
                立即匯入並分頁
              </>
            )}
          </button>
        </div>

        {status !== 'idle' && (
          <div className={`p-4 rounded-xl border flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 ${
            status === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            {status === 'success' ? <CheckCircle2 className="w-5 h-5 mt-0.5" /> : <AlertCircle className="w-5 h-5 mt-0.5" />}
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
