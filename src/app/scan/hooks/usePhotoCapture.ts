'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPresignedUploadUrl } from '@/app/actions/scan/getUploadUrl';
import { updateDrugStatus } from '@/app/actions/scan/updatePhoto';
import { incrementStorageSize } from '@/app/actions/manifests/storage';
import { compressImage } from '@/lib/imageCompression';
import { sha1Hash } from '@/lib/crypto'; // 需新增：計算 SHA1
import type { DrugItem } from '@/types';

// ==================== 佇列持久化相關型別與常數 ====================
const PENDING_UPLOADS_KEY = 'phama_count_pending_uploads';
const MAX_RETRY_COUNT = 3;

interface UploadTask {
  drugId: string;
  barcode: string;
  pageNumber: number;
  finalQuantity: number;
  manifestId: string;
  createdAt: number;
  retryCount: number;
  error?: string;
}

interface UsePhotoCaptureOptions {
  manifestId: string | null;
  matchingItem: DrugItem | null;
  selectedStatus: 'correct' | 'incorrect' | 'pending_photo' | 'pending_skip' | null;
  actualQuantity: string;
  onToast: (message: string) => void;
  onRefresh: () => Promise<void>;
  onResetInput: () => void;
}

interface UsePhotoCaptureReturn {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploadingQueue: Set<string>;
  optimisticUrls: Map<string, string>;
  uploadErrors: Map<string, string>;
  triggerCamera: () => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleCameraFile: (file: File) => void;
  showCameraModal: boolean;
  setShowCameraModal: (open: boolean) => void;
  cameraError: string | null;
  setCameraError: (error: string | null) => void;
  checkingCameraSupport: boolean | null;
  setCheckingCameraSupport: (support: boolean | null) => void;
  // 新增：佇列持久化相關
  hasPendingUploads: boolean;
  pendingUploadsCount: number;
  restorePendingUploads: () => Promise<UploadTask[] | void>;
}

