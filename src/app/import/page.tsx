'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { importDrugs } from '@/app/actions/import/importDrugs';
import type { ImportDrugItem } from '@/app/actions/import/types';
import { processImagesWithGemini, processImagesWithGeminiAsPdf } from '@/app/actions/import/ocr';
import { deleteImportImages } from '@/app/actions/import/storage';
import { clientUploadImportImages } from '@/lib/clientUpload';
import { FileUp, Loader2, CheckCircle2, ArrowLeft, Image as ImageIcon, FileType, RotateCcw, Cpu, Upload, ScanLine, Database } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { parsePdf, ParsedPdf, ParsedItem, PdfProgressStep } from '@/lib/pdfParser';
import { validateParsedPdf } from '@/lib/pdfValidator';

/** OCR 進度步驟類型 */
export interface OcrProgressLog {
  id: string;
  time: string;
  text: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

interface OcrProgressStep {
  step: 'uploading' | 'header' | 'batch' | 'nhi' | 'done';
  label: string;
  percent: number;
  currentBatch?: number;
  totalBatches?: number;
  model?: string;
  retryCountdown?: number;
  retryMessage?: string;
  logs: OcrProgressLog[];
}
import PreviewPanel from './components/PreviewPanel';
import { TeachingButton } from '@/components/teaching';
import DrugListUploader from './components/DrugListUploader';
import { ImportOverlay } from './components/ImportOverlay';
import { ImportProgressBar } from './components/ImportProgressBar';

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
  if (typeof window === 'undefined') return null;
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
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(IMPORT_STATE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage 寫入失敗（容量滿等）時忽略
  }
}

