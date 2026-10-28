'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CheckCircle2, AlertCircle, Loader2, Search, RotateCcw, SkipForward, Edit, MapPin, Barcode, Check, AlertTriangle } from 'lucide-react';
import type { DrugItem } from '@/types';
import type { ImageLoadStatus, ImageLoadProgress } from '@/app/scan/hooks/useImageCache';

// 使用 loadProgress.objectUrl 作為單一真相來源，避免 state 競態條件
function getImageUrlFromProgress(loadProgress: ImageLoadProgress): string | null {
  return loadProgress.status === 'loaded' && loadProgress.objectUrl ? loadProgress.objectUrl : null;
}
interface DrugCardProps {
  drug: DrugItem;
  photoKey?: string; // B2 key (relative path) for fetching presigned URL
  isMatched: boolean;
  isUploading: boolean;
  isLocked: boolean;
  isManuallySelected?: boolean;
  actualQuantity: string;
  selectedStatus: 'correct' | 'incorrect' | 'pending_photo' | 'pending_skip' | null;
  onStatusSelect: (status: 'correct' | 'incorrect' | 'pending_photo' | 'pending_skip') => void;
  onActualQuantityChange: (value: string) => void;
  onTriggerCamera: () => void;
  onSkipPhoto: () => void;
  onPreviewPhoto: (url: string) => void;
  onFilterByBarcode?: (barcode: string) => void;
  onResetDrug?: (drugId: string) => void;
  onCardClick?: (drugId: string) => void;
  onLongPress?: (drug: DrugItem) => void;
  onEditDrug?: (drug: DrugItem) => void;
  // Image cache functions (legacy)
  getImageUrl?: (key: string) => Promise<string | null>;
  getImageLoadStatus?: (key: string) => ImageLoadStatus;
  setImageLoadStatus?: (key: string, status: ImageLoadStatus) => void;
  // New progress-based image loading
  getImageLoadProgress?: (key: string) => ImageLoadProgress;
  downloadImageWithProgress?: (key: string) => Promise<string | null>;
}

