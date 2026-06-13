'use client';

import React, { useState, useCallback } from 'react';
import { importDrugs, uploadImportImages, processImagesWithGemini, ImportDrugItem } from '@/app/actions/import';
import { FileUp, Loader2, CheckCircle2, AlertCircle, ArrowLeft, Image as ImageIcon, X, UploadCloud } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function ImportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [manifestName, setManifestName] = useState('');
  const [jsonData, setJsonData] = useState('');
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedImages(prev => [...prev, ...files]);
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadImages = async () => {
    if (selectedImages.length === 0) return;
    
    setStatus('loading');
    setMessage('正在上傳圖片至伺服器...');
    
    const formData = new FormData();
    selectedImages.forEach(file => formData.append('files', file));

    try {
      const result = await uploadImportImages(formData);
      if (result.success && result.urls) {
        setUploadedUrls(result.urls);
        setSelectedImages([]);
        setStatus('idle');
        setMessage('圖片上傳成功！');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setStatus('error');
        setMessage(`上傳失敗: ${result.error}`);
      }
    } catch (e) {
      setStatus('error');
      setMessage('圖片上傳過程中發生錯誤');
    }
  };

  const handleImport = async () => {
    if (!manifestName) {
      alert('請輸入清單名稱');
      return;
    }

    try {
      setStatus('loading');
      let drugs: ImportDrugItem[] = [];

      if (uploadedUrls.length > 0) {
        setMessage('正在執行 AI OCR 辨識中...');
        const ocrResult = await processImagesWithGemini(uploadedUrls);
        if (!ocrResult.success) {
          setStatus('error');
          setMessage(`OCR 辨識失敗: ${ocrResult.error}`);
          return;
        }
        drugs = ocrResult.drugs || [];
      } else {
        setMessage('正在從 JSON 匯入數據...');
        drugs = JSON.parse(jsonData);
      }

      if (drugs.length === 0) {
        setStatus('error');
        setMessage('沒有可匯入的藥品數據');
        return;
      }

      setMessage('正在匯入並進行分頁處理...');
      const result = await importDrugs(manifestName, drugs, user!.id, uploadedUrls);

      if (result.success) {
        setStatus('success');
        setMessage(`匯入成功！共匯入 ${result.totalItems} 項藥品。正在跳轉至清點面板...`);
        setTimeout(() => {
          router.push(`/scan?manifestId=${result.manifestId}`);
        }, 2000);
      } else {
        setStatus('error');
        setMessage(`匯入失敗: ${result.error}`);
      }
    } catch (e) {
      setStatus('error');
      setMessage('匯入過程中發生錯誤，請檢查數據格式');
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
              type="text"
              value={manifestName}
              onChange={(e) => setManifestName(e.target.value)}
              placeholder="例如: 2026-06-12 早班清點"
              className="tech-input w-full"
            />
          </div>

          {/* 圖片上傳區塊 */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-400">步驟 1: 上傳清單截圖 (OCR 辨識)</label>
            <div 
              className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center hover:border-cyan-500/50 transition-colors group cursor-pointer relative bg-slate-900/30"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) {
                  setSelectedImages(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
                }
              }}
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <input 
                id="file-upload"
                type="file" 
                multiple 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileChange} 
              />
              <UploadCloud className="w-12 h-12 text-slate-500 mx-auto mb-4 group-hover:text-cyan-400 transition-colors" />
              <p className="text-slate-300 font-medium">點擊或拖曳圖片至此上傳</p>
              <p className="text-xs text-slate-500 mt-2">支援 JPG, PNG, WebP 格式</p>
            </div>

            {/* 預覽區塊 */}
            {(selectedImages.length > 0 || uploadedUrls.length > 0) && (
              <div className="grid grid-cols-4 gap-4 mt-4">
                {selectedImages.map((file, i) => (
                  <div key={`sel-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-slate-700 group">
                    <img 
                      src={URL.createObjectURL(file)} 
                      alt="preview" 
                      className="w-full h-full object-cover" 
                    />
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {uploadedUrls.map((url, i) => (
                  <div key={`up-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-cyan-500/50">
                    <img src={url} alt="uploaded" className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 p-1 bg-cyan-500/80 text-[10px] text-white text-center">已上傳</div>
                  </div>
                ))}
              </div>
            )}

            {selectedImages.length > 0 && (
              <button
                onClick={handleUploadImages}
                disabled={status === 'loading'}
                className="tech-button w-full py-2 text-sm flex items-center justify-center gap-2"
              >
                {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                上傳 {selectedImages.length} 張圖片
              </button>
            )}
          </div>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-800"></span></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#07142b] px-2 text-slate-500">或者使用 JSON 快速匯入</span></div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-400">藥品數據 (JSON 格式)</label>
            <textarea
              value={jsonData}
              onChange={(e) => setJsonData(e.target.value)}
              rows={6}
              placeholder={`[\n  { "barcode": "12345678", "name": "藥品名稱", "expected_quantity": 10 }\n]`}
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
