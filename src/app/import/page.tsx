'use client';

import React, { useState } from 'react';
import { importDrugs, uploadImportImages, processImagesWithGemini, ImportDrugItem, deleteImportImages } from '@/app/actions/import';
import { FileUp, Loader2, CheckCircle2, AlertCircle, ArrowLeft, Image as ImageIcon, X, UploadCloud, FileType, RotateCcw, Cpu, Upload, ScanLine } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { parsePdf, ParsedPdf, ParsedItem, PdfProgressStep } from '@/lib/pdfParser';
import { validateParsedPdf } from '@/lib/pdfValidator';
import PreviewPanel from './components/PreviewPanel';

/** 步驟對應的 icon */
const STEP_ICONS: Record<PdfProgressStep['step'], React.ReactNode> = {
  converting: <FileType className="w-5 h-5 text-cyan-400" />, 
  merging: <ScanLine className="w-5 h-5 text-cyan-400" />, 
  uploading: <Upload className="w-5 h-5 text-cyan-400" />, 
  header: <Cpu className="w-5 h-5 text-cyan-400" />, 
  batch: <Cpu className="w-5 h-5 text-[#00f2fe] animate-pulse" />, 
  done: <CheckCircle2 className="w-5 h-5 text-green-400" />, 
};

export default function ImportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [manifestName, setManifestName] = useState('');
  const [jsonData, setJsonData] = useState('');
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // PDF specific states
  const [parsedData, setParsedData] = useState<ParsedPdf | null>(null);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<PdfProgressStep | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedImages(prev => [...prev, ...files]);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      alert('請選擇 PDF 檔案');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStatus('error');
      setMessage('PDF 檔案太大 (超過 10MB)');
      return;
    }
    setIsParsingPdf(true);
    setStatus('loading');
    setPdfProgress(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = await parsePdf(new Uint8Array(arrayBuffer.slice(0)), (progress) => {
        setPdfProgress(progress);
      });
      validateParsedPdf(data);
      setParsedData(data);
      setManifestName(data.order_metadata.order_number || '');
      setStatus('idle');
      setMessage('');
      setPdfProgress(null);
    } catch (error: unknown) {
      console.error('PDF Upload/Parse Error:', error);
      setStatus('error');
      setMessage(`PDF 處理失敗: ${error.message}`);
      setPdfProgress(null);
    } finally {
      setIsParsingPdf(false);
    }
  };

  const handlePdfRetry = () => {
    setParsedData(null);
    setManifestName('');
    setPdfProgress(null);
    setStatus('idle');
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

  const handleImport = async (items?: ParsedItem[]) => {
    if (!manifestName) {
      alert('請輸入清單名稱');
      return;
    }
    try {
      setStatus('loading');
      let drugs: ImportDrugItem[] = [];
      if (parsedData) {
        const sourceItems = items || parsedData.items;
        drugs = sourceItems.map(item => ({
          barcode: item.barcode,
          name: item.drug_name,
          expected_quantity: item.quantity + item.bonus_quantity,
          bonus_quantity: item.bonus_quantity
        }));
        const result = await importDrugs(manifestName, drugs, user!.id, {
          order_number: parsedData.order_metadata.order_number,
          delivery_date: parsedData.order_metadata.delivery_date,
          source_file: ''
        });
        if (result.success) {
          setStatus('success');
          setMessage(`匯入成功！共匯入 ${result.totalItems} 項藥品。正在跳轉至清點面板...`);
          setTimeout(() => router.push(`/scan?manifestId=${result.manifestId}`), 2000);
        } else {
          setStatus('error');
          setMessage(`匯入失敗: ${result.error}`);
        }
        return;
      } else if (uploadedUrls.length > 0) {
        setMessage('正在執行 AI OCR 辨識中...');
        const ocrResult = await processImagesWithGemini({ urls: uploadedUrls });
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
      const result = await importDrugs(manifestName, drugs, user!.id, { source_images: uploadedUrls });
      if (result.success) {
        setStatus('success');
        setMessage(`匯入成功！共匯入 ${result.totalItems} 項藥品。正在跳轉至清點面板...`);
        setTimeout(() => router.push(`/scan?manifestId=${result.manifestId}`), 2000);
      } else {
        setStatus('error');
        setMessage(`匯入失敗: ${result.error}`);
      }
    } catch (e) {
      setStatus('error');
      setMessage('匯入過程中發生錯誤，請檢查數據格式');
    }
  };

  const handleReset = async () => {
    if (confirm('確定要重置所有匯入資訊並取消目前的處理嗎？')) {
      if (uploadedUrls.length > 0) {
        try {
          setStatus('loading');
          setMessage('正在清理已上傳的檔案...');
          await deleteImportImages(uploadedUrls);
        } catch (e) {
          console.error('Cleanup error:', e);
        }
      }
      setManifestName('');
      setJsonData('');
      setSelectedImages([]);
      setUploadedUrls([]);
      setParsedData(null);
      setPdfProgress(null);
      setStatus('idle');
      setMessage('');
    }
  };

  return (
    <div>
      <div className={`max-w-3xl mx-auto ${parsedData ? 'flex flex-col h-full' : 'space-y-5 lg:space-y-6'}`}>
        <div className="flex-shrink-0 flex items-center gap-3">
          <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6 text-slate-400" />
          </Link>
          <h1 className="text-xl lg:text-2xl font-bold text-white">匯入藥品清單</h1>
        </div>


        {parsedData ? (
          <div className="flex-1 min-h-0">
            <PreviewPanel 
              data={parsedData}
              validation={validateParsedPdf(parsedData)}
              onConfirm={handleImport}
              onRetry={handlePdfRetry}
              isLoading={isParsingPdf}
            />
          </div>
) : (
          <div className="space-y-5 lg:space-y-6">
            <div className="tech-card p-4 lg:p-6 space-y-5 lg:space-y-6">
              <div className="space-y-2">
                <label className="block text-xs lg:text-sm font-medium text-slate-400">清單名稱</label>
                <input
                  type="text"
                  value={manifestName}
                  onChange={(e) => setManifestName(e.target.value)}
                  placeholder="例如: 2026-06-12 早班清點"
                  className="tech-input w-full text-sm lg:text-base"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* PDF Upload Section */}
                <div className="space-y-3">
                  <label className="block text-xs lg:text-sm font-medium text-slate-400">方式 1: PDF 出貨單 (自動解析)</label>
                  <div className="relative group">
                    <input
                      type="file"
                      accept=".pdf"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      onChange={handlePdfUpload}
                      disabled={isParsingPdf}
                    />
                    <div className={`border-2 border-dashed border-slate-700 rounded-xl p-6 text-center transition-colors group-hover:border-cyan-500/50 bg-slate-900/30 ${isParsingPdf ? 'opacity-50' : ''}`}>
                      <FileType className="w-10 h-10 text-slate-500 mx-auto mb-3 group-hover:text-cyan-400 transition-colors" />
                      <p className="text-slate-300 font-medium text-sm">上傳 PDF 檔案</p>
                      <p className="text-[11px] text-slate-500 mt-1">自動提取條碼與數量</p>
                    </div>
                  </div>
                </div>
                {/* Screenshot Upload Section */}
                <div className="space-y-3">
                  <label className="block text-xs lg:text-sm font-medium text-slate-400">方式 2: 截圖 (AI OCR)</label>
                  <div 
                    className="border-2 border-dashed border-slate-700 rounded-xl p-6 text-center hover:border-cyan-500/50 transition-colors group cursor-pointer relative bg-slate-900/30"
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
                    <UploadCloud className="w-10 h-10 text-slate-500 mx-auto mb-3 group-hover:text-cyan-400 transition-colors" />
                    <p className="text-slate-300 font-medium text-sm">上傳截圖</p>
                    <p className="text-[11px] text-slate-500 mt-1">支援 JPG, PNG</p>
                  </div>
                </div>
              </div>
              {/* PDF 解析進度面板 */}
              {isParsingPdf && pdfProgress && (
                <div className="tech-card p-4 lg:p-5 space-y-4 border-cyan-500/30 animate-in fade-in slide-in-from-bottom-2 relative overflow-hidden animate-scanline">
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#00f2fe]/60 to-transparent" />
                  <div className="flex items-center gap-3 relative z-10">
                    <div className={`relative ${pdfProgress.step === 'batch' ? 'animate-pulse-glow' : ''} rounded-lg p-1.5`}>{STEP_ICONS[pdfProgress.step]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{pdfProgress.label}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {pdfProgress.step === 'converting' && '將 PDF 頁面渲染為高清圖片'}
                        {pdfProgress.step === 'merging' && '每 3 頁合併為一張，減少 API 呼叫次數'}
                        {pdfProgress.step === 'uploading' && '上傳至雲端儲存空間'}
                        {pdfProgress.step === 'header' && 'Gemini AI 正在辨識出貨單號與日期'}
                        {pdfProgress.step === 'batch' && 'Gemini AI 正在辨識藥品條碼、品名與數量'}
                        {pdfProgress.step === 'done' && '所有步驟完成'}
                      </p>
                    </div>
                    <span className="text-[#00f2fe] font-mono text-lg font-bold tabular-nums">{pdfProgress.percent}%</span>
                  </div>
                  <div className="relative h-2.5 bg-slate-800/80 rounded-full overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-[#00f2fe] rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${pdfProgress.percent}%` }}
                    />
                    <div 
                      className="absolute top-1/2 -translate-y-1/2 w-6 h-4 bg-white/30 blur-sm rounded-full transition-all duration-500 ease-out"
                      style={{ left: `calc(${pdfProgress.percent}% - 12px)` }}
                    />
                    <div className="absolute inset-0 overflow-hidden">
                      <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-particle-flow" />
                    </div>
                    {pdfProgress.step === 'batch' && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                    )}
          
                  </div>
                  <div className="flex items-center gap-0 relative z-10">
                    {(['converting', 'merging', 'uploading', 'header', 'batch'] as const).map((s, i, arr) => {
                      const stepOrder = ['converting', 'merging', 'uploading', 'header', 'batch', 'done'] as const;
                      const currentIdx = stepOrder.indexOf(pdfProgress.step);
                      const thisIdx = stepOrder.indexOf(s);
                      const isCompleted = thisIdx < currentIdx || (pdfProgress.step === 'done');
                      const isCurrent = pdfProgress.step === s;
                      return (
                        <React.Fragment key={s}>
                          <div className="flex flex-col items-center gap-1.5 flex-1">
                            <div className={`w-3 h-3 rounded-full transition-all duration-500 flex items-center justify-center ${
                              isCompleted ? 'bg-[#00f2fe] shadow-[0_0_8px_rgba(0,242,254,0.6)]' :
                              isCurrent ? 'bg-[#00f2fe] animate-pulse-glow' :
                              'bg-slate-700'
                            }`}>
                              {isCompleted && (
                                <svg className="w-2 h-2 text-slate-900 animate-check-pop" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                            <span className={`text-[9px] leading-tight text-center transition-colors duration-300 ${
                              isCompleted ? 'text-[#00f2fe]' :
                              isCurrent ? 'text-slate-300' :
                              'text-slate-600'
                            }`}>{{
                              converting: '轉圖',
                              merging: '合併',
                              uploading: '上傳',
                              header: '表頭',
                              batch: '辨識'
                            }[s]}</span>
                          </div>
                          {i < arr.length - 1 && (
                            <div className={`h-px flex-1 -mt-4 transition-colors duration-300 ${
                              isCompleted ? 'bg-[#00f2fe]/60 animate-line-glow' :
                              isCurrent ? 'bg-slate-600' :
                              'bg-slate-800'
                            }`} />
                          )}
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
              )}
              {status === 'error' && (
                <div className="mt-3 p-2 bg-red-600 rounded text-center">
                  {message}
                  <button
                    className="ml-2 px-3 py-1 bg-[#00f2fe] rounded-full active:scale-95"
                    onClick={handlePdfRetry}
                  >
                    重新上傳 PDF
                  </button>
                </div>
              )}
              {/* Preview uploaded images */}
              {(selectedImages.length > 0 || uploadedUrls.length > 0) && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-slate-500">已選取圖片：</p>
                  <div className="grid grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
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
                  <button
                    onClick={handleUploadImages}
                    disabled={status === 'loading'}
                    className="tech-button w-full py-2.5 text-sm flex items-center justify-center gap-2"
                  >
                    {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                    上傳 {selectedImages.length} 張圖片
                  </button>
                </div>
              )}
              <div className="relative py-3">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-800"></span></div>
                <div className="relative flex justify-center text-[11px] uppercase"><span className="bg-[#07142b] px-2 text-slate-500">或者使用 JSON 快速匯入</span></div>
              </div>
              <div className="space-y-2">
                <label className="block text-xs lg:text-sm font-medium text-slate-400">藥品數據 (JSON 格式)</label>
                <textarea
                  value={jsonData}
                  onChange={(e) => setJsonData(e.target.value)}
                  rows={6}
                  placeholder={`[\n  { "barcode": "12345678", "name": "藥品名稱", "expected_quantity": 10 }\n]`}
                  className="tech-input w-full font-mono text-xs lg:text-sm bg-slate-950/50"
                />
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleImport()}
                  disabled={status === 'loading'}
                  className={`tech-button w-full py-3 ${status === 'loading' ? 'bg-slate-700 text-slate-400' : 'tech-button-primary'}`}
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
                <button
                  onClick={handleReset}
                  disabled={status === 'loading'}
                  className="text-slate-500 hover:text-red-400 text-sm font-medium transition-colors flex items-center justify-center gap-2 py-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  重置所有資訊
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
