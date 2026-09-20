'use client';

import { useCallback, useRef, useState } from 'react';
import { getPresignedUploadUrl } from '@/app/actions/scan/getUploadUrl';
import { updateDrugStatus } from '@/app/actions/scan/updatePhoto';
import { incrementStorageSize } from '@/app/actions/manifests/storage';
import { compressImage } from '@/lib/imageCompression';
import { sha1Hash } from '@/lib/crypto'; // 需新增：計算 SHA1
import type { DrugItem } from '@/types';

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
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleCameraFile: (file: File) => Promise<void>;
  showCameraModal: boolean;
  setShowCameraModal: (open: boolean) => void;
  cameraError: string | null;
  setCameraError: (error: string | null) => void;
  checkingCameraSupport: boolean | null;
  setCheckingCameraSupport: (support: boolean | null) => void;
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

        // 同步 Server 狀態
        await onRefresh();
      } catch (error: any) {
        // 錯誤處理：保留樂觀 URL 但顯示錯誤
        setUploadErrors((prev) => {
          const next = new Map(prev);
          next.set(drugId, error.message);
          return next;
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
    [manifestId, matchingItem, selectedStatus, actualQuantity, onResetInput, onRefresh]
  );

  const handleCameraFile = useCallback(
    async (file: File) => {
      if (!matchingItem) return;
      await uploadToB2(file, matchingItem.id, matchingItem.barcode, matchingItem.page_number);
    },
    [matchingItem, uploadToB2]
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !matchingItem) return;
      await uploadToB2(file, matchingItem.id, matchingItem.barcode, matchingItem.page_number);
    },
    [matchingItem, uploadToB2]
  );

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
  };
}