import { useCallback, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { updateDrugStatus } from '@/app/actions/scan/updatePhoto';
import { compressImage } from '@/lib/imageCompression';
import type { DrugItem } from '@/types';

interface UsePhotoCaptureOptions {
  manifestId: string | null;
  matchingItem: DrugItem | null;
  selectedStatus: 'correct' | 'incorrect' | null;
  actualQuantity: string;
  onToast: (message: string) => void;
  onRefresh: () => Promise<void>;
  onResetInput: () => void;
}

export function usePhotoCapture({
  manifestId,
  matchingItem,
  selectedStatus,
  actualQuantity,
  onToast,
  onRefresh,
  onResetInput,
}: UsePhotoCaptureOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingQueue, setUploadingQueue] = useState<Set<string>>(new Set());
  const supabase = createClient();

  const triggerCamera = useCallback(() => {
    if (!matchingItem) {
      onToast('請先輸入條碼以匹配藥品');
      return;
    }
    fileInputRef.current?.click();
  }, [matchingItem, onToast]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !matchingItem) return;

      const drugId = matchingItem.id;

      let finalQuantity = 0;
      if (selectedStatus === 'correct') {
        finalQuantity = matchingItem.expected_quantity;
      } else {
        finalQuantity = parseInt(actualQuantity || '0');
      }

      setUploadingQueue((prev) => new Set(prev).add(drugId));
      onResetInput();

      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const filePath = `photos/${year}/${month}/${day}/${manifestId}/${matchingItem.page_number}/${matchingItem.barcode}_${Date.now()}.jpg`;
        // 壓縮圖片確保不超過 300KB
        const compressedFile = await compressImage(file);
        const { error: uploadError } = await supabase.storage
          .from('drug-photos')
          .upload(filePath, compressedFile);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from('drug-photos').getPublicUrl(filePath);

        const result = await updateDrugStatus(drugId, publicUrl, finalQuantity);
        if (!result.success) throw new Error(result.error || '更新狀態失敗');

        await onRefresh();
      } catch (error: unknown) {
        console.error('Background Upload Error:', error);
        const message = error instanceof Error ? error.message : '未知錯誤';
        alert(`上傳失敗: ${message}，該項目已恢復為待清點`);
      } finally {
        setUploadingQueue((prev) => {
          const next = new Set(prev);
          next.delete(drugId);
          return next;
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [manifestId, matchingItem, selectedStatus, actualQuantity, onResetInput, onRefresh]
  );

  return {
    fileInputRef,
    uploadingQueue,
    triggerCamera,
    handleFileUpload,
  };
}