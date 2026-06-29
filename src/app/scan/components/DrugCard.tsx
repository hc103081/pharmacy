'use client';

import React from 'react';
import { Camera, CheckCircle2, AlertCircle, Loader2, Search, RotateCcw, SkipForward } from 'lucide-react';
import type { DrugItem } from '@/types';

interface DrugCardProps {
  drug: DrugItem;
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
}

export default function DrugCard({
  drug,
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
}: DrugCardProps) {
  const isCompleted = drug.counted_status === 'completed';
  const isError = drug.counted_status === 'error';

  let isRealtimeError = false;
  if (isMatched && actualQuantity !== '') {
    isRealtimeError = parseInt(actualQuantity) !== drug.expected_quantity;
  }

  const isNoBarcode = !drug.barcode || drug.barcode.trim() === '';
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

  // 是否處於「有誤」後等待選擇拍照或跳過的狀態
  const isPendingPhotoChoice = selectedStatus === 'pending_photo' || selectedStatus === 'pending_skip';

  return (
    <div
      data-drug-id={drug.id}
      className={`tech-card p-4 transition-all duration-300 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 ${
        isMatched ? 'border-[#00f2fe] ring-2 ring-inset ring-[#00f2fe]/50 scale-[1.02] z-10' : ''
      } ${isError || isRealtimeError ? 'border-[#ff4b5c] bg-[#ff4b5c]/10' : ''} ${
        isCompleted && !isMatched && !isManuallySelected ? 'opacity-40 grayscale' : ''
      } ${isManuallySelected ? 'border-[#00f2fe] ring-1 ring-[#00f2fe]/30' : ''}`}
      onClick={handleCardClick}
      style={isNoBarcode && !isCompleted && !isError && !isLocked ? { cursor: 'pointer' } : undefined}
    >
      {/* 頂部：序號 + 藥品資訊 + 照片縮圖 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* 無條碼時顯示「待補碼」徽章 */}
          {isNoBarcode && !isCompleted && !isError ? (
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-red-500/20 border border-red-500/40">
              <span className="text-[10px] font-bold text-red-400">待補碼</span>
            </div>
          ) : (
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                isCompleted
                  ? 'bg-[#00f2fe] text-slate-900'
                  : isError
                    ? 'bg-[#ff4b5c] text-white'
                    : 'bg-slate-800 text-slate-400'
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : isError ? (
                <AlertCircle className="w-5 h-5" />
              ) : (
                ((drug.item_order - 1) % 44) + 1
              )}
            </div>
          )}

          <div className="min-w-0 flex-1">
            {/* 儲位+類別小字，空時顯示破折號 */}
            <div className="text-[11px] text-gray-400 mb-0.5">
              {isEmptyStorage && !drug.category ? (
                <span className="text-slate-600">—</span>
              ) : (
                [drug.storage_location, drug.category].filter(Boolean).join('-') || <span className="text-slate-600">—</span>
              )}
            </div>

            {/* 藥品名稱 */}
            <div className={`font-bold truncate text-base lg:text-lg ${isMatched || isManuallySelected ? 'text-[#00f2fe]' : 'text-white'}`}>
              {drug.name}
            </div>

            {/* 條碼 + 預期數量（放大突出） */}
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {isNoBarcode ? (
                <span className="text-xs font-mono text-slate-600">無條碼</span>
              ) : (
                <span className="text-lg font-semibold text-[#00f2fe] drop-shadow-[0_0_8px_rgba(0,242,254,0.4)]">
                  {drug.barcode}
                </span>
              )}
              <span className="text-slate-600 text-sm">·</span>
              <span className="text-xs font-medium text-slate-500">預期:</span>
              <span className="text-xl font-bold text-[#00f2fe] drop-shadow-[0_0_8px_rgba(0,242,254,0.4)]">
                {drug.expected_quantity}
              </span>
              {/* 放大鏡：點擊以條碼篩選 */}
              {!isNoBarcode && onFilterByBarcode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterByBarcode(drug.barcode);
                  }}
                  className="p-1 rounded-full hover:bg-slate-700/50 transition-colors"
                  title="以條碼篩選"
                >
                  <Search className="w-3.5 h-3.5 text-slate-400 hover:text-[#00f2fe]" />
                </button>
              )}
            </div>

            {isError && drug.actual_quantity !== undefined && (
              <div className="mt-0.5">
                <span className="text-sm font-bold text-[#ff4b5c]">
                  實際: {drug.actual_quantity}
                </span>
              </div>
            )}

            {isPendingPhotoChoice && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  value={actualQuantity}
                  onChange={(e) => onActualQuantityChange(e.target.value)}
                  disabled={isLocked}
                  autoFocus
                  className={`w-24 bg-transparent text-right font-mono text-lg text-[#00f2fe] outline-none border-b border-dashed border-slate-600 focus:border-[#00f2fe] transition-colors py-1 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                  placeholder="實際數量"
                />
              </div>
            )}
          </div>
        </div>

        {/* 照片縮圖 / 上傳中動畫 */}
        {isUploading ? (
          <div
            className={`w-11 h-11 lg:w-12 lg:h-12 rounded-lg overflow-hidden border shrink-0 shadow-inner bg-slate-900 relative ${isMatched ? 'border-[#00f2fe]' : 'border-slate-700'}`}
          >
            {drug.photo_url && <img src={drug.photo_url} alt="Thumbnail" className="w-full h-full object-cover opacity-30" />}
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
              <div className="relative w-6 h-6">
                <div className="absolute inset-0 rounded-full border-2 border-[#00f2fe]/30" />
                <div className="absolute inset-0 rounded-full border-2 border-t-[#00f2fe] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                <div className="absolute inset-1 rounded-full bg-[#00f2fe]/20 animate-ping opacity-50" />
              </div>
            </div>
          </div>
        ) : drug.photo_url ? (
          <div
            onClick={() => onPreviewPhoto(drug.photo_url!)}
            className={`w-11 h-11 lg:w-12 lg:h-12 rounded-lg overflow-hidden border cursor-pointer transition-all shrink-0 shadow-inner bg-slate-900 ${isMatched ? 'border-[#00f2fe] hover:scale-110' : 'border-slate-700 hover:border-[#00f2fe]'}`}
            title="點擊預覽照片"
          >
            <img src={drug.photo_url} alt="Thumbnail" className="w-full h-full object-cover" />
          </div>
        ) : null}
      </div>

      {/* 底部操作區 */}
      {shouldShowActions && !isLocked ? (
        <div className="flex flex-col lg:flex-row gap-3">
          {isCompleted || isError ? (
            /* 已完成/有誤：顯示狀態 + 重試按鈕 */
            <div className="flex items-center gap-2 flex-wrap bg-slate-950/50 p-3 rounded-xl border border-slate-700">
              <span className="text-[10px] text-slate-500 uppercase font-bold shrink-0">已確認:</span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-bold ${
                  isCompleted
                    ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]/30'
                    : 'bg-[#ff4b5c]/20 text-[#ff4b5c] border border-[#ff4b5c]/30'
                }`}
              >
                {isCompleted ? '正確' : '有誤'}
              </span>
              <span className="text-xs text-slate-400">
                實際: <span className={`font-mono font-bold ${isCompleted ? 'text-[#00f2fe]' : 'text-[#ff4b5c]'}`}>{drug.actual_quantity}</span>
              </span>
              {onResetDrug && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('確定要將此藥品恢復為未清點狀態嗎？照片將一併清除。')) {
                      onResetDrug(drug.id);
                    }
                  }}
                  className="ml-auto shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 bg-slate-800 border border-slate-700 hover:text-[#00f2fe] hover:border-[#00f2fe]/40 hover:bg-slate-700 transition-all active:scale-95"
                  title="重新填寫此藥品"
                >
                  <RotateCcw className="w-3 h-3" />
                  重新填寫
                </button>
              )}
            </div>
          ) : isPendingPhotoChoice ? (
            /* 有誤後：顯示「攝影確認」和「跳過拍照」 */
            <div className="flex flex-col gap-2 flex-1 bg-slate-950/50 p-3 rounded-xl border border-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#ff4b5c] shrink-0">有誤</span>
                <span className="text-xs text-slate-400">請選擇是否拍照留存證據</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    onStatusSelect('pending_photo');
                    onTriggerCamera();
                  }}
                  disabled={isUploading || isLocked}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold transition-all active:scale-95 bg-[#00f2fe] text-slate-900 shadow-[0_0_10px_rgba(0,242,254,0.4)] hover:bg-[#00f2fe]/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Camera className="w-4 h-4" />
                  拍照確認
                </button>
                <button
                  onClick={() => {
                    onStatusSelect('pending_skip');
                    onSkipPhoto();
                  }}
                  disabled={isUploading || isLocked}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold transition-all active:scale-95 bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700 hover:border-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <SkipForward className="w-4 h-4" />
                  跳過拍照
                </button>
              </div>
            </div>
          ) : (
            /* 未確認：顯示正確/有誤按鈕 + 拍照 */
            <>
              <div className="flex flex-col gap-2 flex-1 bg-slate-950/50 p-3 rounded-xl border border-slate-700">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onStatusSelect('correct');
                      onActualQuantityChange(String(drug.expected_quantity));
                      onTriggerCamera();
                    }}
                    disabled={isLocked}
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-bold transition-all active:scale-95 ${
                      selectedStatus === 'correct'
                        ? 'bg-[#00f2fe] text-slate-900 shadow-[0_0_10px_rgba(0,242,254,0.4)]'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    正確
                  </button>
                  <button
                    onClick={() => onStatusSelect('incorrect')}
                    disabled={isLocked}
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-bold transition-all active:scale-95 ${
          (selectedStatus === 'incorrect' || isPendingPhotoChoice)
            ? 'bg-[#ff4b5c] text-white shadow-[0_0_10px_rgba(255,75,92,0.4)]'
            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
        } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    有誤
                  </button>
                </div>
                {selectedStatus === 'incorrect' && (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="text-xs font-bold text-slate-500 shrink-0">實際數量:</label>
                    <input
                      type="number"
                      value={actualQuantity}
                      onChange={(e) => onActualQuantityChange(e.target.value)}
                      disabled={isLocked}
                      autoFocus
                      className={`flex-1 bg-transparent text-right font-mono text-lg text-[#00f2fe] outline-none border-b border-dashed border-slate-600 focus:border-[#00f2fe] transition-colors py-1 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

              {/* 拍照按鈕 */}
              <button
                onClick={onTriggerCamera}
                disabled={isUploading || isLocked || (!isCompleted && !isError && selectedStatus === 'incorrect' && !actualQuantity)}
                className={`tech-button px-5 py-3 lg:py-2 lg:shrink-0 ${
                  !isLocked ? 'tech-button-primary' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                {isUploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Camera className="w-5 h-5" />
                )}
                <span className="text-sm font-bold">
                  {isUploading ? '上傳中...' : isCompleted || isError ? '重新拍照' : '拍照確認'}
                </span>
              </button>
            </>
          )}
        </div>
      ) : isLocked ? (
        /* 鎖定狀態 */
        <div className="flex justify-end">
          <button disabled className="tech-button px-5 py-3 lg:py-2 bg-slate-800 text-slate-500 cursor-not-allowed">
            <Camera className="w-5 h-5" />
            <span className="text-sm font-bold">已封存</span>
          </button>
        </div>
      ) : isDimmed ? null : (
        /* 未匹配時顯示禁用拍照按鈕 */
        <div className="flex justify-end">
          <button disabled className="tech-button px-5 py-3 lg:py-2 bg-slate-800 text-slate-500 cursor-not-allowed">
            <Camera className="w-5 h-5" />
            <span className="text-sm font-bold">拍照確認</span>
          </button>
        </div>
      )}
    </div>
  );
}
