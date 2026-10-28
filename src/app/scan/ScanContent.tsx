'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  X,
  Camera as CameraIcon,
  RefreshCw,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { TeachingButton } from '@/components/teaching';
import { DrugCard, ErrorDrawer, JumpDialog, PhotoPreview, BarcodeSearchBar, CameraModal, EditDrugModal } from './components';
import { useBarcodeMatch, usePhotoCapture, usePagePersistence } from './hooks';
import { useScanKeyboard } from './hooks/useScanKeyboard';
import { useImageCache } from './hooks/useImageCache';
import type { DrugItem, ErrorDrugItem, JumpTarget } from '@/types';
import { resetDrugStatus } from '@/app/actions/scan/resetDrug';
import { updateDrugStatus } from '@/app/actions/scan/updatePhoto';
import { useNavigationProgress } from '@/components/navigation/NavigationProgress';
import { editDrug } from '@/app/actions/scan/editDrug';

export default function ScanContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const manifestId = searchParams.get('manifestId');
  const supabase = createClient();

  const pageParam = searchParams.get('page');
  const initialPage = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
  const [currentPage, setCurrentPage] = useState(initialPage);
  const barcodeParam = searchParams.get('barcode');
  const [drugs, setDrugs] = useState<DrugItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState(barcodeParam || '');
  const [loading, setLoading] = useState(true);
  const [manifestName, setManifestName] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [errorTotal, setErrorTotal] = useState(0);
  const [errorDrugs, setErrorDrugs] = useState<ErrorDrugItem[]>([]);
  const [isErrorDrawerOpen, setIsErrorDrawerOpen] = useState(false);
  const [selectedItemPendingAction, setSelectedItemPendingAction] = useState<string | null>(null);
  const [manuallySelectedDrugId, setManuallySelectedDrugId] = useState<string | null>(null);

  const [actualQuantity, setActualQuantity] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<'correct' | 'incorrect' | 'pending_photo' | 'pending_skip' | null>(null);
  const [jumpTarget, setJumpTarget] = useState<JumpTarget | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [actionDrug, setActionDrug] = useState<DrugItem | null>(null);
  const [isJumpingToQuery, setIsJumpingToQuery] = useState(false);
  const { startNavigation } = useNavigationProgress();
  const [toast, setToast] = useState<string | null>(null);
  const [pageInputValue, setPageInputValue] = useState<string>('');
  const pageInputRef = useRef<HTMLInputElement>(null);
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);

  // 編輯藥品 Modal 狀態
  const [editDrugModal, setEditDrugModal] = useState<{ isOpen: boolean; drug: DrugItem | null }>({ isOpen: false, drug: null });
  const [editDrugLoading, setEditDrugLoading] = useState(false);

  // 導航確認 Modal 狀態
  const [showNavConfirm, setShowNavConfirm] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  
  // Image cache hook
  const imageCache = useImageCache(manifestId);
  const { isKeyboardOpen } = useScanKeyboard();
  const shouldJumpToNextRef = useRef(false);
  const pendingBarcodeRef = useRef<string | null>(barcodeParam);
  const hasAppliedDirectJumpRef = useRef(false);
  const requestRef = useRef<{ manifestId: string | null; currentPage: number } | null>(null);
  const prevManifestIdRef = useRef<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const handleCardLongPress = useCallback((drug: DrugItem) => {
    setActionDrug(drug);
  }, []);

  const fetchPageData = useCallback(async () => {
    if (!manifestId || manifestId === 'dummy') return;

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
          .select('id, manifest_id, page_number, name, barcode, product_code, actual_quantity, expected_quantity, warehouse_quantity, storage_location, category, bonus_quantity, counted_status, item_order, photo_url')
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

      // 如果由查詢頁直達補盤，以 drugId / drugName / item_order 複合匹配選取並高亮定位目標（不覆蓋搜尋框，避免誤篩）
      const highlightItemOrder = searchParams.get('highlightItem');
      const targetDrugId = searchParams.get('drugId');
      const targetDrugName = searchParams.get('drugName');

      if (!hasAppliedDirectJumpRef.current && (targetDrugId || highlightItemOrder || targetDrugName)) {
        hasAppliedDirectJumpRef.current = true;
        const orderNum = highlightItemOrder ? parseInt(highlightItemOrder, 10) : null;

        let match: DrugItem | undefined;
        if (targetDrugId) {
          match = fetchedDrugs.find((d) => d.id === targetDrugId);
        }
        if (!match && targetDrugName) {
          const normTargetName = targetDrugName.replace(/\s+/g, '').toLowerCase();
          match = fetchedDrugs.find(
            (d) => (d.name || '').replace(/\s+/g, '').toLowerCase() === normTargetName
          );
        }
        if (!match && orderNum !== null && !isNaN(orderNum)) {
          match = fetchedDrugs.find((d) => d.item_order === orderNum);
        }

        if (match) {
          setManuallySelectedDrugId(match.id);
          setTimeout(() => {
            const el = document.querySelector(`[data-drug-id="${match.id}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 350);
        }
      }

      // 預載入首屏圖片 (手機 ~12 項, 桌面 ~24 項)
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
      const visibleCount = isMobile ? 12 : 24;
      const firstScreenKeys = fetchedDrugs
        .slice(0, visibleCount)
        .map(d => d.photo_url)
        .filter((k): k is string => !!k && k.trim() !== '');
      if (firstScreenKeys.length > 0) {
        imageCache.preloadUrls(firstScreenKeys);
      }

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
      console.error('Error fetching page data:', (error as Error)?.message || error);
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
    if (!manifestId || manifestId === 'dummy') {
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
        console.error('Error fetching manifest name:', (err as Error)?.message || err);
        setManifestName('未知清單');
      }
    };

    fetchManifestName();
  }, [manifestId, supabase]);

  const { initializedRef, lastVisitedPage, setLastVisitedPage, lastVisitedPageRef, lastScrollY, setLastScrollY, lastScrollYRef, saveState, restorePage } = usePagePersistence(manifestId);
  const { matchingItem, getMatchScore } = useBarcodeMatch(drugs, barcodeInput);

  // 拍照專用：只更新統計數字 + 刷新特定藥品狀態，不重載全部列表
  const refreshStatsOnly = useCallback(async () => {
    if (!manifestId) return;
    try {
      // 先記住當前匹配的藥品 ID（之後會被清空）
      const targetDrugId = matchingItem?.id;

      const [totalRes, completedRes, errorItemsRes] = await Promise.all([
        supabase
          .from('drug_items')
          .select('*', { count: 'exact', head: true })
          .eq('manifest_id', manifestId),
        supabase
          .from('drug_items')
          .select('*', { count: 'exact', head: true })
          .eq('manifest_id', manifestId)
          .eq('counted_status', 'completed'),
        supabase
          .from('drug_items')
          .select('id, page_number, name, barcode, actual_quantity, expected_quantity')
          .eq('manifest_id', manifestId)
          .eq('counted_status', 'error')
          .order('page_number', { ascending: true }),
      ]);
      setTotalItems(totalRes.count || 0);
      setCompletedTotal(completedRes.count || 0);
      setErrorTotal(errorItemsRes.data?.length || 0);
      setErrorDrugs(errorItemsRes.data || []);

      // 從 server 取該藥品的最新資料來刷新本地列表
      if (targetDrugId) {
        const { data: updatedDrug } = await supabase
          .from('drug_items')
          .select('id, manifest_id, page_number, name, barcode, actual_quantity, expected_quantity, warehouse_quantity, storage_location, category, bonus_quantity, counted_status, item_order, photo_url')
          .eq('id', targetDrugId)
          .single();

        if (updatedDrug) {
          setDrugs(prev => prev.map(d => d.id === targetDrugId ? updatedDrug as DrugItem : d));
        }
      }
    } catch (err) {
      console.error('Error refreshing stats:', err);
    }
  }, [manifestId, supabase, matchingItem]);

  const handleSkipPhoto = useCallback(
    async (drugId: string) => {
      if (!matchingItem || matchingItem.id !== drugId) return;
      try {
        const res = await updateDrugStatus(drugId, null, parseInt(actualQuantity || '0'));
        if (!res.success) throw new Error(res.error);

        // 成功後重置輸入狀態，然後只刷新統計 + 單一 drug（不動整個列表）
        setSelectedStatus(null);
        setActualQuantity('');
        setBarcodeInput('');
        await refreshStatsOnly();
        showToast('已標記為有誤（未拍照）');
      } catch (err: any) {
        setSelectedStatus(null);
        showToast(`跳過失敗：${err.message}`);
      }
    },
    [matchingItem, actualQuantity, refreshStatsOnly, showToast]
  );

  // 編輯藥品處理
  const handleEditDrug = useCallback((drug: DrugItem) => {
    setEditDrugModal({ isOpen: true, drug });
  }, []);

  const handleEditDrugSave = useCallback(async (updates: {
    name?: string;
    barcode?: string;
    product_code?: string | null;
    expected_quantity?: number;
    warehouse_quantity?: number | null;
    storage_location?: string;
    category?: string;
  }) => {
    if (!editDrugModal.drug) return;
    const drugIdToRefresh = editDrugModal.drug.id;
    setEditDrugLoading(true);
    try {
      const result = await editDrug({
        drugId: editDrugModal.drug.id,
        updates,
      });
      if (result.success && result.data) {
        setEditDrugModal({ isOpen: false, drug: null });
        // 直接使用 Server Action 回傳的完整資料（包含 product_code），避免額外查詢
        setDrugs(prev => prev.map(d => d.id === drugIdToRefresh ? result.data! : d));
        // 同步更新統計
        const [totalRes, completedRes, errorItemsRes] = await Promise.all([
          supabase.from('drug_items').select('*', { count: 'exact', head: true }).eq('manifest_id', manifestId),
          supabase.from('drug_items').select('*', { count: 'exact', head: true }).eq('manifest_id', manifestId).eq('counted_status', 'completed'),
          supabase.from('drug_items').select('id, page_number, name, barcode, actual_quantity, expected_quantity').eq('manifest_id', manifestId).eq('counted_status', 'error').order('page_number', { ascending: true }),
        ]);
        setTotalItems(totalRes.count || 0);
        setCompletedTotal(completedRes.count || 0);
        setErrorTotal(errorItemsRes.data?.length || 0);
        setErrorDrugs(errorItemsRes.data || []);
        showToast('藥品資料已更新');
      } else {
        showToast(result.error || '更新失敗');
      }
    } catch (err: any) {
      showToast(`更新失敗：${err.message}`);
    } finally {
      setEditDrugLoading(false);
    }
  }, [editDrugModal.drug, manifestId, supabase, showToast]);

  const handleEditDrugClose = useCallback(() => {
    setEditDrugModal({ isOpen: false, drug: null });
  }, []);

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

  // 清除搜尋（不再自動跳轉，因為雙層架構下底層自動保持位置）
  const clearBarcodeAndJumpToPending = useCallback(() => {
    setBarcodeInput('');
  }, []);

  // 拍照專用：清空輸入，不觸發自動跳轉（滾動位置由相機關閉時恢復）
  const onResetInputForCamera = useCallback(() => {
    setBarcodeInput('');
    setActualQuantity('');
    setSelectedStatus(null);
    // 不設定 shouldJumpToNextRef.current = true，避免自動滾動
  }, []);

  const { 
    fileInputRef, 
    uploadingQueue, 
    triggerCamera, 
    handleFileUpload,
    handleCameraFile,
    showCameraModal,
    setShowCameraModal,
    cameraError,
    setCameraError,
    checkingCameraSupport,
    setCheckingCameraSupport,
    // 新增：佇列持久化相關
    hasPendingUploads,
    pendingUploadsCount,
    restorePendingUploads,
  } = usePhotoCapture({
    manifestId,
    matchingItem,
    selectedStatus,
    actualQuantity,
    onToast: showToast,
    onRefresh: refreshStatsOnly,
    onResetInput: onResetInputForCamera,
  });

  // ==================== 導航攔截與恢復邏輯 ====================

  // 統一導航函數：若有待上傳則顯示確認 Modal，否則直接執行導航
  const safeNavigate = useCallback((navigateFn: () => void, navigationMessage?: string) => {
    const wrappedFn = () => {
      startNavigation(navigationMessage || '頁面跳轉中...');
      navigateFn();
    };
    if (hasPendingUploads) {
      setPendingNavigation(() => wrappedFn);
      setShowNavConfirm(true);
    } else {
      wrappedFn();
    }
  }, [hasPendingUploads, startNavigation]);

  // 確認導航：執行暫存的導航動作
  const confirmNavigation = useCallback(() => {
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
    setShowNavConfirm(false);
  }, [pendingNavigation]);

  // 取消導航
  const cancelNavigation = useCallback(() => {
    setPendingNavigation(null);
    setShowNavConfirm(false);
  }, []);

  // beforeunload 事件：關閉分頁/重新整理時攔截
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasPendingUploads) {
        e.preventDefault();
        e.returnValue = '有照片正在上傳中，離開頁面將導致上傳中斷。確定要離開嗎？';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasPendingUploads]);

  // 頁面載入時自動恢復上傳
  useEffect(() => {
    if (hasPendingUploads) {
      const restore = async () => {
        const tasks = await restorePendingUploads();
        if (tasks && tasks.length > 0) {
          showToast(`發現 ${tasks.length} 張照片未上傳完成，請逐一重新拍照上傳`);
        }
      };
      restore();
    }
  }, [hasPendingUploads, restorePendingUploads, showToast]);

  // ==================== 導航確認 Modal 元件 ====================
  const NavigationConfirmModal = () => {
    if (!showNavConfirm) return null;

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative w-full max-w-md mx-4 bg-[#162a56] border border-[#00f2fe]/30 rounded-lg shadow-[0_0_30px_rgba(0,242,254,0.15)] overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="p-6 text-center">
            <div className="w-14 h-14 mx-auto mb-4 bg-[#00f2fe]/10 border border-[#00f2fe]/30 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-[#00f2fe]" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">照片正在上傳中</h3>
            <p className="text-slate-300 mb-1">目前有 <span className="font-bold text-[#00f2fe]">{pendingUploadsCount}</span> 張照片尚未完成上傳</p>
            <p className="text-slate-400 text-sm mt-1">離開頁面將導致上傳中斷，需重新拍照</p>
          </div>
          <div className="flex border-t border-[#00f2fe]/20">
            <button
              onClick={cancelNavigation}
              className="flex-1 py-3 text-slate-300 font-medium hover:bg-slate-800 transition-colors active:scale-[0.98]"
            >
              取消離開
            </button>
            <div className="w-px bg-[#00f2fe]/20" />
            <button
              onClick={confirmNavigation}
              className="flex-1 py-3 text-white font-bold bg-[#ff4b5c]/20 border-l border-[#ff4b5c]/30 hover:bg-[#ff4b5c]/30 transition-colors active:scale-[0.98]"
            >
              確定離開
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 處理返回操作：若來自查詢頁，直接返回前頁或攜帶原查詢狀態；若在盤點頁，先清除搜尋或返回清單
  const handleBackNavigation = useCallback(() => {
    if (searchParams.get('from') === 'query') {
      safeNavigate(
        () => {
          if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
          } else {
            const returnQ = searchParams.get('returnQuery') || '';
            const returnId = searchParams.get('returnRecordId') || '';
            const params = new URLSearchParams({ return: 'true' });
            if (returnQ) params.set('q', returnQ);
            if (returnId) params.set('selected', returnId);
            router.push(`/query?${params.toString()}`);
          }
        },
        '返回藥品查詢...'
      );
      return;
    }

    if (barcodeInput) {
      clearBarcodeAndJumpToPending();
      return;
    }

    safeNavigate(
      () => router.push('/manifests'),
      '返回清單列表...'
    );
  }, [barcodeInput, clearBarcodeAndJumpToPending, router, safeNavigate, searchParams]);

  // 恢復上次的頁碼（若 URL 已指定 page 或 barcode 則以 URL 為準）
  useEffect(() => {
    if (!manifestId) return;
    const urlPage = searchParams.get('page');
    if (urlPage) {
      const parsedPage = parseInt(urlPage, 10);
      if (!isNaN(parsedPage) && parsedPage > 0) {
        queueMicrotask(() => setCurrentPage(parsedPage));
        return;
      }
    }
    if (searchParams.get('barcode')) return;
    const savedPage = restorePage();
    if (savedPage) {
      // 使用 queueMicrotask 避免在 effect 內同步 setState
      queueMicrotask(() => setCurrentPage(savedPage));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestId, searchParams]);

  // 恢復來自查詢頁面返回時的藥品捲動位置
  useEffect(() => {
    if (!manifestId || drugs.length === 0) return;
    const raw = sessionStorage.getItem(`scan_return_state_${manifestId}`);
    if (!raw) return;

    try {
      const { drugId, scrollY } = JSON.parse(raw);
      sessionStorage.removeItem(`scan_return_state_${manifestId}`);
      const timer = setTimeout(() => {
        if (drugId) {
          const el = document.querySelector(`[data-drug-id="${drugId}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
          }
        }
        if (typeof scrollY === 'number') {
          window.scrollTo({ top: scrollY, behavior: 'instant' });
        }
      }, 150);

      return () => clearTimeout(timer);
    } catch (e) {
      console.warn('Failed to restore return position:', e);
    }
  }, [drugs, manifestId]);

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
          .or(`barcode.ilike.%${barcodeInput}%,product_code.ilike.%${barcodeInput}%,name.ilike.%${barcodeInput}%`)
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

  const allPageCompleted = drugs.length > 0 && drugs.every((d) => d.counted_status !== 'pending');
  useEffect(() => {
    if (allPageCompleted && !loading && currentPage === totalPages) {
      queueMicrotask(() => showToast('所有分頁已全部清點完成'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPageCompleted, currentPage, totalPages, loading]);

  return (
    <>
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

      {/* 卡片長按操作選單 Modal */}
      {actionDrug && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"
          onClick={() => setActionDrug(null)}
        >
          <div
            className="bg-[#162a56] border border-[#233d7a] rounded-2xl sm:rounded-3xl max-w-md w-full p-4 sm:p-5 shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 標題與藥品資訊 */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-700/80">
              <div className="min-w-0 flex-1 pr-2">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[11px] px-2 py-0.5 rounded bg-[#00f2fe]/10 text-[#00f2fe] font-mono border border-[#00f2fe]/30">
                    P.{actionDrug.page_number} #{actionDrug.item_order}
                  </span>
                  {actionDrug.barcode && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
                      {actionDrug.barcode}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-white truncate">
                  {actionDrug.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  儲位：{actionDrug.storage_location || '—'} • 應收：{actionDrug.expected_quantity}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActionDrug(null)}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs ml-2 shrink-0"
              >
                ✕
              </button>
            </div>

            {/* 選項清單 */}
            <div className="space-y-2.5">
              {/* 選項一：直接查詢此項紀錄 */}
              <button
                type="button"
                onClick={() => {
                  setIsJumpingToQuery(true);
                  startNavigation(`正在跳轉至「${actionDrug.name}」查詢紀錄...`);
                  saveState(currentPage);
                  if (manifestId) {
                    sessionStorage.setItem(
                      `scan_return_state_${manifestId}`,
                      JSON.stringify({
                        page: currentPage,
                        scrollY: window.scrollY,
                        drugId: actionDrug.id,
                      })
                    );
                  }
                  const queryTarget = actionDrug.barcode || actionDrug.name;
                  const returnUrl = `/scan?manifestId=${encodeURIComponent(manifestId || '')}&page=${currentPage}&restoreScroll=true`;
                  router.push(
                    `/query?q=${encodeURIComponent(queryTarget)}&returnUrl=${encodeURIComponent(returnUrl)}&from=scan`
                  );
                }}
                disabled={isJumpingToQuery}
                className={`w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#00f2fe] to-blue-500 text-[#07142b] font-bold text-sm shadow-[0_0_15px_rgba(0,242,254,0.3)] hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 ${
                  isJumpingToQuery ? 'opacity-80 pointer-events-none' : ''
                }`}
              >
                {isJumpingToQuery ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#07142b]" />
                    <span>跳轉查詢中...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span>直接查詢此項紀錄</span>
                  </>
                )}
              </button>

              {/* 取消按鈕 */}
              <button
                type="button"
                onClick={() => setActionDrug(null)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700 active:scale-98 transition-all"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
  
      {/* ========== 手機端佈局 (< lg) ========== */}
      <div className="flex flex-col min-h-0 h-full lg:hidden">
        {/* 精簡 Header */}
        <header className="shrink-0 bg-[#162a56]/80 backdrop-blur-sm border-b border-blue-500/20 z-10 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={handleBackNavigation}
                className="p-2 rounded-full transition-all active:scale-95 hover:bg-slate-800 text-slate-400 shrink-0"
                title={searchParams.get('from') === 'query' ? '返回藥品查詢' : barcodeInput ? '清除搜尋' : '返回清單列表'}
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
              <button
                onClick={() =>
                  safeNavigate(
                    () => router.push(`/summary/${manifestId}`),
                    '正在開啟清點總結報告...'
                  )
                }
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-950/50 text-slate-300 rounded-xl border border-slate-800 hover:bg-slate-800 transition-all text-xs font-medium active:scale-95"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>預覽</span>
              </button>
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

        {/* 藥品列表容器 */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <main data-scroll-main className="absolute inset-0 overflow-y-auto pb-4 px-4">
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
              <div className={barcodeInput ? 'invisible' : 'visible'}>
                <div className="space-y-3 pt-2">
                  {drugs.map((drug) => {
                    const isUploading = uploadingQueue.has(drug.id);
                    const isManuallySelected = manuallySelectedDrugId === drug.id;
                    const shouldShowActionsForCard = isManuallySelected;
                    const photoKey = drug.photo_url || '';

                    return (
                      <div key={drug.id} className="mb-4">
                        <DrugCard
                          drug={drug}
                          photoKey={photoKey}
                          isMatched={shouldShowActionsForCard}
                          isUploading={isUploading}
                          isLocked={isLocked}
                          isManuallySelected={isManuallySelected}
                          actualQuantity={actualQuantity}
                          selectedStatus={selectedStatus}
                          onStatusSelect={setSelectedStatus}
                          onActualQuantityChange={setActualQuantity}
                          onTriggerCamera={triggerCamera}
                          onPreviewPhoto={setPreviewImage}
                          onFilterByBarcode={setBarcodeInput}
                          onResetDrug={handleResetDrug}
                          onSkipPhoto={() => handleSkipPhoto(drug.id)}
                          onCardClick={(id) => {
                            setManuallySelectedDrugId(id);
                          }}
                          onLongPress={handleCardLongPress}
                          onEditDrug={handleEditDrug}
                          getImageUrl={imageCache.getUrl}
                          getImageLoadStatus={imageCache.getLoadStatus}
                          setImageLoadStatus={imageCache.setLoadStatus}
                          getImageLoadProgress={imageCache.getImageLoadProgress}
                          downloadImageWithProgress={imageCache.downloadImageWithProgress}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </main>

          {/* 篩選疊層 */}
          {barcodeInput && (
            <div data-scroll-filter className="absolute inset-0 overflow-y-auto bg-[#07142b] z-10 px-4 pb-4">
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
                  <div className="flex items-center justify-between px-1 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[#00f2fe] text-xs font-bold uppercase tracking-wider">🔍 篩選結果</span>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                        {drugs.filter((d) => getMatchScore(d, barcodeInput) > 0).length} 項匹配
                      </span>
                    </div>
                    <button
                      onClick={clearBarcodeAndJumpToPending}
                      className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/20 transition-colors"
                    >
                      清除
                    </button>
                  </div>
                  {(() => {
                    const matchedDrugs = drugs
                      .filter((d) => getMatchScore(d, barcodeInput) > 0)
                      .sort((a, b) => {
                        const scoreDiff = getMatchScore(b, barcodeInput) - getMatchScore(a, barcodeInput);
                        if (scoreDiff !== 0) return scoreDiff;
                        return a.item_order - b.item_order;
                      });

                    if (matchedDrugs.length === 0) {
                      return (
                        <div className="text-center py-12 tech-card border-dashed border-slate-700 space-y-3">
                          <span className="text-slate-500 text-sm">無匹配項目</span>
                          <span className="text-slate-600 text-xs">請嘗試其他條碼</span>
                        </div>
                      );
                    }

                    return matchedDrugs.map((drug) => {
                      const isTopMatch = matchedDrugs[0].id === drug.id;
                      const isUploading = uploadingQueue.has(drug.id);
                      const isDimmed = !isTopMatch;
                      const photoKey = drug.photo_url || '';

                      return (
                        <div key={drug.id} data-drug-id={drug.id} className={`mb-4 ${isDimmed ? 'opacity-60' : ''}`}>
                          <DrugCard
                            drug={drug}
                            photoKey={photoKey}
                            isMatched={isTopMatch}
                            isUploading={isUploading}
                            isLocked={isLocked}
                            isManuallySelected={false}
                            actualQuantity={actualQuantity}
                            selectedStatus={isTopMatch ? selectedStatus : null}
                            onStatusSelect={isTopMatch ? setSelectedStatus : () => {}}
                            onActualQuantityChange={isTopMatch ? setActualQuantity : () => {}}
                            onTriggerCamera={isTopMatch ? triggerCamera : () => {}}
                            onPreviewPhoto={setPreviewImage}
                            onFilterByBarcode={setBarcodeInput}
                            onResetDrug={handleResetDrug}
                            onSkipPhoto={() => isTopMatch && handleSkipPhoto(drug.id)}
                            onCardClick={(id) => {
                              setManuallySelectedDrugId(id);
                            }}
                            onLongPress={handleCardLongPress}
                            onEditDrug={handleEditDrug}
                            getImageUrl={imageCache.getUrl}
                            getImageLoadStatus={imageCache.getLoadStatus}
                            setImageLoadStatus={imageCache.setLoadStatus}
                            getImageLoadProgress={imageCache.getImageLoadProgress}
                            downloadImageWithProgress={imageCache.downloadImageWithProgress}
                          />
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
  
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
                onClick={handleBackNavigation}
                className="p-2 rounded-full transition-all active:scale-95 hover:bg-slate-800 text-slate-400 shrink-0"
                title={searchParams.get('from') === 'query' ? '返回藥品查詢' : '返回清單列表'}
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
              <button
                onClick={() =>
                  safeNavigate(
                    () => router.push(`/summary/${manifestId}`),
                    '正在開啟清點總結報告...'
                  )
                }
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-950/50 text-slate-300 rounded-xl border border-slate-800 hover:bg-slate-800 transition-all text-xs font-medium flex-1 justify-center active:scale-95"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>預覽結果</span>
              </button>
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
  
        {/* 右側主區域: 藥品列表容器 */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <main data-scroll-main className="absolute inset-0 overflow-y-auto p-6">
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
              <div className={barcodeInput ? 'invisible' : 'visible'}>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {drugs.map((drug) => {
                    const isUploading = uploadingQueue.has(drug.id);
                    const isManuallySelected = manuallySelectedDrugId === drug.id;
                    const shouldShowActionsForCard = isManuallySelected;
                    const photoKey = drug.photo_url || '';

                    return (
                      <div key={drug.id}>
                        <DrugCard
                          drug={drug}
                          photoKey={photoKey}
                          isMatched={shouldShowActionsForCard}
                          isUploading={isUploading}
                          isLocked={isLocked}
                          isManuallySelected={isManuallySelected}
                          actualQuantity={actualQuantity}
                          selectedStatus={selectedStatus}
                          onStatusSelect={setSelectedStatus}
                          onActualQuantityChange={setActualQuantity}
                          onTriggerCamera={triggerCamera}
                          onPreviewPhoto={setPreviewImage}
                          onFilterByBarcode={setBarcodeInput}
                          onResetDrug={handleResetDrug}
                          onSkipPhoto={() => handleSkipPhoto(drug.id)}
                          onCardClick={(id) => {
                            setManuallySelectedDrugId(id);
                          }}
                          onLongPress={handleCardLongPress}
                          onEditDrug={handleEditDrug}
                          getImageUrl={imageCache.getUrl}
                          getImageLoadStatus={imageCache.getLoadStatus}
                          setImageLoadStatus={imageCache.setLoadStatus}
                          getImageLoadProgress={imageCache.getImageLoadProgress}
                          downloadImageWithProgress={imageCache.downloadImageWithProgress}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </main>

          {/* 篩選疊層 */}
          {barcodeInput && (
            <div data-scroll-filter className="absolute inset-0 overflow-y-auto bg-[#07142b] z-10 p-6">
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
                  <div className="flex items-center justify-between px-1 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[#00f2fe] text-xs font-bold uppercase tracking-wider">🔍 篩選結果</span>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                        {drugs.filter((d) => getMatchScore(d, barcodeInput) > 0).length} 項匹配
                      </span>
                    </div>
                    <button
                      onClick={clearBarcodeAndJumpToPending}
                      className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/20 transition-colors"
                    >
                      清除
                    </button>
                  </div>
                  {(() => {
                    const matchedDrugs = drugs
                      .filter((d) => getMatchScore(d, barcodeInput) > 0)
                      .sort((a, b) => {
                        const scoreDiff = getMatchScore(b, barcodeInput) - getMatchScore(a, barcodeInput);
                        if (scoreDiff !== 0) return scoreDiff;
                        return a.item_order - b.item_order;
                      });

                    if (matchedDrugs.length === 0) {
                      return (
                        <div className="text-center py-12 tech-card border-dashed border-slate-700 space-y-3">
                          <span className="text-slate-500 text-sm">無匹配項目</span>
                          <span className="text-slate-600 text-xs">請嘗試其他條碼</span>
                        </div>
                      );
                    }

                    return matchedDrugs.map((drug) => {
                      const isTopMatch = matchedDrugs[0].id === drug.id;
                      const isUploading = uploadingQueue.has(drug.id);
                      const isDimmed = !isTopMatch;
                      const photoKey = drug.photo_url || '';

                      return (
                        <div key={drug.id} data-drug-id={drug.id} className={`mb-4 ${isDimmed ? 'opacity-60' : ''}`}>
                          <DrugCard
                            drug={drug}
                            photoKey={photoKey}
                            isMatched={isTopMatch}
                            isUploading={isUploading}
                            isLocked={isLocked}
                            isManuallySelected={false}
                            actualQuantity={actualQuantity}
                            selectedStatus={isTopMatch ? selectedStatus : null}
                            onStatusSelect={isTopMatch ? setSelectedStatus : () => {}}
                            onActualQuantityChange={isTopMatch ? setActualQuantity : () => {}}
                            onTriggerCamera={isTopMatch ? triggerCamera : () => {}}
                            onPreviewPhoto={setPreviewImage}
                            onFilterByBarcode={setBarcodeInput}
                            onResetDrug={handleResetDrug}
                            onSkipPhoto={() => isTopMatch && handleSkipPhoto(drug.id)}
                            onCardClick={(id) => {
                              setManuallySelectedDrugId(id);
                            }}
                            onLongPress={handleCardLongPress}
                            onEditDrug={handleEditDrug}
                            getImageUrl={imageCache.getUrl}
                            getImageLoadStatus={imageCache.getLoadStatus}
                            setImageLoadStatus={imageCache.setLoadStatus}
                            getImageLoadProgress={imageCache.getImageLoadProgress}
                            downloadImageWithProgress={imageCache.downloadImageWithProgress}
                          />
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    {showCameraModal && (
      <CameraModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={handleCameraFile}
        onError={setCameraError}
        onCheckingSupport={setCheckingCameraSupport}
      />
    )}
    {editDrugModal.isOpen && (
      <EditDrugModal
        isOpen={editDrugModal.isOpen}
        drug={editDrugModal.drug}
        onClose={handleEditDrugClose}
        onSave={handleEditDrugSave}
        isLoading={editDrugLoading}
      />
    )}
    <NavigationConfirmModal />
    </>
  );
}