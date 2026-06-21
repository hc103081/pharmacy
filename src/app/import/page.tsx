'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { importDrugs, processImagesWithGemini, ImportDrugItem, deleteImportImages } from '@/app/actions/import';
import { clientUploadImportImages } from '@/lib/clientUpload';
import { FileUp, Loader2, CheckCircle2, ArrowLeft, Image as ImageIcon, FileType, RotateCcw, Cpu, Upload, ScanLine, Database } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { parsePdf, ParsedPdf, ParsedItem, PdfProgressStep } from '@/lib/pdfParser';
import { validateParsedPdf } from '@/lib/pdfValidator';
import PreviewPanel from './components/PreviewPanel';
import { TeachingButton } from '@/components/teaching';
import DrugListUploader from './components/DrugListUploader';

/* sessionStorage 鍵名 */
const IMPORT_STATE_KEY = 'pharmacy_import_state';

interface ImportState {
  parsedData: ParsedPdf | null;
  manifestName: string;
  uploadedUrls: string[];
  jsonData: string;
}

/** 從 sessionStorage 讀取暫存的匯入狀態 */
function loadImportState(): ImportState | null {
  try {
    const raw = sessionStorage.getItem(IMPORT_STATE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as ImportState;
    if (!state.parsedData && !state.manifestName && state.uploadedUrls.length === 0 && !state.jsonData) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

/** 將匯入狀態寫入 sessionStorage */
function saveImportState(state: ImportState) {
  try {
    sessionStorage.setItem(IMPORT_STATE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage 寫入失敗（容量滿等）時忽略
  }
}

/** 清除 sessionStorage 中的匯入狀態 */
function clearImportState() {
  try {
    sessionStorage.removeItem(IMPORT_STATE_KEY);
  } catch {
    // 忽略
  }
}

/* 步驟對應的 icon */
const STEP_ICONS = {
  converting: <FileType className="w-5 h-5 text-cyan-400" />, 
  merging: <ScanLine className="w-5 h-5 text-cyan-400" />, 
  uploading: <Upload className="w-5 h-5 text-cyan-400" />, 
  header: <Cpu className="w-5 h-5 text-[#00f2fe]" />, 
  batch: <Cpu className="w-5 h-5 text-[#00f2fe] animate-pulse" />,
  done: <CheckCircle2 className="w-4 h-4 text-green-400" />
};

const PDF_STEP_LABELS: Record<string, string> = {
  converting: '轉圖',
  merging: '合併',
  uploading: '上傳',
  header: '表頭',
  batch: '辨識',
};

const PDF_STEPS = ['converting', 'merging', 'uploading', 'header', 'batch'] as const;

export default function ImportPage() {
  const router = useRouter();
  const { user } = useAuth();

  /* 初始化：優先從 sessionStorage 恢復上次的匯入狀態 */
  const [initialState] = useState<ImportState | null>(() => loadImportState());

  const [manifestName, setManifestName] = useState(initialState?.manifestName ?? '');
  const [jsonData, setJsonData] = useState(initialState?.jsonData ?? '');
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>(initialState?.uploadedUrls ?? []);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [parsedData, setParsedData] = useState<ParsedPdf | null>(initialState?.parsedData ?? null);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<PdfProgressStep | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  /* 每當關鍵狀態變更時，同步寫入 sessionStorage */
  useEffect(() => {
    saveImportState({ parsedData, manifestName, uploadedUrls, jsonData });
  }, [parsedData, manifestName, uploadedUrls, jsonData]);

  /* 頁面可見性恢復：當使用者從其他分頁切回來時，若狀態丟失則從 sessionStorage 恢復 */
  const stateRef = useRef({ parsedData, manifestName, uploadedUrls, jsonData });
  stateRef.current = { parsedData, manifestName, uploadedUrls, jsonData };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const saved = loadImportState();
        if (saved) {
          // 只恢復那些當前為空的狀態，避免覆蓋使用者操作
          if (!stateRef.current.parsedData && saved.parsedData) {
            setParsedData(saved.parsedData);
          }
          if (!stateRef.current.manifestName && saved.manifestName) {
            setManifestName(saved.manifestName);
          }
          if (stateRef.current.uploadedUrls.length === 0 && saved.uploadedUrls.length > 0) {
            setUploadedUrls(saved.uploadedUrls);
          }
          if (!stateRef.current.jsonData && saved.jsonData) {
            setJsonData(saved.jsonData);
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const handlePdfSelect = useCallback(async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      setStatus('error');
      setMessage('PDF 檔案太大 (超過 20MB)');
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
      let errorMessage = 'PDF 處理失敗';
      if (error instanceof Error) {
        errorMessage = error.message;
        // 提供更明確的建議
        if (errorMessage.includes('GOOGLE_API_KEY') || errorMessage.includes('未配置')) {
          errorMessage = '伺服器未設定 AI API 金鑰 (GOOGLE_API_KEY)，請在 Vercel 專案設定中新增此環境變數';
        } else if (errorMessage.includes('上傳失敗') || errorMessage.includes('upload')) {
          errorMessage = `圖片上傳失敗: ${errorMessage}。請確認 Supabase Storage 的 import_screenshots bucket 已建立且服務正常運作`;
        }
        // 若為 503/429 等暫時性 AI 錯誤，friendlyGeminiError 已在前端轉換為友善訊息，直接顯示即可
      }
      setMessage(`PDF 處理失敗: ${errorMessage}`);
      setPdfProgress(null);
    } finally {
      setIsParsingPdf(false);
    }
  }, []);

  const handleImagesSelect = useCallback((files: File[]) => {
    setSelectedImages(prev => [...prev, ...files]);
  }, []);

  const handlePdfRetry = () => {
    setParsedData(null);
    setManifestName('');
    setPdfProgress(null);
    setStatus('idle');
    clearImportState();
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadImages = async () => {
    if (selectedImages.length === 0) return;
    setStatus('loading');
    setMessage('正在上傳圖片至伺服器...');
    try {
      const result = await clientUploadImportImages(selectedImages);
      setUploadedUrls(result.urls);
      setSelectedImages([]);
      setStatus('idle');
      setMessage('圖片上傳成功！');
      setTimeout(() => setMessage(''), 3000);
    } catch {
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
      setIsImporting(true);
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
          setIsImporting(false);
          setStatus('success');
          setMessage(`匯入成功！共匯入 ${result.totalItems} 項藥品。正在跳轉至清點面板...`);
          clearImportState();
          setTimeout(() => router.push(`/scan?manifestId=${result.manifestId}`), 2000);
        } else {
          setIsImporting(false);
          setStatus('error');
          setMessage(`匯入失敗: ${result.error}`);
        }
        return;
      } else if (uploadedUrls.length > 0) {
        setMessage('正在執行 AI OCR 辨識中...');
        const ocrResult = await processImagesWithGemini({ urls: uploadedUrls });
        if (!ocrResult.success) {
          setIsImporting(false);
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
        setIsImporting(false);
        setStatus('error');
        setMessage('沒有可匯入的藥品數據');
        return;
      }
      setMessage('正在匯入並進行分頁處理...');
      const result = await importDrugs(manifestName, drugs, user!.id, { source_images: uploadedUrls });
      if (result.success) {
        setIsImporting(false);
        setStatus('success');
        setMessage(`匯入成功！共匯入 ${result.totalItems} 項藥品。正在跳轉至清點面板...`);
        clearImportState();
        setTimeout(() => router.push(`/scan?manifestId=${result.manifestId}`), 2000);
      } else {
        setIsImporting(false);
        setStatus('error');
        setMessage(`匯入失敗: ${result.error}`);
      }
    } catch {
      setIsImporting(false);
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
      clearImportState();
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
    <div className="h-dvh overflow-hidden flex flex-col bg-[#07142b]">
      {/* 匯入中全畫面動畫覆蓋層 */}
      {isImporting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#07142b]/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="tech-card p-8 max-w-sm w-full space-y-6 text-center border-[#00f2fe]/40 shadow-[0_0_40px_rgba(0,242,254,0.15)]">
            {/* 旋轉圖示 */}
            <div className="relative mx-auto w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#00f2fe] animate-spin" />
              <div className="absolute inset-2 rounded-full border-4 border-transparent border-b-[#00f2fe]/60 animate-spin animation-delay-300" style={{ animationDuration: '2s' }} />
              <Database className="absolute inset-0 m-auto w-8 h-8 text-[#00f2fe]" />
            </div>

            {/* 進度文字 */}
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">正在匯入藥品資料</h3>
              <p className="text-sm text-slate-400">正在將藥品寫入資料庫並進行分頁處理...</p>
            </div>

            {/* 動畫進度條 */}
            <div className="relative h-2 bg-slate-800/80 rounded-full overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-[#00f2fe] rounded-full animate-progress-indeterminate" />
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-particle-flow" />
              </div>
            </div>

            {/* 步驟提示 */}
            <div className="flex items-center justify-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#00f2fe] animate-pulse" />
              <span className="text-xs text-slate-500">寫入資料庫</span>
              <span className="w-2 h-2 rounded-full bg-slate-700" />
              <span className="text-xs text-slate-600">建立分頁</span>
              <span className="w-2 h-2 rounded-full bg-slate-700" />
              <span className="text-xs text-slate-600">完成</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className={parsedData ? 'max-w-3xl mx-auto flex flex-col h-full' : 'max-w-3xl mx-auto space-y-5 lg:space-y-6 p-4 lg:p-6'}>
          <div className="flex-shrink-0 flex items-center gap-3">
            <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6 text-slate-400" />
            </Link>
            <h1 className="text-xl lg:text-2xl font-bold text-white">匯入藥品清單</h1>
            <TeachingButton module="import-function" variant="inline" className="ml-3" />
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
                <DrugListUploader
                  onPdfSelect={handlePdfSelect}
                  onImagesSelect={handleImagesSelect}
                  onImagesRemove={removeImage}
                  selectedImages={selectedImages}
                  isParsingPdf={isParsingPdf}
                />
                {isParsingPdf && pdfProgress && (
                  <div className="tech-card p-4 lg:p-5 space-y-4 border-cyan-500/30 animate-in fade-in slide-in-from-bottom-2 relative overflow-hidden animate-scanline">
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#00f2fe]/60 to-transparent" />
                    <div className="flex items-center gap-3 relative z-10">
                      <div className={`relative ${pdfProgress.step === 'batch' ? 'animate-pulse-glow' : ''} rounded-lg p-1.5`}>
                        {STEP_ICONS[pdfProgress.step]}
                      </div>
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
                      {PDF_STEPS.map((s, i) => {
                        const stepOrder = [...PDF_STEPS, 'done'];
                        const currentIdx = stepOrder.indexOf(pdfProgress.step);
                        const thisIdx = stepOrder.indexOf(s);
                        const isCompleted = thisIdx < currentIdx || pdfProgress.step === 'done';
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
                              }`}>
                                {PDF_STEP_LABELS[s] || s}
                              </span>
                            </div>
                            {i < PDF_STEPS.length - 1 && (
                              <div className={`h-px flex-1 -mt-4 transition-colors duration-300 ${
                                isCompleted ? 'bg-[#00f2fe]/60 animate-line-glow' :
                                isCurrent ? 'bg-slate-600' :
                                'bg-slate-800'
                              }`}>
                              </div>
                            )}
                          </React.Fragment>
                        );
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
                {(selectedImages.length > 0 || uploadedUrls.length > 0) && (
                  <>
                    {selectedImages.length > 0 && (
                      <button
                        onClick={handleUploadImages}
                        disabled={status === 'loading'}
                        className="tech-button w-full py-2.5 text-sm flex items-center justify-center gap-2"
                      >
                        {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                        上傳 {selectedImages.length} 張截圖至雲端
                      </button>
                    )}
                    {uploadedUrls.length > 0 && (
                      <div className="space-y-2 animate-in fade-in">
                        <div className="flex items-center gap-2">
                          <ImageIcon className="w-4 h-4 text-green-400" />
                          <p className="text-xs text-slate-400">
                            已上傳 <span className="text-green-400 font-bold">{uploadedUrls.length}</span> 張截圖
                          </p>
                        </div>
                        <div className="grid grid-cols-4 lg:grid-cols-6 gap-2">
                          {uploadedUrls.map((url, i) => (
                            <div key={`up-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-green-500/30">
                              <img src={url} alt="uploaded" className="w-full h-full object-cover" />
                              <div className="absolute bottom-0 left-0 right-0 p-0.5 bg-green-500/80 text-[9px] text-white text-center">
                                已上傳
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
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
    </div>
  );
}
