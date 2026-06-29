'use client';

import { useCallback, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { updateDrugStatus } from '@/app/actions/scan/updatePhoto';
import { incrementStorageSize } from '@/app/actions/manifests/storage';
import { compressImage } from '@/lib/imageCompression';
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
 const supabase = createClient();

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

 const handleCameraFile = useCallback(
 async (file: File) => {
 if (!matchingItem) return;

 const drugId = matchingItem.id;

 let finalQuantity = 0;
 if (selectedStatus === 'correct') {
 finalQuantity = matchingItem.expected_quantity;
 } else {
 finalQuantity = parseInt(actualQuantity || '0');
 }

 // Create object URL for immediate preview
 const objectUrl = URL.createObjectURL(file);

 // Set optimistic UI state immediately
 setUploadingQueue((prev) => new Set(prev).add(drugId));
 setOptimisticUrls((prev) => {
 const next = new Map(prev);
 next.set(drugId, objectUrl);
 return next;
 });
 setUploadErrors((prev) => {
 const next = new Map(prev);
 next.delete(drugId); // Clear any previous error
 return next;
 });

 onResetInput();

 // Perform upload in background
 (async () => {
 try {
 const now = new Date();
 const year = now.getFullYear();
 const month = String(now.getMonth() + 1).padStart(2, '0');
 const day = String(now.getDate()).padStart(2, '0');
 const filePath = `photos/${year}/${month}/${day}/${manifestId}/${matchingItem.page_number}/${matchingItem.barcode}_${Date.now()}.jpg`;

 // 壓縮圖片確保不超過300KB
 const compressedFile = await compressImage(file);
 const { error: uploadError } = await supabase.storage
 .from('drug-photos')
 .upload(filePath, compressedFile);

 if (uploadError) throw uploadError;

 const {
 data: { publicUrl },
 } = await supabase.storage
 .from('drug-photos')
 .getPublicUrl(filePath);

 const result = await updateDrugStatus(drugId, publicUrl, finalQuantity);
 if (!result.success) throw new Error(result.error || '更新狀態失敗');

 // 更新清單已用容量
 if (manifestId) {
 await incrementStorageSize(manifestId, compressedFile.size);
 }

 // Update optimistic URL to the real one on success
 setOptimisticUrls((prev) => {
 const next = new Map(prev);
 next.set(drugId, publicUrl);
 return next;
 });

 // Clear any error state
 setUploadErrors((prev) => {
 const next = new Map(prev);
 next.delete(drugId);
 return next;
 });

 // Sync with server state
 await onRefresh();
 } catch (error: any) {
 // Handle error - keep optimistic URL but show error
 setUploadErrors((prev) => {
 const next = new Map(prev);
 next.set(drugId, error.message);
 return next;
 });

 // Show error toast
 onToast(`上傳失敗: ${error.message}`);
 } finally {
 // Always remove from uploading queue
 setUploadingQueue((prev) => {
 const next = new Set(prev);
 next.delete(drugId);
 return next;
 });

 // Note: We don't revoke the object URL immediately to avoid flickering
 // It will be cleaned up when the component unmounts or when a new file is selected
 }
 })();
 },
 [manifestId, matchingItem, selectedStatus, actualQuantity, onResetInput, onRefresh]
 );

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

 // Create object URL for immediate preview
 const objectUrl = URL.createObjectURL(file);

 // Set optimistic UI state immediately
 setUploadingQueue((prev) => new Set(prev).add(drugId));
 setOptimisticUrls((prev) => {
 const next = new Map(prev);
 next.set(drugId, objectUrl);
 return next;
 });
 setUploadErrors((prev) => {
 const next = new Map(prev);
 next.delete(drugId); // Clear any previous error
 return next;
 });

 onResetInput();

 // Perform upload in background
 (async () => {
 try {
 const now = new Date();
 const year = now.getFullYear();
 const month = String(now.getMonth() + 1).padStart(2, '0');
 const day = String(now.getDate()).padStart(2, '0');
 const filePath = `photos/${year}/${month}/${day}/${manifestId}/${matchingItem.page_number}/${matchingItem.barcode}_${Date.now()}.jpg`;

 // 壓縮圖片確保不超過300KB
 const compressedFile = await compressImage(file);
 const { error: uploadError } = await supabase.storage
 .from('drug-photos')
 .upload(filePath, compressedFile);

 if (uploadError) throw uploadError;

 const {
 data: { publicUrl },
 } = await supabase.storage
 .from('drug-photos')
 .getPublicUrl(filePath);

 const result = await updateDrugStatus(drugId, publicUrl, finalQuantity);
 if (!result.success) throw new Error(result.error || '更新狀態失敗');

 // 更新清單已用容量
 if (manifestId) {
 await incrementStorageSize(manifestId, compressedFile.size);
 }

 // Update optimistic URL to the real one on success
 setOptimisticUrls((prev) => {
 const next = new Map(prev);
 next.set(drugId, publicUrl);
 return next;
 });

 // Clear any error state
 setUploadErrors((prev) => {
 const next = new Map(prev);
 next.delete(drugId);
 return next;
 });

 // Sync with server state
 await onRefresh();
 } catch (error: any) {
 // Handle error - keep optimistic URL but show error
 setUploadErrors((prev) => {
 const next = new Map(prev);
 next.set(drugId, error.message);
 return next;
 });

 // Show error toast
 onToast(`上傳失敗: ${error.message}`);
 } finally {
 // Always remove from uploading queue
 setUploadingQueue((prev) => {
 const next = new Set(prev);
 next.delete(drugId);
 return next;
 });

 // Note: We don't revoke the object URL immediately to avoid flickering
 // It will be cleaned up when the component unmounts or when a new file is selected
 }
 })();
 },
 [manifestId, matchingItem, selectedStatus, actualQuantity, onResetInput, onRefresh]
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
