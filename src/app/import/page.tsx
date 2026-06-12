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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">匯入藥品清單</h1>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">清單名稱</label>
            <input
              type="text"
              value={manifestName}
              onChange={(e) => setManifestName(e.target.value)}
              placeholder="例如: 2026-06-12 早班清點"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">藥品數據 (JSON 格式)</label>
            <textarea
              value={jsonData}
              onChange={(e) => setJsonData(e.target.value)}
              rows={10}
              className="w-full p-3 font-mono text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50"
            />
            <p className="text-xs text-gray-500">
              格式要求: <code>{"[{\"barcode\": \"...\", \"name\": \"...\", \"expected_quantity\": 0}, ... ]"}</code>
            </p>
          </div>

          <button
            onClick={handleImport}
            disabled={status === 'loading'}
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-all flex items-center justify-center gap-2"
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
          <div className={`p-4 rounded-lg border flex items-start gap-3 ${
            status === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {status === 'success' ? <CheckCircle2 className="w-5 h-5 mt-0.5" /> : <AlertCircle className="w-5 h-5 mt-0.5" />}
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