export function usePhotoCapture({
  manifestId,
  matchingItem,
  selectedStatus,
  actualQuantity,
  onToast,
  onRefresh,
  onResetInput,
}: UsePhotoCaptureOptions): UsePhotoCaptureReturn {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingQueue, setUploadingQueue] = useState<Set<string>>(new Set());
  const [optimisticUrls, setOptimisticUrls] = useState<Map<string, string>>(new Map());
  const [uploadErrors, setUploadErrors] = useState<Map<string, string>>(new Map());
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [checkingCameraSupport, setCheckingCameraSupport] = useState<boolean | null>(null);

  // ==================== 佇列持久化狀態 ====================
  const [pendingUploads, setPendingUploads] = useState<UploadTask[]>([]);
  const [hasRestored, setHasRestored] = useState(false);

  // 從 localStorage 讀取並恢復佇列 (僅在 client side 執行一次)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(PENDING_UPLOADS_KEY);
      if (stored) {
        const parsed: UploadTask[] = JSON.parse(stored);
        // 過濾掉重試次數超過上限的任務
        const validTasks = parsed.filter((t) => t.retryCount < MAX_RETRY_COUNT);
        if (validTasks.length !== parsed.length) {
          localStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(validTasks));
        }
        setPendingUploads(validTasks);
      }
    } catch (e) {
      console.error('恢復上傳佇列失敗:', e);
      localStorage.removeItem(PENDING_UPLOADS_KEY);
    } finally {
      setHasRestored(true);
    }
  }, []);

  // 將佇列持久化到 localStorage
  const persistPendingUploads = useCallback((tasks: UploadTask[]) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(tasks));
      setPendingUploads(tasks);
    } catch (e) {
      console.error('持久化上傳佇列失敗:', e);
    }
  }, []);

  // 將任務加入佇列
  const addToPendingQueue = useCallback(
    (task: Omit<UploadTask, 'createdAt' | 'retryCount'>) => {
      const newTask: UploadTask = {
        ...task,
        createdAt: Date.now(),
        retryCount: 0,
      };
      setPendingUploads((prev) => {
        const next = [...prev, newTask];
        persistPendingUploads(next);
        return next;
      });
    },
    [persistPendingUploads]
  );

  // 從佇列移除任務
  const removeFromPendingQueue = useCallback(
    (drugId: string) => {
      setPendingUploads((prev) => {
        const next = prev.filter((t) => t.drugId !== drugId);
        persistPendingUploads(next);
        return next;
      });
    },
    [persistPendingUploads]
  );

  // 更新任務重試次數與錯誤
  const updatePendingTask = useCallback(
    (drugId: string, updates: Partial<Pick<UploadTask, 'retryCount' | 'error'>>) => {
      setPendingUploads((prev) => {
        const next = prev.map((t) => {
          if (t.drugId !== drugId) return t;
          const newRetryCount = updates.retryCount ?? t.retryCount;
          // 如果是遞增模式，則在現有基礎上 +1
          const retryCount = updates.retryCount === 1 ? t.retryCount + 1 : newRetryCount;
          return { ...t, retryCount, error: updates.error };
        });
        persistPendingUploads(next);
        return next;
      });
    },
    [persistPendingUploads]
  );

  const triggerCamera = useCallback(() => {
    if (!matchingItem) {
      onToast('請先輸入條碼以匹配藥品');
      return;
    }

    if (checkingCameraSupport === true) {
      setShowCameraModal(true);
    } else if (checkingCameraSupport === false) {
      fileInputRef.current?.click();
    } else {
      (async () => {
        const isSupported =
          typeof navigator !== 'undefined' &&
          typeof navigator.mediaDevices !== 'undefined' &&
          typeof navigator.mediaDevices.getUserMedia === 'function';
        setCheckingCameraSupport(isSupported);
        if (isSupported) {
          setShowCameraModal(true);
        } else {
          fileInputRef.current?.click();
        }
      })();
    }
  }, [matchingItem, onToast, checkingCameraSupport]);

  // 核心上傳邏輯：B2 Presigned URL 直傳
  const uploadToB2 = useCallback(
    async (file: File, drugId: string, barcode: string, pageNumber: number) => {
      if (!manifestId) throw new Error('缺少 manifestId');

      let finalQuantity = 0;
      if (selectedStatus === 'correct') {
        finalQuantity = matchingItem?.expected_quantity || 0;
      } else {
        finalQuantity = parseInt(actualQuantity || '0');
      }

      // ==================== 佇列持久化：加入待上傳佇列 ====================
      // 只存上傳參數，不存 File (base64 太大)
      addToPendingQueue({
        drugId,
        barcode,
        pageNumber,
        finalQuantity,
        manifestId,
      });

      // 1. 建立物件 URL 供即時預覽 (樂觀 UI)
      const objectUrl = URL.createObjectURL(file);

      // 2. 設定樂觀狀態
      setUploadingQueue((prev) => new Set(prev).add(drugId));
      setOptimisticUrls((prev) => {
        const next = new Map(prev);
        next.set(drugId, objectUrl);
        return next;
      });
      setUploadErrors((prev) => {
        const next = new Map(prev);
        next.delete(drugId);
        return next;
      });

      onResetInput();

      // 3. 背景執行上傳流程
      try {
        // 3.1 向 Server 申請 B2 原生上傳授權
        const res = await getPresignedUploadUrl(manifestId, barcode, pageNumber, 'jpg');
        if (!res.success || !res.uploadUrl || !res.authorizationToken || !res.key) {
          throw new Error(res.error || '取得上傳授權失敗');
        }

        // 3.2 縮放圖片至長邊 1920px (原為限制 100KB，現改為解析度縮放以保留更多細節)
        const compressedFile = await compressImage(file);

        // 3.3 計算 SHA1 (B2 要求)
        const fileBuffer = await compressedFile.arrayBuffer();
        const contentSha1 = await sha1Hash(fileBuffer);

        // 3.4 直接 POST 到 B2 原生上傳端點
        // B2 原生 API 要求: POST, headers: Authorization, X-Bz-File-Name, Content-Type, X-Bz-Content-Sha1
        const uploadRes = await fetch(res.uploadUrl, {
          method: 'POST',
          body: fileBuffer,
          headers: {
            'Authorization': res.authorizationToken,
            'X-Bz-File-Name': encodeURIComponent(res.key),
            'Content-Type': compressedFile.type || 'image/jpeg',
            'X-Bz-Content-Sha1': contentSha1,
          },
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`B2 上傳失敗: ${uploadRes.status} ${errText}`);
        }

        // 3.4 上傳成功，呼叫 updateDrugStatus 更新 DB
        // 傳入 B2 key (相對路徑)，而非 public URL
        const result = await updateDrugStatus(drugId, res.key, finalQuantity);
        if (!result.success) throw new Error(result.error || '更新狀態失敗');

        // 3.5 更新清單已用容量
        if (manifestId) {
          await incrementStorageSize(manifestId, compressedFile.size);
        }

        // 3.6 更新樂觀 URL 為 B2 key (後續顯示時會轉成 presigned view URL)
        setOptimisticUrls((prev) => {
          const next = new Map(prev);
          next.set(drugId, res.key!);
          return next;
        });

        // 清除錯誤狀態
        setUploadErrors((prev) => {
          const next = new Map(prev);
          next.delete(drugId);
          return next;
        });

        // ==================== 佇列持久化：上傳成功移除任務 ====================
        removeFromPendingQueue(drugId);

        // 同步 Server 狀態
        await onRefresh();
      } catch (error: any) {
        // 錯誤處理：保留樂觀 URL 但顯示錯誤
        setUploadErrors((prev) => {
          const next = new Map(prev);
          next.set(drugId, error.message);
          return next;
        });

        // ==================== 佇列持久化：更新重試次數與錯誤 ====================
        updatePendingTask(drugId, {
          retryCount: 1, // 這裡簡單處理，實際上應該是遞增
          error: error.message,
        });

        onToast(`上傳失敗: ${error.message}`);
      } finally {
        // 移出上傳佇列
        setUploadingQueue((prev) => {
          const next = new Set(prev);
          next.delete(drugId);
          return next;
        });
        // 不立即 revoke objectUrl，避免閃爍；元件卸載或下次選檔時清理
      }
    },
    [manifestId, matchingItem, selectedStatus, actualQuantity, onResetInput, onRefresh, addToPendingQueue, removeFromPendingQueue, updatePendingTask]
  );

  const handleCameraFile = useCallback(
    (file: File) => {
      if (!matchingItem) return;
      // 立即關閉相機 Modal，背景非同步上傳
      setShowCameraModal(false);
      // 背景上傳，不 await，讓 UI 立即響應
      uploadToB2(file, matchingItem.id, matchingItem.barcode, matchingItem.page_number);
    },
    [matchingItem, uploadToB2]
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !matchingItem) return;
      // 背景上傳，不 await
      uploadToB2(file, matchingItem.id, matchingItem.barcode, matchingItem.page_number);
    },
    [matchingItem, uploadToB2]
  );

  // ==================== 佇列持久化：恢復待上傳任務 ====================
  // 注意：因為不存 File 到 localStorage，恢復時需要用戶重新拍照
  const restorePendingUploads = useCallback(async () => {
    if (!hasRestored) {
      onToast('佇列尚未恢復完成，請稍候再試');
      return;
    }

    const tasks = pendingUploads.filter((t) => t.retryCount < MAX_RETRY_COUNT);
    if (tasks.length === 0) {
      onToast('沒有待恢復的上傳任務');
      return;
    }

    // 提示用戶有未完成的上傳，需要重新拍照
    const message = `發現 ${tasks.length} 張照片未上傳完成，請逐一重新拍照上傳`;
    onToast(message);

    // 這裡不自動上傳，而是返回任務列表讓 UI 決定如何提示用戶重拍
    // 實際的重拍流程由呼叫端處理（例如顯示 Modal 列出待重拍項目）
    return tasks;
  }, [hasRestored, pendingUploads, onToast]);

  return {
    fileInputRef,
    uploadingQueue,
    optimisticUrls,
    uploadErrors,
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
    hasPendingUploads: hasRestored && pendingUploads.length > 0,
    pendingUploadsCount: pendingUploads.length,
    restorePendingUploads,
  };
}