/** 清除 sessionStorage 中的匯入狀態 */
function clearImportState() {
  if (typeof window === 'undefined') return;
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

/* OCR 照片匯入步驟 */
const OCR_STEP_LABELS: Record<string, string> = {
  uploading: '上傳',
  header: '表頭',
  batch: '辨識',
  done: '完成',
};

const OCR_STEPS = ['uploading', 'header', 'batch'] as const;

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
  const [ocrProgress, setOcrProgress] = useState<OcrProgressStep | null>(null);
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

  const handleOcrImages = async () => {
    if (uploadedUrls.length === 0) return;
    try {
      setStatus('loading');
      setMessage('');

      const timeStr = new Date().toLocaleTimeString('zh-TW', { hour12: false });
      const initialLogs: OcrProgressLog[] = [{
        id: '1',
        time: timeStr,
        text: `啟動 ${uploadedUrls.length} 張照片 AI 串流辨識任務`,
        type: 'info',
      }];

      setOcrProgress({
        step: 'uploading',
        label: `正在連線 AI 辨識串流端點（共 ${uploadedUrls.length} 張）...`,
        percent: 5,
        model: 'gemini-3.1-flash-lite',
        logs: initialLogs,
      });

      const response = await fetch('/api/ocr/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: uploadedUrls }),
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || `HTTP 錯誤 ${response.status}`);
      }

      if (!response.body) {
        throw new Error('伺服器未回傳串流資料');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim()) continue;

          let eventName = 'message';
          let dataStr = '';

          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) {
              eventName = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.slice(6).trim();
            }
          }

          if (!dataStr) continue;
          let data: any;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          const curTime = new Date().toLocaleTimeString('zh-TW', { hour12: false });

          if (eventName === 'progress') {
            setOcrProgress(prev => {
              const prevLogs = prev?.logs || [];
              const newLogs = [...prevLogs, {
                id: Math.random().toString(36).slice(2),
                time: curTime,
                text: data.message,
                type: 'info' as const,
              }].slice(-6);

              let mappedStep: 'uploading' | 'header' | 'batch' | 'nhi' | 'done' = 'batch';
              if (data.stage === 'init') mappedStep = 'uploading';
              else if (data.stage === 'header') mappedStep = 'header';
              else if (data.stage === 'nhi') mappedStep = 'nhi';
              else if (data.stage === 'done') mappedStep = 'done';

              return {
                step: mappedStep,
                label: data.message,
                percent: data.percent ?? prev?.percent ?? 10,
                currentBatch: data.page,
                totalBatches: data.totalPages ?? uploadedUrls.length,
                model: data.model || prev?.model,
                retryCountdown: undefined,
                retryMessage: undefined,
                logs: newLogs,
              };
            });
          } else if (eventName === 'retry') {
            setOcrProgress(prev => {
              const prevLogs = prev?.logs || [];
              const isFirstCountdown = data.countdown === 5 || data.countdown === 8;
              let nextLogs = prevLogs;
              if (isFirstCountdown) {
                nextLogs = [...prevLogs, {
                  id: Math.random().toString(36).slice(2),
                  time: curTime,
                  text: data.message,
                  type: 'warning' as const,
                }].slice(-6);
              }
              return {
                step: 'batch',
                label: data.message,
                percent: prev?.percent ?? 30,
                currentBatch: data.page,
                totalBatches: uploadedUrls.length,
                model: data.model,
                retryCountdown: data.countdown,
                retryMessage: data.message,
                logs: nextLogs,
              };
            });
          } else if (eventName === 'warning') {
            setOcrProgress(prev => {
              const prevLogs = prev?.logs || [];
              return {
                ...prev!,
                logs: [...prevLogs, {
                  id: Math.random().toString(36).slice(2),
                  time: curTime,
                  text: data.message,
                  type: 'warning' as const,
                }].slice(-6),
              };
            });
          } else if (eventName === 'complete') {
            setOcrProgress(prev => ({
              step: 'done',
              label: data.message || '辨識完成！',
              percent: 100,
              model: prev?.model,
              logs: [...(prev?.logs || []), {
                id: Math.random().toString(36).slice(2),
                time: curTime,
                text: data.message || '所有項目解析完成',
                type: 'success' as const,
              }],
            }));

            await new Promise(r => setTimeout(r, 600));

            if (!data.data || !data.data.items || data.data.items.length === 0) {
              setStatus('error');
              setMessage('OCR 辨識完成但未取得任何藥品項目，請檢查圖片或重試');
              setOcrProgress(null);
              return;
            }

            setParsedData(data.data);
            setManifestName(prev => prev.trim() || data.data.order_metadata?.order_number || '');
            setStatus('idle');
            setMessage('');
            setOcrProgress(null);
            return;
          } else if (eventName === 'error') {
            throw new Error(data.message || '辨識失敗');
          }
        }
      }
    } catch (error: unknown) {
      console.error('[handleOcrImages Stream] 錯誤:', error);
      setStatus('error');
      const errMsg = error instanceof Error ? error.message : 'OCR 辨識過程中發生錯誤';
      setMessage(`OCR 辨識失敗: ${errMsg}`);
      setOcrProgress(null);
    }
  };


  const handleImport = async (items?: ParsedItem[]) => {
    if (!parsedData) return;
    try {
      setStatus('loading');
      setIsImporting(true);
      console.log('[Import] 開始匯入，parsedData:', parsedData);
      const sourceItems = items || parsedData.items;
      console.log('[Import] sourceItems:', sourceItems);
      const drugs: ImportDrugItem[] = sourceItems.map(item => ({
        barcode: item.barcode,
        product_code: item.product_code || '',
        name: item.drug_name,
        expected_quantity: item.quantity,
        warehouse_quantity: item.warehouse_quantity,
        bonus_quantity: 0,
        storage_location: item.storage_location || '',
        category: item.category || '',
      }));
      console.log('[Import] 準備送入 importDrugs:', drugs);
      const finalName = manifestName.trim() || parsedData.order_metadata.order_number || `匯入清單 ${new Date().toLocaleDateString('zh-TW')}`;
      const isPhotoImport = parsedData.order_metadata.source_type === 'images';
      console.log('[Import] 呼叫 importDrugs...', { finalName, isPhotoImport });
      const result = await importDrugs(finalName, drugs, user!.id, {
        order_number: parsedData.order_metadata.order_number,
        delivery_date: parsedData.order_metadata.delivery_date,
        source_file: '',
        mergeByBarcode: !isPhotoImport,
        applyNhiLookup: false,
      });
      console.log('[Import] importDrugs 回傳:', result);
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
    } catch (err) {
      console.error('[Import] 錯誤:', err);
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

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="max-w-3xl mx-auto flex flex-col h-full">
          <div className="flex-shrink-0 flex items-center gap-3 px-4 lg:px-6 py-2 lg:py-3">
            <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6 text-slate-400" />
            </Link>
            <h1 className="text-xl lg:text-2xl font-bold text-white">匯入藥品清單</h1>
            <TeachingButton module="import-function" variant="inline" className="ml-3" />
          </div>
      
          {parsedData ? (
            <div className="flex-1 min-h-0">
              {/* OCR 警告摘要 */}
              {(parsedData as any).warnings && (parsedData as any).warnings.length > 0 && (
                <div className="flex-shrink-0 mx-4 lg:mx-6 mt-4 mb-2 animate-in fade-in slide-in-from-top-2">
                  <div className="tech-card p-4 border-[#ff9f0a]/50 bg-[#ff9f0a]/10">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#ff9f0a]/20 flex items-center justify-center mt-0.5">
                        <span className="text-[10px] font-bold text-[#ff9f0a]">⚠</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#ff9f0a] mb-2">OCR 辨識可能有遺漏品項</p>
                        <p className="text-xs text-slate-400 mb-2">
                          總頁數 {(parsedData as any).order_metadata?.ocr_page_count || '?'} 頁，辨識 {parsedData.items.length} 項
                          {(() => {
                            const expected = ((parsedData as any).order_metadata?.ocr_page_count || 0) * 44;
                            const diff = expected - parsedData.items.length;
                            return diff > 0 ? `（預期 ~${expected} 項，可能缺 ${diff} 項）` : '';
                          })()}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(parsedData as any).warnings.map((w: { missing_count: number; page_number: number }, i: number) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[10px] font-medium text-slate-300">
                              <span className="text-[#ff9f0a] font-bold">第 {w.page_number} 頁</span>
                              {w.missing_count > 0 ? (
                                <span>缺 {w.missing_count} 項</span>
                              ) : (
                                <span className="text-slate-500">異常多</span>
                              )}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-[#ff9f0a]/30">
                          <p className="text-[10px] text-slate-400">建議人工檢查紙本或點擊重新辨識</p>
                          <button
                            type="button"
                            onClick={handlePdfRetry}
                            className="px-3 py-1 rounded-lg border border-[#ff9f0a]/60 bg-[#ff9f0a]/20 hover:bg-[#ff9f0a]/30 active:scale-95 text-xs text-[#ff9f0a] font-bold transition-all flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>清空並重新上傳</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <PreviewPanel 
                data={parsedData}
                validation={validateParsedPdf(parsedData)}
                onConfirm={handleImport}
                onRetry={handlePdfRetry}
                onItemsChange={(items) => setParsedData(prev => (prev ? { ...prev, items } : prev))}
                isLoading={isParsingPdf}
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-5 lg:space-y-6 p-0 lg:px-6 pb-6">
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
                {/* 按下 OCR 辨識或解析 PDF 期間隱藏拖曳上傳區塊 */}
                {!isParsingPdf && !ocrProgress && (
                  <DrugListUploader
                    onPdfSelect={handlePdfSelect}
                    onImagesSelect={handleImagesSelect}
                    onImagesRemove={removeImage}
                    selectedImages={selectedImages}
                    isParsingPdf={isParsingPdf}
                  />
                )}
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
                {/* OCR 照片匯入進度顯示 */}
                {ocrProgress && (
                  <div className="tech-card p-4 lg:p-5 space-y-4 border-cyan-500/30 animate-in fade-in slide-in-from-bottom-2 relative overflow-hidden animate-scanline">
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#00f2fe]/60 to-transparent" />
                    
                    {/* 頂部狀態與模型 Badge */}
                    <div className="flex items-center justify-between gap-3 relative z-10">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`relative ${ocrProgress.step === 'batch' ? 'animate-pulse-glow' : ''} rounded-lg p-1.5 bg-slate-800/80 border border-cyan-500/30`}>
                          {ocrProgress.step === 'uploading' && <Upload className="w-5 h-5 text-cyan-400" />}
                          {ocrProgress.step === 'header' && <Cpu className="w-5 h-5 text-[#00f2fe]" />}
                          {ocrProgress.step === 'batch' && <Cpu className="w-5 h-5 text-[#00f2fe] animate-pulse" />}
                          {ocrProgress.step === 'nhi' && <Database className="w-5 h-5 text-cyan-400 animate-pulse" />}
                          {ocrProgress.step === 'done' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{ocrProgress.label}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {ocrProgress.model && (
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                                ocrProgress.model.includes('2.5')
                                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                                  : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                              }`}>
                                {ocrProgress.model.includes('2.5') ? '⚡ 備援模型: ' : 'AI 模型: '}{ocrProgress.model}
                              </span>
                            )}
                            {ocrProgress.currentBatch && ocrProgress.totalBatches && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                頁次 {ocrProgress.currentBatch} / {ocrProgress.totalBatches}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-[#00f2fe] font-mono text-lg font-bold tabular-nums shrink-0">
                        {ocrProgress.percent}%
                      </span>
                    </div>

                    {/* 503 退避倒數警示橫幅 */}
                    {ocrProgress.retryCountdown !== undefined && ocrProgress.retryCountdown > 0 && (
                      <div className="bg-amber-950/40 border border-amber-500/50 rounded-xl p-3 flex items-center justify-between animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                        <div className="flex items-center gap-2 text-xs text-amber-200">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                          <span>AI 服務暫時過載 (503)，系統自動退避重試中...</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-base font-bold text-amber-300 tabular-nums">
                            {ocrProgress.retryCountdown} 秒
                          </span>
                        </div>
                      </div>
                    )}

                    {/* 發光進度條 */}
                    <div className="relative h-2.5 bg-slate-800/80 rounded-full overflow-hidden">
                      <div 
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-[#00f2fe] rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${ocrProgress.percent}%` }}
                      />
                      <div 
                        className="absolute top-1/2 -translate-y-1/2 w-6 h-4 bg-white/30 blur-sm rounded-full transition-all duration-500 ease-out"
                        style={{ left: `calc(${ocrProgress.percent}% - 12px)` }}
                      />
                      <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-particle-flow" />
                      </div>
                      {ocrProgress.step === 'batch' && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                      )}
                    </div>

                    {/* 步驟指示器 */}
                    <div className="flex items-center gap-0 relative z-10">
                      {OCR_STEPS.map((s, i) => {
                        const stepOrder = [...OCR_STEPS, 'done'];
                        const currentIdx = stepOrder.indexOf(ocrProgress.step);
                        const thisIdx = stepOrder.indexOf(s);
                        const isCompleted = thisIdx < currentIdx || ocrProgress.step === 'done';
                        const isCurrent = ocrProgress.step === s;
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
                                {OCR_STEP_LABELS[s] || s}
                              </span>
                            </div>
                            {i < OCR_STEPS.length - 1 && (
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

                    {/* 即時步驟卡片與日誌狀態盒 */}
                    {ocrProgress.logs && ocrProgress.logs.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-700/50">
                        <div className="bg-slate-950/70 border border-cyan-500/20 rounded-xl p-2.5 font-mono text-[11px] space-y-1.5 max-h-28 overflow-y-auto">
                          {ocrProgress.logs.map((log) => (
                            <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                              <span className="text-slate-500 shrink-0">[{log.time}]</span>
                              <span className={`break-all ${
                                log.type === 'warning' ? 'text-amber-300' :
                                log.type === 'error' ? 'text-red-400' :
                                log.type === 'success' ? 'text-green-300 font-bold' :
                                'text-slate-300'
                              }`}>
                                {log.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {status === 'error' && (
                  <div className="mt-3 p-2 bg-red-600 rounded text-center">
                    {message}
                    <button
                      className="ml-2 px-3 py-1 bg-[#00f2fe] rounded-full active:scale-95"
                      onClick={handlePdfRetry}
                    >
                      重新上傳
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
                        上傳 {selectedImages.length} 張照片至雲端
                      </button>
                    )}
                    {uploadedUrls.length > 0 && (
                      <div className="space-y-2 animate-in fade-in">
                        <div className="flex items-center gap-2">
                          <ImageIcon className="w-4 h-4 text-green-400" />
                          <p className="text-xs text-slate-400">
                            已上傳 <span className="text-green-400 font-bold">{uploadedUrls.length}</span> 張照片
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
                <div className="flex flex-col gap-3">
                  {uploadedUrls.length > 0 && !parsedData && !ocrProgress && (
                    <button
                      onClick={handleOcrImages}
                      disabled={status === 'loading'}
                      className="tech-button tech-button-primary w-full py-3 flex items-center justify-center gap-2"
                    >
                      {status === 'loading' ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          正在啟動辨識...
                        </>
                      ) : (
                        <>
                          <Cpu className="w-5 h-5" />
                          開始 OCR 辨識
                        </>
                      )}
                    </button>
                  )}
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
