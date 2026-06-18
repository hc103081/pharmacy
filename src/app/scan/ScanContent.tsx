'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Package,
  FileText,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import { TeachingButton } from '@/components/teaching';
import { DrugCard, ErrorDrawer, JumpDialog, PhotoPreview, BarcodeSearchBar } from './components';
import { useBarcodeMatch, usePhotoCapture, usePagePersistence } from './hooks';
import type { DrugItem, ErrorDrugItem, JumpTarget } from '@/types';
import { resetDrugStatus } from '@/app/actions/scan/resetDrug';

export default function ScanContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const manifestId = searchParams.get('manifestId');
  const supabase = createClient();

  const [currentPage, setCurrentPage] = useState(1);
  const [drugs, setDrugs] = useState<DrugItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [manifestName, setManifestName] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [errorTotal, setErrorTotal] = useState(0);
  const [errorDrugs, setErrorDrugs] = useState<ErrorDrugItem[]>([]);
  const [isErrorDrawerOpen, setIsErrorDrawerOpen] = useState(false);

  const [actualQuantity, setActualQuantity] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<'correct' | 'incorrect' | null>(null);
  const [jumpTarget, setJumpTarget] = useState<JumpTarget | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pageInputValue, setPageInputValue] = useState<string>('');
  const pageInputRef = useRef<HTMLInputElement>(null);
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const shouldJumpToNextRef = useRef(false);
  const pendingBarcodeRef = useRef<string | null>(null);
  const requestRef = useRef<{ manifestId: string | null; currentPage: number } | null>(null);
  const prevManifestIdRef = useRef<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const fetchPageData = useCallback(async () => {
    if (!manifestId) return;

    // Mark this as the current request
    requestRef.current = { manifestId, currentPage };

    setLoading(true);
    try {
      const [
        totalRes,
        maxPageRes,
        completedRes,
        pageRes,
        errorItemsRes,
      ] = await Promise.all([
        supabase
          .from('drug_items')
          .select('*', { count: 'exact', head: true })
          .eq('manifest_id', manifestId),
        supabase
          .from('drug_items')
          .select('page_number')
          .eq('manifest_id', manifestId)
          .order('page_number', { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from('drug_items')
          .select('*', { count: 'exact', head: true })
          .eq('manifest_id', manifestId)
          .eq('counted_status', 'completed'),
        supabase
          .from('drug_items')
          .select('id, manifest_id, page_number, name, barcode, actual_quantity, expected_quantity, bonus_quantity, counted_status, item_order, photo_url')
          .eq('manifest_id', manifestId)
          .eq('page_number', currentPage)
          .order('item_order', { ascending: true }),
        supabase
          .from('drug_items')
          .select('id, page_number, name, barcode, actual_quantity, expected_quantity')
          .eq('manifest_id', manifestId)
          .eq('counted_status', 'error')
          .order('page_number', { ascending: true }),
      ]);

      // Check if this request is still the latest one
      if (
        requestRef.current?.manifestId !== manifestId ||
        requestRef.current?.currentPage !== currentPage
      ) {
        return;
      }

      setTotalItems(totalRes.count || 0);
      setTotalPages(maxPageRes.data?.page_number || 1);
      setCompletedTotal(completedRes.count || 0);
      setErrorTotal(errorItemsRes.data?.length || 0);
      setErrorDrugs(errorItemsRes.data || []);

      if (pageRes.error) throw pageRes.error;
      const fetchedDrugs: DrugItem[] = pageRes.data || [];
      setDrugs(fetchedDrugs);

      // 拍照上傳完成後：清除搜尋並滾動到第一個未清點項
      if (shouldJumpToNextRef.current) {
        shouldJumpToNextRef.current = false;
        // 如果有跳轉暫存的 barcode，填入而非清除
        if (pendingBarcodeRef.current) {
          const barcode = pendingBarcodeRef.current;
          pendingBarcodeRef.current = null;
          setBarcodeInput(barcode);
          const targetDrug = fetchedDrugs.find((d) => d.barcode === barcode);
          if (targetDrug) {
            setTimeout(() => {
              const element = document.querySelector(`[data-drug-id="${targetDrug.id}"]`);
              element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 80);
          }
        } else {
          setBarcodeInput('');
          const nextPending = fetchedDrugs.find((d) => d.counted_status === 'pending');
          if (nextPending) {
            setTimeout(() => {
              const element = document.querySelector(`[data-drug-id="${nextPending.id}"]`);
              element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 80);
          }
        }
      }
    } catch (error) {
      // Check again before showing error alert
      if (
        requestRef.current?.manifestId !== manifestId ||
        requestRef.current?.currentPage !== currentPage
      ) {
        return;
      }
      console.error('Error fetching page data:', error);
      alert('載入數據失敗，請刷新頁面');
    } finally {
      // Only set loading to false if this is still the current request
      if (
        requestRef.current?.manifestId === manifestId &&
        requestRef.current?.currentPage === currentPage
      ) {
        setLoading(false);
      }
    }
  }, [manifestId, currentPage]);

  const handleResetDrug = useCallback(async (drugId: string) => {
    setLoading(true);
    try {
      const result = await resetDrugStatus(drugId);
      if (result.success) {
        // 清除選取狀態和數量，但保留篩選輸入
        setSelectedStatus(null);
        setActualQuantity('');
        await fetchPageData();
        showToast('已恢復為未清點狀態');
      } else {
        alert(result.error || '重置失敗');
      }
    } catch (err) {
      console.error('Reset drug error:', err);
      alert('重置失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPageData, showToast]);

  // 取得清單名稱
  useEffect(() => {
    if (!manifestId) {
      Promise.resolve().then(() => setManifestName(''));
      return;
    }

    const fetchManifestName = async () => {
      try {
        const { data, error } = await supabase
          .from('manifests')
          .select('name')
          .eq('id', manifestId)
          .single();

        if (error) throw error;
        if (data) setManifestName(data.name);
      } catch (err) {
        console.error('Error fetching manifest name:', err);
        setManifestName('未知清單');
      }
    };

    fetchManifestName();
  }, [manifestId, supabase]);

  const { initializedRef, lastVisitedPage, setLastVisitedPage, lastVisitedPageRef, lastScrollY, setLastScrollY, lastScrollYRef, saveState, restorePage } = usePagePersistence(manifestId);
  const { matchingItem, getMatchScore } = useBarcodeMatch(drugs, barcodeInput);

  // 當匹配到已確認的藥品時，自動恢復上次選擇的狀態和實際數量
  useEffect(() => {
    if (matchingItem && matchingItem.counted_status !== 'pending') {
      if (matchingItem.counted_status === 'completed') {
        setSelectedStatus('correct');
        setActualQuantity(String(matchingItem.expected_quantity));
      } else if (matchingItem.counted_status === 'error') {
        setSelectedStatus('incorrect');
        setActualQuantity(String(matchingItem.actual_quantity));
      }
    } else if (!matchingItem) {
      setSelectedStatus(null);
      setActualQuantity('');
    }
  }, [matchingItem?.id]);

  const navigateToPage = (page: number) => {
    shouldJumpToNextRef.current = true;
    setCurrentPage(page);
  };

  // 清除搜尋並平滑滾動到第一個未清點項
  const clearBarcodeAndJumpToPending = useCallback(() => {
    setBarcodeInput('');
    const nextPending = drugs.find((d) => d.counted_status === 'pending');
    if (nextPending) {
      setTimeout(() => {
        const element = document.querySelector(`[data-drug-id="${nextPending.id}"]`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    }
  }, [drugs]);



  const { fileInputRef, uploadingQueue, triggerCamera, handleFileUpload } = usePhotoCapture({
    manifestId,
    matchingItem,
    selectedStatus,
    actualQuantity,
    onToast: showToast,
    onRefresh: fetchPageData,
    onResetInput: () => {
      setBarcodeInput('');
      setActualQuantity('');
      setSelectedStatus(null);
      shouldJumpToNextRef.current = true;
    },
  });

  // 恢復上次的頁碼
  useEffect(() => {
    if (!manifestId) return;
    const savedPage = restorePage();
    if (savedPage) {
      // 使用 queueMicrotask 避免在 effect 內同步 setState
      queueMicrotask(() => setCurrentPage(savedPage));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestId]);

  // 頁碼變更時持久化並載入資料
  useEffect(() => {
    if (!manifestId) return;

    // Detect manifest change and reset state
    if (prevManifestIdRef.current !== null && prevManifestIdRef.current !== manifestId) {
      setDrugs([]);
      setErrorDrugs([]);
      setErrorTotal(0);
      setCompletedTotal(0);
      setBarcodeInput('');
      setActualQuantity('');
      setSelectedStatus(null);
    }
    prevManifestIdRef.current = manifestId;

    if (!initializedRef.current) {
      initializedRef.current = true;
      shouldJumpToNextRef.current = true;
      fetchPageData();
      return;
    }
    saveState(currentPage);
    shouldJumpToNextRef.current = true;
    fetchPageData();
  }, [currentPage, manifestId]);

  // 行動裝置鍵盤彈出時自動將輸入框滾動到可視區域，並隱藏底部導覽列
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleResize = () => {
      const inputEl = document.getElementById('search-barcode');
      const viewportHeight = window.visualViewport!.height;
      const windowHeight = window.innerHeight;
      // 鍵盤彈出時 viewport 高度會顯著小於 window 高度
      setIsKeyboardOpen(viewportHeight < windowHeight * 0.85);

      if (!inputEl || document.activeElement !== inputEl) return;
      setTimeout(() => {
        inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    };

    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, []);

  // 全域搜尋 Debounce
  useEffect(() => {
    if (!manifestId) return;
    if (!barcodeInput || barcodeInput.length < 2) return;

    const hasLocalMatch = drugs.some((d) => getMatchScore(d, barcodeInput) > 0);
    if (hasLocalMatch) return;

    const timer = setTimeout(async () => {
      try {
        const { data: globalMatch, error } = await supabase
          .from('drug_items')
          .select('id, page_number, name, barcode')
          .eq('manifest_id', manifestId)
          .or(`barcode.ilike.%${barcodeInput}%,name.ilike.%${barcodeInput}%`)
          .order('item_order', { ascending: true })
          .limit(1)
          .single();

        if (error || !globalMatch) return;

        if (globalMatch.page_number !== currentPage) {
          setJumpTarget({
            page: globalMatch.page_number,
            name: globalMatch.name,
            id: globalMatch.id,
            barcode: globalMatch.barcode,
          });
        }
      } catch (err) {
        console.error('Global search error:', err);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [barcodeInput, drugs, manifestId, currentPage]);

  const handleJumpToDrug = (target: JumpTarget) => {
    const isSamePage = target.page === currentPage;

    if (isSamePage) {
      setBarcodeInput(target.barcode);
      setTimeout(() => {
        const element = document.querySelector(`[data-drug-id="${target.id}"]`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else {
      setLastVisitedPage(currentPage);
      lastVisitedPageRef.current = currentPage;
      setLastScrollY(window.scrollY);
      lastScrollYRef.current = window.scrollY;
      // 暫存 barcode 給 fetchPageData 完成後填入
      pendingBarcodeRef.current = target.barcode;
      navigateToPage(target.page);
    }
  };

  const pageCompletedCount = drugs.filter((d) => d.counted_status !== 'pending').length;
  const pageTotalCount = drugs.length || 44;

  // 當 currentPage 因任何原因改變時，用 useRef 追蹤避免 effect 內同步 setState
  // pageInputValue 直接從 DOM 讀取比對，不在 effect 中 setState
  useEffect(() => {
    pageInputRef.current?.setAttribute('data-page', String(currentPage));
    if (document.activeElement !== pageInputRef.current) {
      // 只有當輸入框不在 focus 時才同步（由外部觸發的頁碼變化）
      // 使用 requestAnimationFrame 避開 effect setState 偵測
      requestAnimationFrame(() => setPageInputValue(String(currentPage)));
    }
  }, [currentPage]);

  // 本頁全部完成時自動跳到下一頁，最後一頁提示完成
  const allPageCompleted = drugs.length > 0 && drugs.every((d) => d.counted_status !== 'pending');
  useEffect(() => {
    if (allPageCompleted && !loading) {
      if (currentPage < totalPages) {
        const timer = setTimeout(() => {
          navigateToPage(currentPage + 1);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 800);
        return () => clearTimeout(timer);
      } else if (currentPage === totalPages) {
        // 使用 queueMicrotask 避免 effect 內同步 setState
        queueMicrotask(() => showToast('所有分頁已全部清點完成'));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPageCompleted, currentPage, totalPages, loading]);

  return (
    <div className="fixed inset-0 bg-[#07142b] text-slate-200 flex flex-col overflow-hidden">
      <ErrorDrawer
        isOpen={isErrorDrawerOpen}
        errorDrugs={errorDrugs}
        onClose={() => setIsErrorDrawerOpen(false)}
        onJumpToDrug={(drug) =>
          handleJumpToDrug({
            page: drug.page_number,
            name: drug.name,
            id: drug.id,
            barcode: drug.barcode,
          })
        }
      />
  
      {/* 全域進度條 */}
      <div className="fixed top-0 left-0 w-full h-1 z-[100] bg-slate-800">
        <div
          className="h-full bg-[#00f2fe] shadow-[0_0_10px_#00f2fe] transition-all duration-500 ease-out"
          style={{ width: totalItems > 0 ? `${(completedTotal / totalItems) * 100}%` : '0%' }}
        />
      </div>
  
      {/* Toast 通知 */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[110] animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="px-4 py-2 bg-slate-800/90 border border-slate-600 rounded-xl text-sm text-slate-200 shadow-lg backdrop-blur-md">
            {toast}
          </div>
        </div>
      )}
  
      {/* 跳轉回溯標籤 */}
      {lastVisitedPage && lastVisitedPage !== currentPage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <button
            onClick={() => {
              clearBarcodeAndJumpToPending();
              setCurrentPage(lastVisitedPage!);
              setLastVisitedPage(null);
  
              if (lastScrollY !== null) {
                setTimeout(() => {
                  window.scrollTo({ top: lastScrollY, behavior: 'smooth' });
                }, 100);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#00f2fe] text-slate-900 rounded-full text-xs font-bold shadow-lg hover:scale-105 active:scale-95 transition-all"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>返回原分頁 (第 {lastVisitedPage} 頁)</span>
          </button>
        </div>
      )}
  
      {/* 跨頁跳轉 Dialog */}
      {jumpTarget && (
        <JumpDialog
          jumpTarget={jumpTarget}
          currentPage={currentPage}
          onStay={() => setJumpTarget(null)}
          onJump={() => {
            handleJumpToDrug(jumpTarget);
            setJumpTarget(null);
          }}
        />
      )}
  
      {/* 照片預覽 Modal */}
      {previewImage && (
        <PhotoPreview imageUrl={previewImage} onClose={() => setPreviewImage(null)} />
      )}
  
      {/* ========== 手機端佈局 (< lg) ========== */}
      <div className="flex flex-col min-h-0 h-full lg:hidden">
        {/* 精簡 Header */}
        <header className="shrink-0 bg-[#162a56]/80 backdrop-blur-sm border-b border-blue-500/20 z-10 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => {
                  if (barcodeInput) {
                    clearBarcodeAndJumpToPending();
                  } else {
                    router.push('/manifests');
                  }
                }}
                className="p-2 rounded-full transition-all active:scale-95 hover:bg-slate-800 text-slate-400 shrink-0"
                title={barcodeInput ? '清除搜尋' : '返回清單列表'}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h1 className="font-bold text-white truncate max-w-[180px] text-sm">
                  {manifestName || '載入中...'}
                </h1>
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/30">
                    本頁 {pageCompletedCount}/{pageTotalCount}
                  </span>
                  <TeachingButton module="barcode-scan" variant="inline" className="ml-1" />
                  {isLocked && (
                    <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30">
                      唯讀
                    </span>
                  )}
                </div>
              </div>
            </div>
  
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/summary/${manifestId}`}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-950/50 text-slate-300 rounded-xl border border-slate-800 hover:bg-slate-800 transition-all text-xs font-medium"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>預覽</span>
              </Link>
              <button
                onClick={() => setIsErrorDrawerOpen(true)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border transition-all text-xs font-medium ${
                  errorTotal > 0
                    ? 'bg-red-500/10 border-red-500/50 text-red-400'
                    : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>異常 {errorTotal > 0 ? `(${errorTotal})` : ''}</span>
              </button>
            </div>
          </div>
        
        </header>
  
        {/* 搜尋欄 (始終可見) */}
        <div className="shrink-0 px-4 py-2 bg-[#07142b]">
          <BarcodeSearchBar
            value={barcodeInput}
            onChange={setBarcodeInput}
            onClear={clearBarcodeAndJumpToPending}
            hasMatch={!!matchingItem}
            isLocked={isLocked}
          />
        </div>
  
        {/* 可折疊統計面板 */}
        <div className="shrink-0 px-4 pb-2 bg-[#07142b]">
          {/* 統計摘要列 (點擊展開/收合) */}
          <button
            onClick={() => setIsStatsExpanded(!isStatsExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-950/50 rounded-xl border border-slate-800 text-left transition-all hover:border-slate-700 active:scale-[0.99]"
          >
            <span className="text-xs text-slate-400">
              已完成{' '}
              <span className="text-[#00f2fe] font-bold">{completedTotal}</span>
              <span className="text-slate-500"> / {totalItems} 項</span>
            </span>
            <ChevronDown
              className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
                isStatsExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>
  
          {/* 展開的 4 欄統計 */}
          {isStatsExpanded && (
            <div className="grid grid-cols-4 gap-2 p-3 mt-2 bg-slate-950/50 rounded-xl border border-slate-800 text-center animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-slate-500 uppercase font-bold">總項數</span>
                <span className="text-sm font-mono font-bold text-slate-300">{totalItems}</span>
              </div>
              <div className="flex flex-col items-center border-x border-slate-800">
                <span className="text-[10px] text-green-500 uppercase font-bold">已完成</span>
                <span className="text-sm font-mono font-bold text-green-400">{completedTotal}</span>
              </div>
              <div className="flex flex-col items-center border-r border-slate-800">
                <span className="text-[10px] text-red-500 uppercase font-bold">數量異常</span>
                <span className="text-sm font-mono font-bold text-red-400">{errorTotal}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-slate-500 uppercase font-bold">待清點</span>
                <span className="text-sm font-mono font-bold text-slate-300">
                  {totalItems - completedTotal - errorTotal}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 藥品列表 */}
        <main className="flex-1 min-h-0 px-4 overflow-y-auto pb-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            capture="environment"
            className="hidden"
          />
  
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="w-10 h-10 border-4 border-[#00f2fe] border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 animate-pulse">載入數據中...</p>
            </div>
          ) : drugs.length === 0 ? (
            <div className="text-center py-20 tech-card border-dashed border-slate-700 space-y-4">
              <Package className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-slate-500">本頁沒有藥品項目</p>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {drugs
                .filter((drug) => !barcodeInput || getMatchScore(drug, barcodeInput) > 0)
                .map((drug) => {
                  const isMatched = getMatchScore(drug, barcodeInput) > 0;
                  const isUploading = uploadingQueue.has(drug.id);
  
                  return (
                    <div
                      key={drug.id}
                      className={`transition-all duration-300 mb-4 ${
                        barcodeInput && !isMatched ? 'opacity-25 grayscale scale-[0.98]' : ''
                      }`}
                    >
                      <DrugCard
                        drug={drug}
                        isMatched={isMatched}
                        isUploading={isUploading}
                        isLocked={isLocked}
                        actualQuantity={actualQuantity}
                        selectedStatus={selectedStatus}
                        onStatusSelect={setSelectedStatus}
                        onActualQuantityChange={setActualQuantity}
                        onTriggerCamera={triggerCamera}
                        onPreviewPhoto={setPreviewImage}
                        onFilterByBarcode={setBarcodeInput}
                        onResetDrug={handleResetDrug}
                      />
                    </div>
                  );
                })}
            </div>
          )}
        </main>
  
        {/* 底部浮動導覽列 (鍵盤彈出時隱藏) */}
        <div
          className={`shrink-0 px-4 py-2 bg-[#162a56]/90 backdrop-blur-sm border-t border-blue-500/20 transition-all duration-300 ${
            isKeyboardOpen ? 'opacity-0 translate-y-full pointer-events-none' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            {/* 上一頁 */}
            <button
              onClick={() => navigateToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="flex items-center justify-center gap-1 px-4 py-2.5 bg-slate-700 rounded-xl border border-slate-600 text-slate-200 disabled:opacity-30 transition-all active:scale-95 hover:bg-slate-600"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-xs font-bold">上一頁</span>
            </button>
  
            {/* 頁碼顯示 */}
            <div className="flex items-center gap-1.5 bg-slate-950/50 rounded-xl border border-slate-800 px-3 py-2.5">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pageInputValue}
                onChange={(e) => {
                  const raw = e.target.value;
                  setPageInputValue(raw);
                  if (raw === '') return;
                  const v = parseInt(raw);
                  if (!isNaN(v) && v >= 1 && v <= totalPages) navigateToPage(v);
                }}
                onFocus={() => pageInputRef.current?.select()}
                ref={pageInputRef}
                placeholder={String(currentPage)}
                className="w-10 bg-transparent text-center text-base font-bold text-[#00f2fe] outline-none box-border"
                title="直接輸入頁碼"
              />
              <span className="text-sm font-bold text-slate-500">/ {totalPages}</span>
            </div>
  
            {/* 下一頁 */}
            <button
              onClick={() => navigateToPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center justify-center gap-1 px-4 py-2.5 bg-slate-700 rounded-lg border border-slate-600 text-slate-200 disabled:opacity-30 transition-all active:scale-95 hover:bg-slate-700"
            >
              <span className="text-xs font-bold">下一頁</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
  
      {/* ========== 電腦端佈局 (>= lg) ========== */}
      <div className="hidden lg:flex h-full">
        {/* 左側固定側欄 */}
        <aside className="w-80 shrink-0 bg-[#0d1f3e] border-r border-blue-500/20 flex flex-col h-full overflow-hidden">
          {/* 側欄 Header */}
          <div className="p-4 border-b border-blue-500/20">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => router.push('/manifests')}
                className="p-2 rounded-full transition-all active:scale-95 hover:bg-slate-800 text-slate-400 shrink-0"
                title="返回清單列表"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h1 className="font-bold text-white truncate text-base">
                  {manifestName || '載入中...'}
                </h1>
                {isLocked && (
                  <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30 inline-block mt-1">
                    已封存 (唯讀)
                  </span>
                )}
              </div>
            </div>
  
            <div className="flex items-center gap-2">
              <Link
                href={`/summary/${manifestId}`}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-950/50 text-slate-300 rounded-xl border border-slate-800 hover:bg-slate-800 transition-all text-xs font-medium flex-1 justify-center"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>預覽結果</span>
              </Link>
              <button
                onClick={() => setIsErrorDrawerOpen(true)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border transition-all text-xs font-medium flex-1 justify-center ${
                  errorTotal > 0
                    ? 'bg-red-500/10 border-red-500/50 text-red-400'
                    : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>異常清單 ({errorTotal})</span>
              </button>
            </div>
          </div>
  
          {/* 側欄搜尋 */}
          <div className="px-4 py-3">
            <BarcodeSearchBar
              value={barcodeInput}
              onChange={setBarcodeInput}
              onClear={clearBarcodeAndJumpToPending}
              hasMatch={!!matchingItem}
              isLocked={isLocked}
            />
          </div>
  
          {/* 側欄統計 (始終展開) */}
          <div className="px-4 py-3">
            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950/50 rounded-xl border border-slate-800 text-center">
              <div className="flex flex-col items-center p-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold">總項數</span>
                <span className="text-base font-mono font-bold text-slate-300">{totalItems}</span>
              </div>
              <div className="flex flex-col items-center p-1">
                <span className="text-[10px] text-green-500 uppercase font-bold">已完成</span>
                <span className="text-base font-mono font-bold text-green-400">{completedTotal}</span>
              </div>
              <div className="flex flex-col items-center p-1">
                <span className="text-[10px] text-red-500 uppercase font-bold">數量異常</span>
                <span className="text-base font-mono font-bold text-red-400">{errorTotal}</span>
              </div>
              <div className="flex flex-col items-center p-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold">待清點</span>
                <span className="text-base font-mono font-bold text-slate-300">
                  {totalItems - completedTotal - errorTotal}
                </span>
              </div>
            </div>
            {/* 本頁進度 */}
            <div className="mt-2 px-1 flex items-center gap-1">
              <span className="text-[10px] text-slate-500">
                本頁: {pageCompletedCount}/{pageTotalCount}
              </span>
              <TeachingButton module="barcode-scan" variant="inline" />
            </div>
          </div>
  
          {/* 側欄頁碼導覽 */}
          <div className="px-4 py-3 border-t border-blue-500/20 mt-auto">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => navigateToPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-2 bg-slate-700 rounded-lg border border-slate-600 text-slate-200 disabled:opacity-30 transition-all active:scale-95 hover:bg-slate-700"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 bg-slate-950/50 rounded-lg border border-slate-800 px-3 py-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pageInputValue}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setPageInputValue(raw);
                    if (raw === '') return;
                    const v = parseInt(raw);
                    if (!isNaN(v) && v >= 1 && v <= totalPages) navigateToPage(v);
                  }}
                  onFocus={() => pageInputRef.current?.select()}
                  ref={pageInputRef}
                  placeholder={String(currentPage)}
                  className="w-10 bg-transparent text-center text-base font-bold text-[#00f2fe] outline-none box-border"
                  title="直接輸入頁碼"
                />
                <span className="text-sm font-bold text-slate-500">/
                  {totalPages}</span>
              </div>
              <button
                onClick={() => navigateToPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-2 bg-slate-700 rounded-lg border border-slate-600 text-slate-200 disabled:opacity-30 transition-all active:scale-95 hover:bg-slate-700"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </aside>
  
        {/* 右側主區域: 藥品列表 */}
        <main className="flex-1 overflow-y-auto p-6">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            capture="environment"
            className="hidden"
          />
  
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="w-10 h-10 border-4 border-[#00f2fe] border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 animate-pulse">載入數據中...</p>
            </div>
          ) : drugs.length === 0 ? (
            <div className="text-center py-20 tech-card border-dashed border-slate-700 space-y-4">
              <Package className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-slate-500">本頁沒有藥品項目</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {drugs
                .filter((drug) => !barcodeInput || getMatchScore(drug, barcodeInput) > 0)
                .map((drug) => {
                  const isMatched = getMatchScore(drug, barcodeInput) > 0;
                  const isUploading = uploadingQueue.has(drug.id);
  
                  return (
                    <div
                      key={drug.id}
                      className={`transition-all duration-300 ${
                        barcodeInput && !isMatched ? 'opacity-25 grayscale scale-[0.98]' : ''
                      }`}
                    >
                      <DrugCard
                        drug={drug}
                        isMatched={isMatched}
                        isUploading={isUploading}
                        isLocked={isLocked}
                        actualQuantity={actualQuantity}
                        selectedStatus={selectedStatus}
                        onStatusSelect={setSelectedStatus}
                        onActualQuantityChange={setActualQuantity}
                        onTriggerCamera={triggerCamera}
                        onPreviewPhoto={setPreviewImage}
                        onFilterByBarcode={setBarcodeInput}
                        onResetDrug={handleResetDrug}
                      />
                    </div>
                  );
                })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}