// === CircularProgress SVG Component ===
function CircularProgress({
  progress,
  size = 32,
  strokeWidth = 4,
  strokeColor = '#00f2fe',
  bgColor = '#00f2fe30',
  showText = true,
  className = '',
}: {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  strokeColor?: string;
  bgColor?: string;
  showText?: boolean;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress / 100);

  return (
    <svg
      width={size}
      height={size}
      className={`transform -rotate-90 ${className}`}
      style={{ filter: 'drop-shadow(0 0 6px rgba(0,242,254,0.6))' }}
      aria-label={`載入進度 ${progress}%`}
    >
      {/* 背景圓環 */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={bgColor}
        strokeWidth={strokeWidth}
      />
      {/* 進度圓環 */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300 ease-out"
      />
      {showText && progress > 0 && progress < 100 && (
        <text
          x={size / 2}
          y={size / 2 + 3}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.3}
          fontWeight="bold"
          fill={strokeColor}
          className="pointer-events-none"
        >
          {Math.round(progress)}%
        </text>
      )}
    </svg>
  );
}

export default function DrugCard({
  drug,
  photoKey,
  isMatched,
  isUploading,
  isLocked,
  isManuallySelected = false,
  actualQuantity,
  selectedStatus,
  onStatusSelect,
  onActualQuantityChange,
  onTriggerCamera,
  onSkipPhoto,
  onPreviewPhoto,
  onFilterByBarcode,
  onResetDrug,
  onCardClick,
  onLongPress,
  onEditDrug,
  getImageUrl,
  getImageLoadStatus,
  setImageLoadStatus,
  getImageLoadProgress,
  downloadImageWithProgress,
}: DrugCardProps) {
  const isCompleted = drug.counted_status === 'completed';
  const isError = drug.counted_status === 'error';

  let isRealtimeError = false;
  if (isMatched && actualQuantity !== '') {
    isRealtimeError = parseInt(actualQuantity) !== drug.expected_quantity;
  }

  // 判斷是否缺少任一條碼（國際條碼或商品代碼）
  // 判斷是否缺少所有條碼（國際條碼與商品代碼同時缺失）
  // 判斷是否缺少條碼：僅在 barcode 與 product_code 皆缺失時視為缺失
  const isNoBarcode = !drug.barcode?.trim() && !drug.product_code?.trim();
  const isEmptyStorage = !drug.storage_location || drug.storage_location.trim() === '';

  // 手動選取的無條碼卡片，操作區顯示優先於篩選隱藏邏輯
  const shouldShowActions = isMatched || isManuallySelected;
  const isDimmed = !shouldShowActions;

  // 無條碼且未完成時，點擊卡片可手動選取
  const handleCardClick = () => {
    if (isNoBarcode && !isCompleted && !isError && !isLocked && onCardClick) {
      onCardClick(drug.id);
    }
  };

  // 長按卡片手勢偵測（相容手機觸控與桌面滑鼠，支援滾動取消以防誤觸）
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startCoordRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressedRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('[data-no-longpress="true"]')
    ) {
      return;
    }

    startCoordRef.current = { x: e.clientX, y: e.clientY };
    isLongPressedRef.current = false;

    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
    }

    pressTimerRef.current = setTimeout(() => {
      isLongPressedRef.current = true;
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
      onLongPress?.(drug);
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startCoordRef.current || !pressTimerRef.current) return;
    const dist = Math.hypot(
      e.clientX - startCoordRef.current.x,
      e.clientY - startCoordRef.current.y
    );
    if (dist > 10) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handlePointerUp = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    startCoordRef.current = null;
  };

  const handlePointerCancel = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    startCoordRef.current = null;
  };

  const handleCardRootClick = (e: React.MouseEvent) => {
    if (isLongPressedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      isLongPressedRef.current = false;
      return;
    }
    handleCardClick();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isLongPressedRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  useEffect(() => {
    return () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
      }
    };
  }, []);

  // 是否處於「有誤」後等待選擇拍照或跳過的狀態
  const isPendingPhotoChoice = selectedStatus === 'pending_photo' || selectedStatus === 'pending_skip';

  // === 圖片懶加載邏輯（支援進度條） ===
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const hasPhoto = !!photoKey && !!photoKey.trim();

  // 優先使用新的進度 API，回退到舊的狀態 API
  const loadProgress = photoKey && getImageLoadProgress ? getImageLoadProgress(photoKey) : { status: 'idle' as const, progress: 0 };
  const loadStatus = photoKey && getImageLoadStatus ? getImageLoadStatus(photoKey) : 'idle';

  // 從 loadProgress 直接取得 objectUrl，作為單一真相來源
  const imageUrl = getImageUrlFromProgress(loadProgress);
  const [isThumbLoaded, setIsThumbLoaded] = useState(false);

  useEffect(() => {
    setIsThumbLoaded(false);
  }, [imageUrl]);

  // 使用 ref 追蹤是否已經觸發過載入，避免因 triggerImageLoad 依賴變更導致重複執行
  const hasTriggeredLoadRef = useRef(false);

  // 觸發圖片載入（使用新的下載進度 API）
  // 只依賴穩定值，不依賴 loadProgress/imageUrl 等下載期間會變的值
  const triggerImageLoad = useCallback(async () => {
    if (!hasPhoto || !downloadImageWithProgress || !photoKey) {
      return;
    }

    // 避免重複觸發：使用 ref 檢查
    if (hasTriggeredLoadRef.current) {
      return;
    }

    hasTriggeredLoadRef.current = true;

    try {
      await downloadImageWithProgress(photoKey);
    } catch (err) {
      // 錯誤會在 loadProgress 中體現，重置 ref 允許重試
      hasTriggeredLoadRef.current = false;
    }
  }, [hasPhoto, downloadImageWithProgress, photoKey]);

  // 當圖片載入成功時，標記已觸發，避免 IntersectionObserver 重複觸發
  useEffect(() => {
    if (imageUrl) {
      hasTriggeredLoadRef.current = true;
    }
  }, [imageUrl]);

  // photoKey 變更時重置 ref（例如篩選視圖切換藥品）
  useEffect(() => {
    hasTriggeredLoadRef.current = false;
  }, [photoKey]);

  // 輔助函數：檢查元素是否在視窗內
  function isElementInViewport(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    return (
      rect.top <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.bottom >= 0 &&
      rect.left <= (window.innerWidth || document.documentElement.clientWidth) &&
      rect.right >= 0
    );
  }

  // IntersectionObserver 懶加載
  useEffect(() => {
    if (!hasPhoto || !imgContainerRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            triggerImageLoad();
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '100px 0px', threshold: 0.01 }
    );

    observer.observe(imgContainerRef.current);
    
    // Fallback: 如果元素已經在視窗內，立即觸發（處理快速滾動或已可見情況）
    const element = imgContainerRef.current;
    if (element && isElementInViewport(element)) {
      triggerImageLoad();
    }
    
    return () => observer.disconnect();
  }, [hasPhoto]); // triggerImageLoad 已穩定，不需放入 deps

  // 掛載時直接觸發載入（最可靠的 fallback，不依賴 IntersectionObserver）
  useEffect(() => {
    if (!hasPhoto || !photoKey || !downloadImageWithProgress) {
      return;
    }
    if (imageUrl) {
      return;
    }
    
    // 稍微延遲確保 layout 完成，避免 viewport 檢查失效
    const timer = setTimeout(() => {
      triggerImageLoad();
    }, 50);
    
    return () => clearTimeout(timer);
  }, [hasPhoto, photoKey, downloadImageWithProgress, imageUrl]); // triggerImageLoad 已穩定，不需放入 deps

  // 圖片錯誤處理
  const handleImageError = useCallback(() => {
    if (photoKey) setImageLoadStatus?.(photoKey, 'error');
  }, [photoKey, setImageLoadStatus]);

  const seqNumber = String(((drug.item_order - 1) % 44) + 1).padStart(2, '0');

  return (
    <div
      data-drug-id={drug.id}
      className={`rounded-2xl bg-[#162a56]/80 backdrop-blur-md border p-3.5 sm:p-4 transition-all duration-200 flex flex-col justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 select-none shadow-xl ${
        isMatched
          ? 'border-[#00f2fe] ring-1 ring-[#00f2fe]/50 shadow-[0_0_20px_rgba(0,242,254,0.22)] scale-[1.01] z-10'
          : isManuallySelected
          ? 'border-[#00f2fe] ring-1 ring-[#00f2fe]/30'
          : 'border-[#233d7a] hover:border-[#00f2fe]/60'
      } ${
        isError || isRealtimeError ? 'border-[#ff4b5c] bg-[#ff4b5c]/10 shadow-[0_0_15px_rgba(255,75,92,0.15)]' : ''
      } ${
        isCompleted && !isMatched && !isManuallySelected ? 'opacity-45 grayscale-[30%]' : ''
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleCardRootClick}
      onContextMenu={handleContextMenu}
      style={isNoBarcode && !isCompleted && !isError && !isLocked ? { cursor: 'pointer' } : undefined}
    >
      {/* 頂部：序號 + 藥品主體資訊 + 照片縮圖按鈕 */}
      <div className="flex items-start justify-between gap-3">
        {/* 左側序號方塊 */}
        {isNoBarcode && !isCompleted && !isError ? (
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-500/20 border border-red-500/40 shadow-inner">
            <span className="text-[10px] font-bold text-red-400 font-mono">待補碼</span>
          </div>
        ) : (
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold font-mono text-sm shrink-0 shadow-inner transition-colors ${
              isCompleted
                ? 'bg-[#00f2fe] text-slate-900 border border-[#00f2fe]'
                : isError
                ? 'bg-[#ff4b5c] text-white border border-[#ff4b5c]'
                : 'bg-[#0a1936] text-[#00f2fe] border border-[#1e3468]'
            }`}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : isError ? (
              <AlertCircle className="w-5 h-5" />
            ) : (
              seqNumber
            )}
          </div>
        )}

        {/* 中間主體資訊 */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* 儲位與版面標籤 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {drug.storage_location && (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 text-[11px] font-medium border border-amber-500/30 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span>儲位 {drug.storage_location}</span>
              </span>
            )}
            {drug.category && (
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-700">
                {drug.category}
              </span>
            )}
            <span className="text-[11px] text-slate-400 font-mono">
              P.{drug.page_number} #{((drug.item_order - 1) % 44) + 1}
            </span>
          </div>

          {/* 藥品品名 (純白高對比粗體) */}
          <div className="font-bold truncate text-base lg:text-lg text-white tracking-wide">
            {drug.name}
          </div>

          {/* 條碼晶片徽章與工具鍵 */}
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {isNoBarcode ? (
              <span className="text-xs font-mono text-slate-500 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                無條碼
              </span>
            ) : (
              <>
                {drug.product_code?.trim() && (
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-[#00f2fe]/10 text-[#00f2fe] border border-[#00f2fe]/30 tracking-wider shadow-sm flex items-center gap-1">
                    <Barcode className="w-3.5 h-3.5" />
                    {drug.product_code}
                  </span>
                )}
                {drug.barcode?.trim() && drug.barcode !== drug.product_code && (
                  <span className="font-mono text-xs font-medium px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700 tracking-wider flex items-center gap-1">
                    <Barcode className="w-3 h-3 text-slate-400" />
                    {drug.barcode}
                  </span>
                )}
                {onFilterByBarcode && (drug.barcode || drug.product_code) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFilterByBarcode((drug.barcode || drug.product_code)!);
                    }}
                    className="p-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-[#00f2fe] border border-slate-700/80 transition-colors"
                    title="以條碼篩選"
                  >
                    <Search className="w-3 h-3" />
                  </button>
                )}
                {onEditDrug && !isLocked && drug.counted_status === 'pending' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditDrug(drug);
                    }}
                    className="p-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-[#00f2fe] border border-slate-700/80 transition-colors"
                    title="編輯藥品資料"
                    aria-label="編輯藥品資料"
                  >
                    <Edit className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* 錯誤時的實際數量標示 */}
          {isError && drug.actual_quantity !== undefined && (
            <div className="mt-1">
              <span className="text-xs font-mono font-bold text-[#ff4b5c] px-2 py-0.5 rounded bg-[#ff4b5c]/10 border border-[#ff4b5c]/25">
                實際盤點: {drug.actual_quantity}
              </span>
            </div>
          )}
        </div>

        {/* 右側照片縮圖按鈕 (含微光等待與載入中進度) */}
        <div
          ref={imgContainerRef}
          onClick={imageUrl ? () => onPreviewPhoto(imageUrl) : onTriggerCamera}
          className={`relative w-12 h-12 rounded-xl overflow-hidden border shrink-0 shadow-inner bg-[#0a1936] flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 group ${
            isMatched ? 'border-[#00f2fe]' : 'border-[#1e3468] hover:border-[#00f2fe]/60'
          }`}
          title={imageUrl ? '點擊預覽照片' : '拍攝存證照片'}
        >
          {/* 上傳中覆蓋層 */}
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm z-10">
              <div className="relative w-6 h-6">
                <div className="absolute inset-0 rounded-full border-2 border-[#00f2fe]/30" />
                <div className="absolute inset-0 rounded-full border-2 border-t-[#00f2fe] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                <div className="absolute inset-1 rounded-full bg-[#00f2fe]/20 animate-ping opacity-50" />
              </div>
            </div>
          )}

          {/* 無照片狀態 */}
          {!isUploading && !hasPhoto && (
            <div className="flex flex-col items-center justify-center text-slate-400 group-hover:text-[#00f2fe] transition-colors">
              <Camera className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] text-slate-500 group-hover:text-[#00f2fe] mt-0.5 font-medium">拍照</span>
            </div>
          )}

          {/* 有照片但處於排隊等待、取得 URL 或解碼渲染中：顯示極光藍旋轉加載圈 */}
          {!isUploading && hasPhoto && (
            loadProgress.status === 'idle' ||
            loadProgress.status === 'fetching_url' ||
            (loadProgress.status === 'loaded' && !isThumbLoaded)
          ) && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <div className="relative w-5 h-5 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-[#00f2fe]/20" />
                <div className="absolute inset-0 rounded-full border-2 border-t-[#00f2fe] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
              </div>
            </div>
          )}

          {/* Downloading 階段：環形進度條 */}
          {!isUploading && loadProgress.status === 'downloading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <CircularProgress
                progress={loadProgress.progress}
                size={28}
                strokeWidth={3}
                strokeColor="#00f2fe"
                bgColor="#00f2fe30"
                showText={true}
              />
            </div>
          )}

          {/* Loaded 狀態：圖片淡入動畫 */}
          {!isUploading && loadProgress.status === 'loaded' && imageUrl && (
            <div
              data-no-longpress="true"
              className="absolute inset-0 cursor-pointer"
            >
              <img
                src={imageUrl}
                alt="Thumbnail"
                onLoad={() => setIsThumbLoaded(true)}
                onError={() => {
                  setIsThumbLoaded(true);
                  handleImageError();
                }}
                className={`w-full h-full object-cover animate-in fade-in duration-300 ${
                  isThumbLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </div>
          )}

          {/* Error 狀態：破圖圖標 */}
          {!isUploading && loadProgress.status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-slate-500">
              <AlertCircle className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>

      {/* 底部操作區 */}
      {shouldShowActions && !isLocked ? (
        <div className="flex flex-col gap-2.5">
          {isCompleted || isError ? (
            /* 已完成/有誤：顯示狀態 + 重試按鈕 */
            <div className="flex items-center justify-between gap-2 flex-wrap bg-[#0a1936]/90 p-2.5 sm:p-3 rounded-xl border border-[#1e3468]">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 font-medium shrink-0">盤點結果:</span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                    isCompleted
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-[#ff4b5c]/20 text-[#ff4b5c] border border-[#ff4b5c]/30'
                  }`}
                >
                  {isCompleted ? '正確吻合' : '有誤異常'}
                </span>
                <span className="text-xs text-slate-300 font-mono">
                  實盤: <span className={`font-bold ${isCompleted ? 'text-[#00f2fe]' : 'text-[#ff4b5c]'}`}>{drug.actual_quantity}</span>
                </span>
              </div>
              {onResetDrug && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResetDrug(drug.id);
                  }}
                  className="px-2.5 py-1 text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700/80 transition-all flex items-center gap-1 active:scale-95"
                  title="重新確認此品項"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>重新盤點</span>
                </button>
              )}
            </div>
          ) : isPendingPhotoChoice ? (
            /* 有誤：選擇「拍照確認」與「跳過拍照」 */
            <div className="flex flex-col gap-2 bg-[#0a1936]/90 p-3 rounded-xl border border-[#ff4b5c]/40">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#ff4b5c]">發現數量差異</span>
                <span className="text-xs text-slate-400">請選擇是否拍照留存存證</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onStatusSelect('pending_photo');
                    onTriggerCamera();
                  }}
                  disabled={isUploading || isLocked}
                  className="py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 bg-[#00f2fe] text-[#07142b] shadow-[0_0_12px_rgba(0,242,254,0.35)] hover:bg-[#00f2fe]/90 disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>拍照存證</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onStatusSelect('pending_skip');
                    onActualQuantityChange('');
                    onSkipPhoto();
                  }}
                  disabled={isUploading || isLocked}
                  className="py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 disabled:opacity-50"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>跳過拍照</span>
                </button>
              </div>
            </div>
          ) : (
            /* 版本 A：未確認雙色微光按鈕 */
            <div className="flex flex-col gap-2">
              <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onStatusSelect('correct');
                    onActualQuantityChange(String(drug.expected_quantity));
                    onTriggerCamera();
                  }}
                  disabled={isLocked}
                  className={`py-2.5 px-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                    selectedStatus === 'correct'
                      ? 'bg-[#00f2fe] text-[#07142b] font-extrabold shadow-[0_0_15px_rgba(0,242,254,0.4)]'
                      : 'bg-emerald-500/10 hover:bg-emerald-500/25 active:bg-emerald-500 active:text-slate-900 text-emerald-400 border border-emerald-500/30 hover:border-emerald-400/80'
                  } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>正確</span>
                </button>
                <button
                  type="button"
                  onClick={() => onStatusSelect('incorrect')}
                  disabled={isLocked}
                  className={`py-2.5 px-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                    selectedStatus === 'incorrect' || isPendingPhotoChoice
                      ? 'bg-[#ff4b5c] text-white shadow-[0_0_15px_rgba(255,75,92,0.4)]'
                      : 'bg-[#ff4b5c]/10 hover:bg-[#ff4b5c]/25 active:bg-[#ff4b5c] active:text-white text-[#ff4b5c] border border-[#ff4b5c]/30 hover:border-[#ff4b5c]/80'
                  } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>有誤</span>
                </button>
              </div>

              {/* 點擊「有誤」後展開的實際數量輸入框 */}
              {selectedStatus === 'incorrect' && (
                <div className="flex items-center gap-2 pt-2 pb-1 border-t border-slate-800/60 animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="text-xs font-bold text-[#ff4b5c] shrink-0">實際數量:</label>
                  <input
                    type="number"
                    value={actualQuantity}
                    onChange={(e) => onActualQuantityChange(e.target.value)}
                    disabled={isLocked}
                    autoFocus
                    className={`flex-1 bg-[#0a1936] border border-[#ff4b5c]/40 rounded-lg px-2.5 py-1 text-right font-mono text-base text-white outline-none focus:border-[#ff4b5c] focus:ring-1 focus:ring-[#ff4b5c] transition-all ${
                      isLocked ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    placeholder="輸入實際盤點量"
                  />
                </div>
              )}

              {selectedStatus === 'incorrect' && actualQuantity && !isPendingPhotoChoice && (
                <div className="grid grid-cols-2 gap-2.5 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  <button
                    type="button"
                    onClick={() => {
                      onStatusSelect('pending_photo');
                      onTriggerCamera();
                    }}
                    disabled={isUploading || isLocked}
                    className="py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 bg-[#00f2fe] text-[#07142b] shadow-[0_0_12px_rgba(0,242,254,0.35)] hover:bg-[#00f2fe]/90 disabled:opacity-50"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>拍照確認</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onStatusSelect('pending_skip');
                      onActualQuantityChange('');
                      onSkipPhoto();
                    }}
                    disabled={isUploading || isLocked}
                    className="py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 disabled:opacity-50"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span>跳過拍照</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : isLocked ? (
        <div className="flex justify-end pt-2 border-t border-slate-800/80">
          <div className="px-4 py-2 rounded-xl bg-slate-800/80 text-slate-500 text-xs font-bold border border-slate-700/80 flex items-center gap-1.5 cursor-not-allowed">
            <Camera className="w-3.5 h-3.5" />
            <span>已封存</span>
          </div>
        </div>
      ) : isDimmed ? null : (
        <div className="flex justify-end pt-2 border-t border-slate-800/80">
          <div className="px-4 py-2 rounded-xl bg-slate-800/80 text-slate-500 text-xs font-bold border border-slate-700/80 flex items-center gap-1.5 cursor-not-allowed">
            <Camera className="w-3.5 h-3.5" />
            <span>拍照確認</span>
          </div>
        </div>
      )}
    </div>
  );
}
