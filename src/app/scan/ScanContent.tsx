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
} from 'lucide-react';
import Link from 'next/link';
import { DrugCard, ErrorDrawer, JumpDialog, PhotoPreview, BarcodeSearchBar } from './components';
import { useBarcodeMatch, usePhotoCapture, usePagePersistence } from './hooks';
import type { DrugItem, ErrorDrugItem, JumpTarget } from '@/types';

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

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const { initializedRef, lastVisitedPage, setLastVisitedPage, lastVisitedPageRef, lastScrollY, setLastScrollY, lastScrollYRef, saveState, restorePage } = usePagePersistence(manifestId);
  const { matchingItem, getMatchScore } = useBarcodeMatch(drugs, barcodeInput);

  const navigateToPage = (page: number) => {
    setCurrentPage(page);
  };

  const fetchPageData = useCallback(async () => {
    if (!manifestId) return;

    setLoading(true);
    try {
      const { data: manifest } = await supabase
        .from('manifests')
        .select('name, status, total_items')
        .eq('id', manifestId)
        .single();

      if (manifest) {
        setManifestName(manifest.name);
        setIsLocked(manifest.status === 'completed');
        setTotalItems(manifest.total_items);
        setTotalPages(Math.ceil(manifest.total_items / 44));
      }

      const [completedRes, errorRes, pageRes, errorItemsRes] = await Promise.all([
        supabase
          .from('drug_items')
          .select('*', { count: 'exact', head: true })
          .eq('manifest_id', manifestId)
          .eq('counted_status', 'completed'),
        supabase
          .from('drug_items')
          .select('*', { count: 'exact', head: true })
          .eq('manifest_id', manifestId)
          .eq('counted_status', 'error'),
        supabase
          .from('drug_items')
          .select('*')
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

      setCompletedTotal(completedRes.count || 0);
      setErrorTotal(errorRes.count || 0);
      setErrorDrugs(errorItemsRes.data || []);

      if (pageRes.error) throw pageRes.error;
      setDrugs(pageRes.data || []);
    } catch (error) {
      console.error('Error fetching page data:', error);
      alert('載入數據失敗，請刷新頁面');
    } finally {
      setLoading(false);
    }
  }, [manifestId, currentPage]);

  

  const autoJumpToNext = useCallback(
    (currentDrugs: DrugItem[]) => {
      const nextPending = currentDrugs.find((d) => d.counted_status === 'pending');
      if (nextPending) {
        setBarcodeInput(nextPending.barcode);
        setTimeout(() => {
          const element = document.querySelector(`[data-drug-id="${nextPending.id}"]`);
          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    },
    []
  );

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
      autoJumpToNext(drugs);
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
    if (!initializedRef.current) {
      initializedRef.current = true;
      fetchPageData();
      return;
    }
    saveState(currentPage);
    fetchPageData();
  }, [currentPage, manifestId]);

  // 行動裝置鍵盤彈出時自動將輸入框滾動到可視區域
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleResize = () => {
      const inputEl = document.getElementById('search-barcode');
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
      navigateToPage(target.page);
      setBarcodeInput(target.barcode);
      setTimeout(() => {
        const element = document.querySelector(`[data-drug-id="${target.id}"]`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
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
    <div className="h-screen bg-[#07142b] text-slate-200 flex flex-col overflow-hidden">
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
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <button
            onClick={() => {
              setBarcodeInput('');
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

      <header className="bg-[#162a56]/80 backdrop-blur-sm border-b border-blue-500/20 sticky top-0 z-10 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (barcodeInput) {
                  setBarcodeInput('');
                } else {
                  router.push('/manifests');
                }
              }}
              className="p-2 rounded-full transition-all active:scale-95 hover:bg-slate-800 text-slate-400"
              title={barcodeInput ? '清除搜尋' : '返回清單列表'}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-bold text-white truncate max-w-[150px]">
                {manifestName || '載入中...'}
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-500">分頁清點模式</p>
                <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/30">
                  本頁 {pageCompletedCount}/{pageTotalCount}
                </span>
                {isLocked && (
                  <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30">
                    已封存 (唯讀)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/summary/${manifestId}`}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/50 text-slate-300 rounded-xl border border-slate-800 hover:bg-slate-800 transition-all text-sm font-medium"
            >
              <FileText className="w-4 h-4" />
              <span>預覽結果</span>
            </Link>
            <button
              onClick={() => setIsErrorDrawerOpen(true)}
              className={`flex items-center gap-2 px-3 py-1.5 bg-slate-950/50 text-slate-300 rounded-xl border transition-all text-sm font-medium ${
                errorTotal > 0
                  ? 'border-red-500/50 text-red-400 hover:bg-red-500/10'
                  : 'border-slate-800 hover:bg-slate-800'
              }`}
            >
              <AlertCircle className="w-4 h-4" />
              <span>異常清單 ({errorTotal})</span>
            </button>
            <div className="flex items-center gap-2 bg-slate-950/50 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => navigateToPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-1 hover:bg-slate-800 rounded disabled:opacity-30 transition-all active:scale-95"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
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
                className="w-8 bg-transparent text-center text-sm font-bold text-slate-300 outline-none"
                title="直接輸入頁碼"
              />
              <span className="text-sm font-bold text-slate-500">/ {totalPages}</span>
              <button
                onClick={() => navigateToPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-1 hover:bg-slate-800 rounded disabled:opacity-30 transition-all active:scale-95"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 p-2 bg-slate-950/50 rounded-xl border border-slate-800 text-center">
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

        <BarcodeSearchBar
          value={barcodeInput}
          onChange={setBarcodeInput}
          onClear={() => setBarcodeInput('')}
          hasMatch={!!matchingItem}
          isLocked={isLocked}
        />
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
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
          <div className="space-y-4">
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
                    />
                  </div>
                );
              })}
          </div>
        )}
      </main>

      <footer className="p-4 bg-[#07142b] border-t border-slate-800 text-center">
        <p className="text-xs text-slate-500 font-medium">
          請掃描條碼以激活數量輸入與拍照按鈕
        </p>
      </footer>
    </div>
  );
}