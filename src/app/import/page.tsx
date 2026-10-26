'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { importDrugs } from '@/app/actions/import/importDrugs';
import type { ImportDrugItem } from '@/app/actions/import/types';
import { processImagesWithGemini, processImagesWithGeminiAsPdf } from '@/app/actions/import/ocr';
import { deleteImportImages } from '@/app/actions/import/storage';
import { clientUploadImportImages } from '@/lib/clientUpload';
import { FileUp, Loader2, CheckCircle2, ArrowLeft, Image as ImageIcon, FileType, RotateCcw, Cpu, Upload, ScanLine, Database, AlertTriangle, RefreshCw, Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { parsePdf, ParsedPdf, ParsedItem, PdfProgressStep } from '@/lib/pdfParser';
import { validateParsedPdf } from '@/lib/pdfValidator';

/** 單頁辨識卡片狀態介面 */
export interface PageCardState {
  pageIndex: number;
  url: string;
  status: 'idle' | 'scanning' | 'retry_backoff' | 'success' | 'error';
  model: string;
  percent: number;
  retryCountdown?: number;
  reason?: string;
  itemCount?: number;
  items?: ParsedItem[];
  order_number?: string;
  delivery_date?: string;
  total_items?: number;
  total_pages?: number;
  realPageIndex?: number;
  errorMessage?: string;
  warning?: { missing_count: number; page_number: number };
}

/** Web Audio API 提示音效產生器（無需外部音訊檔依賴） */
function playAlertTone(type: 'error' | 'click' | 'success') {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'error') {
      // 警示提示音：雙頻快速下降 440Hz -> 311Hz
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(311, now + 0.18);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'success') {
      // 成功完成提示音：上升雙頻 587Hz -> 880Hz
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else {
      // 輕快點擊反饋短音
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  } catch {
    // 忽略不支援環境或靜音阻擋
  }
}

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
  const [pageCards, setPageCards] = useState<PageCardState[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
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
    setPageCards([]);
    setIsRecognizing(false);
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

  /**
   * 檢查是否所有卡片均已辨識完成 (success)
   */
  const checkAllCardsCompleted = (cards: PageCardState[]) => {
    if (cards.length === 0) return;
    const allSuccess = cards.every(c => c.status === 'success');
    if (allSuccess) {
      const sortedCards = [...cards].sort((a, b) => a.pageIndex - b.pageIndex);
      let currentLineNumber = 1;
      const combinedItems: ParsedItem[] = [];
      const combinedWarnings: Array<{ missing_count: number; page_number: number }> = [];

      for (const c of sortedCards) {
        if (c.warning) combinedWarnings.push(c.warning);
        if (c.items) {
          for (const it of c.items) {
            combinedItems.push({
              ...it,
              line_number: currentLineNumber++,
              page_number: c.pageIndex,
            });
          }
        }
      }

      if (combinedItems.length === 0) {
        setStatus('error');
        setMessage('所有照片辨識完成，但未提取到任何藥品品項');
        setIsRecognizing(false);
        return;
      }

      const firstWithOrder = sortedCards.find(c => c.order_number);
      const orderNumber = firstWithOrder?.order_number || manifestName || '未知單號';
      const deliveryDate = firstWithOrder?.delivery_date || '';

      // 嚴謹解析全單宣告總項目數：
      // 1. 若上傳多頁，宣告總項數絕不可能小於本次提取總數 (combinedItems.length)
      // 2. 若上傳單頁測試 (sortedCards.length === 1)，本次提取數為本頁項數
      const validDeclaredTotals = sortedCards
        .map(c => c.total_items)
        .filter((n): n is number => n != null && n >= combinedItems.length);
      const maxDeclared = validDeclaredTotals.length > 0 ? Math.max(...validDeclaredTotals) : undefined;
      const isSinglePageTest = sortedCards.length === 1;

      // 若為單頁測試，total_items 代表本次提取項數，避免誤顯示 44/244；多頁時取真實宣告總數或提取總數
      const finalTotalItems = isSinglePageTest ? combinedItems.length : (maxDeclared || combinedItems.length);

      // 若全單實際提取項目數 >= 宣告總項數（例如 244 === 244），或為單頁測試，清空所有誤報 warnings
      if ((maxDeclared && combinedItems.length >= maxDeclared) || isSinglePageTest) {
        combinedWarnings.length = 0;
      }

      const totalPagesReported = Math.max(
        sortedCards.length,
        ...sortedCards.map(c => c.total_pages || 0)
      );

      const parsed: ParsedPdf = {
        order_metadata: {
          order_number: orderNumber,
          delivery_date: deliveryDate,
          total_items: finalTotalItems,
          source_type: 'images',
          uploaded_image_count: sortedCards.length,
          ocr_page_count: totalPagesReported,
          ocr_request_count: sortedCards.length,
        },
        items: combinedItems,
        warnings: combinedWarnings.length > 0 ? combinedWarnings : undefined,
      };

      setTimeout(() => {
        setParsedData(parsed);
        setManifestName(prev => prev.trim() || orderNumber);
        setStatus('idle');
        setMessage('');
        setIsRecognizing(false);
      }, 600);
    }
  };

  /**
   * 執行單一頁面的非同步 OCR 辨識
   */
  const executeSinglePageOcr = async (pageIndex: number, url: string, totalPages: number) => {
    setPageCards(prev => prev.map(c => c.pageIndex === pageIndex ? {
      ...c,
      status: 'scanning',
      model: 'gemini-3.1-flash-lite',
      percent: 15,
      errorMessage: undefined,
      retryCountdown: undefined,
      reason: undefined,
    } : c));

    try {
      const response = await fetch('/api/ocr/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, pageIndex, totalPages }),
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

          if (eventName === 'progress') {
            setPageCards(prev => prev.map(c => c.pageIndex === pageIndex ? {
              ...c,
              status: 'scanning',
              percent: data.percent ?? c.percent,
              model: data.model || c.model,
            } : c));
          } else if (eventName === 'retry') {
            setPageCards(prev => prev.map(c => c.pageIndex === pageIndex ? {
              ...c,
              status: 'retry_backoff',
              retryCountdown: data.countdown,
              model: data.model || data.switchedModel || c.model,
              reason: data.reason,
            } : c));
          } else if (eventName === 'warning') {
            setPageCards(prev => prev.map(c => c.pageIndex === pageIndex ? {
              ...c,
              warning: data.warning,
            } : c));
          } else if (eventName === 'page_done') {
            const detectedPage = data.realPageNumber ?? data.page;
            setPageCards(prev => prev.map(c => c.pageIndex === pageIndex ? {
              ...c,
              realPageIndex: detectedPage,
              pageIndex: detectedPage ?? c.pageIndex,
              itemCount: data.itemCount,
              total_items: data.total_items ?? c.total_items,
              total_pages: data.totalPages ?? c.total_pages,
              items: data.items,
              model: data.model || c.model,
            } : c));
          } else if (eventName === 'complete') {
            playAlertTone('success');
            const pageItems: ParsedItem[] = data.data?.items || [];
            const pageTotalItems = data.data?.order_metadata?.total_items ?? data.total_items;
            const detectedPage = data.realPageNumber ?? data.data?.items?.[0]?.page_number;
            setPageCards(prev => {
              const nextCards = prev.map(c => c.pageIndex === pageIndex ? {
                ...c,
                realPageIndex: detectedPage,
                pageIndex: detectedPage ?? c.pageIndex,
                status: 'success' as const,
                percent: 100,
                itemCount: pageItems.length,
                total_items: pageTotalItems ?? c.total_items,
                total_pages: data.data?.order_metadata?.ocr_page_count ?? c.total_pages,
                items: pageItems,
                order_number: data.data?.order_metadata?.order_number,
                delivery_date: data.data?.order_metadata?.delivery_date,
              } : c);

              checkAllCardsCompleted(nextCards);
              return nextCards;
            });
            return;
          } else if (eventName === 'error') {
            throw new Error(data.message || '辨識失敗');
          }
        }
      }
    } catch (error: unknown) {
      console.error(`[Page ${pageIndex} Stream Error]`, error);
      playAlertTone('error');
      const errMsg = error instanceof Error ? error.message : '辨識發生錯誤';
      setPageCards(prev => prev.map(c => c.pageIndex === pageIndex ? {
        ...c,
        status: 'error',
        errorMessage: errMsg,
      } : c));
    }
  };

  /**
   * 啟動所有圖片的多格非同步辨識
   */
  const handleOcrImages = () => {
    if (uploadedUrls.length === 0) return;
    setIsRecognizing(true);
    setStatus('loading');
    setMessage('');

    const initialCards: PageCardState[] = uploadedUrls.map((url, idx) => ({
      pageIndex: idx + 1,
      url,
      status: 'idle',
      model: 'gemini-3.1-flash-lite',
      percent: 0,
    }));
    setPageCards(initialCards);

    // 非同步啟動各頁
    initialCards.forEach(card => {
      executeSinglePageOcr(card.pageIndex, card.url, initialCards.length);
    });
  };

  /**
   * 單一卡片失敗時點擊重試
   */
  const handleRetryCard = (pageIndex: number) => {
    playAlertTone('click');
    const card = pageCards.find(c => c.pageIndex === pageIndex);
    if (!card) return;
    executeSinglePageOcr(pageIndex, card.url, pageCards.length);
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
      setPageCards([]);
      setIsRecognizing(false);
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
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* OCR 警告摘要（僅當總提取數小於紙本宣告總數，或確實有短缺時顯示） */}
              {(() => {
                const totalDeclared = (parsedData as any).order_metadata?.total_items;
                const actualCount = parsedData.items.length;
                const isComplete = totalDeclared != null && totalDeclared > 0 && actualCount >= totalDeclared;
                const warnings = (parsedData as any).warnings as Array<{ missing_count: number; page_number: number }> | undefined;

                if (isComplete || !warnings || warnings.length === 0) return null;

                const diff = totalDeclared && totalDeclared > actualCount ? totalDeclared - actualCount : undefined;

                return (
                  <div className="flex-shrink-0 mx-4 lg:mx-6 mt-3 mb-2 animate-in fade-in slide-in-from-top-2">
                    <div className="tech-card p-3 lg:p-4 border-[#ff9f0a]/50 bg-[#ff9f0a]/10">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#ff9f0a]/20 flex items-center justify-center mt-0.5">
                          <span className="text-[10px] font-bold text-[#ff9f0a]">⚠</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#ff9f0a] mb-1">OCR 辨識可能有遺漏品項</p>
                          <p className="text-xs text-slate-400 mb-2">
                            總頁數 {(parsedData as any).order_metadata?.ocr_page_count || '?'} 頁，辨識 {actualCount} 項
                            {diff ? `（紙本標註共 ${totalDeclared} 項，短缺 ${diff} 項）` : ''}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {warnings.map((w, i) => (
                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-medium text-slate-300">
                                <span className="text-[#ff9f0a] font-bold">第 {w.page_number} 頁</span>
                                {w.missing_count > 0 ? (
                                  <span>缺 {w.missing_count} 項</span>
                                ) : (
                                  <span className="text-slate-500">異常多</span>
                                )}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[#ff9f0a]/30">
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
                );
              })()}
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
                {/* 按下 OCR 辨識、多格非同步處理或解析 PDF 期間隱藏拖曳上傳區塊 */}
                {!isParsingPdf && !ocrProgress && !isRecognizing && pageCards.length === 0 && (
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
                {/* 多格非同步辨識進度卡片 Grid */}
                {pageCards.length > 0 && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ScanLine className="w-5 h-5 text-[#00f2fe] animate-pulse" />
                        <h3 className="text-sm font-bold text-white">
                          多頁非同步辨識進度 ({pageCards.filter((c) => c.status === 'success').length} / {pageCards.length} 完成)
                        </h3>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        非同步動態處理
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {pageCards.map((card) => {
                        const isScanning = card.status === 'scanning';
                        const isRetry = card.status === 'retry_backoff';
                        const isSuccess = card.status === 'success';
                        const isError = card.status === 'error';
                        const isWaiting = card.status === 'idle';

                        return (
                          <div
                            key={card.pageIndex}
                            onClick={() => isError && handleRetryCard(card.pageIndex)}
                            className={`relative overflow-hidden rounded-xl border p-3 flex flex-col justify-between transition-all duration-300 min-h-[175px] select-none ${
                              isError
                                ? 'border-[#ff4b5c] bg-[#ff4b5c]/10 shadow-[0_0_18px_rgba(255,75,92,0.35)] cursor-pointer active:scale-95 hover:border-[#ff4b5c]'
                                : isSuccess
                                ? 'border-emerald-500/70 bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                                : isRetry
                                ? 'border-amber-500/80 bg-amber-950/30 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                                : isScanning
                                ? 'border-[#00f2fe]/80 bg-[#162a56]/90 shadow-[0_0_20px_rgba(0,242,254,0.3)]'
                                : 'border-slate-800 bg-[#162a56]/50'
                            }`}
                          >
                            {/* 背景照片縮圖 */}
                            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                              <img
                                src={card.url}
                                alt={`第 ${card.pageIndex} 頁`}
                                className={`w-full h-full object-cover transition-opacity duration-300 ${
                                  isSuccess ? 'opacity-25' : isScanning ? 'opacity-20' : 'opacity-15'
                                }`}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-[#0b1730] via-transparent to-[#0b1730]/80" />
                            </div>

                            {/* 掃描雷射光條動畫（辨識中專屬） */}
                            {isScanning && (
                              <div className="absolute inset-x-0 h-[2px] bg-[#00f2fe] shadow-[0_0_10px_#00f2fe] animate-scanline pointer-events-none z-10" />
                            )}

                            {/* 頂部標頭：頁次與狀態 Badge */}
                            <div className="relative z-10 flex items-center justify-between gap-2">
                              <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-slate-900/80 border border-slate-700 text-slate-200">
                                第 {card.pageIndex} 頁
                              </span>

                              {isWaiting && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                                  排隊等待中
                                </span>
                              )}
                              {isScanning && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-[#00f2fe] border border-cyan-500/50 flex items-center gap-1 font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#00f2fe] animate-ping" />
                                  辨識中
                                </span>
                              )}
                              {isRetry && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 flex items-center gap-1 font-bold animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                  退避重試
                                </span>
                              )}
                              {isSuccess && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 flex items-center gap-1 font-bold animate-check-pop">
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  完成
                                </span>
                              )}
                              {isError && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-[#ff4b5c] border border-red-500/50 flex items-center gap-1 font-bold animate-pulse">
                                  <AlertTriangle className="w-3 h-3 text-[#ff4b5c]" />
                                  辨識失敗
                                </span>
                              )}
                            </div>

                            {/* 中央資訊與模型動態 */}
                            <div className="relative z-10 my-2 flex flex-col justify-center flex-1">
                              {/* 模型標籤 */}
                              <div className="mb-2">
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                                    card.model.includes('2.5')
                                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                                      : 'bg-[#00f2fe]/10 text-[#00f2fe] border-[#00f2fe]/30'
                                  }`}
                                >
                                  <Cpu className="w-2.5 h-2.5" />
                                  {card.model}
                                </span>
                              </div>

                              {/* 狀態文字與動畫 */}
                              {isScanning && (
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs text-slate-300">
                                    <span className="animate-pulse">正在提取藥品條碼...</span>
                                    <span className="text-[#00f2fe] font-mono font-bold">{card.percent}%</span>
                                  </div>
                                  <div className="h-1.5 bg-slate-900/80 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-cyan-500 to-[#00f2fe] rounded-full transition-all duration-300"
                                      style={{ width: `${card.percent}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {isRetry && (
                                <div className="space-y-1 bg-slate-950/70 p-2 rounded-lg border border-amber-500/30">
                                  <p className="text-[11px] text-amber-300 font-medium">
                                    {card.reason || 'AI 過載/空項退避'}
                                  </p>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-400">輪詢切換重試中</span>
                                    <span className="text-amber-400 font-mono font-bold tabular-nums">
                                      {card.retryCountdown} 秒
                                    </span>
                                  </div>
                                </div>
                              )}

                              {isSuccess && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-emerald-300 font-bold text-sm">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                    <span>成功提取 {card.itemCount ?? 0} 項</span>
                                  </div>
                                  {card.warning && (
                                    <p className="text-[10px] text-amber-300">
                                      短缺 {card.warning.missing_count} 項（預期 44 項）
                                    </p>
                                  )}
                                </div>
                              )}

                              {isError && (
                                <div className="space-y-1.5 bg-red-950/40 p-2 rounded-lg border border-red-500/40">
                                  <p className="text-[11px] text-red-300 line-clamp-2 leading-tight">
                                    {card.errorMessage || '辨識失敗'}
                                  </p>
                                  <div className="flex items-center gap-1 text-[11px] font-bold text-[#ff4b5c]">
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>點擊此格立即重試</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* 底部按鈕或進度回饋 */}
                            <div className="relative z-10 pt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                              {isError ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRetryCard(card.pageIndex);
                                  }}
                                  className="w-full py-1 rounded bg-[#ff4b5c]/20 hover:bg-[#ff4b5c]/30 text-[#ff4b5c] font-bold flex items-center justify-center gap-1 transition-all active:scale-95"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  點擊重試此頁
                                </button>
                              ) : isSuccess ? (
                                <div className="w-full flex items-center justify-between text-emerald-400/90 font-mono">
                                  <span>辨識完成</span>
                                  <span>100%</span>
                                </div>
                              ) : isScanning ? (
                                <span className="text-cyan-400/70 font-mono">連線 Gemini 串流中</span>
                              ) : (
                                <span className="text-slate-500">等待處理</span>
                              )}
                            </div>
                          </div>
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
                      重新上傳
                    </button>
                  </div>
                )}
                {(selectedImages.length > 0 || (uploadedUrls.length > 0 && pageCards.length === 0)) && (
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
                  {uploadedUrls.length > 0 && !parsedData && !ocrProgress && pageCards.length === 0 && (
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
