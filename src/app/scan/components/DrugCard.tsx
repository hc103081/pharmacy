'use client';

import React from 'react';
import { Camera, CheckCircle2, AlertCircle, Loader2, Search, Info, RotateCcw } from 'lucide-react';
import type { DrugItem } from '@/types';

interface DrugCardProps {
  drug: DrugItem;
  isMatched: boolean;
  isUploading: boolean;
  isLocked: boolean;
  actualQuantity: string;
  selectedStatus: 'correct' | 'incorrect' | null;
  onStatusSelect: (status: 'correct' | 'incorrect') => void;
  onActualQuantityChange: (value: string) => void;
  onTriggerCamera: () => void;
  onPreviewPhoto: (url: string) => void;
  onFilterByBarcode?: (barcode: string) => void;
  onResetDrug?: (drugId: string) => void;
}

export default function DrugCard({
  drug,
  isMatched,
  isUploading,
  isLocked,
  actualQuantity,
  selectedStatus,
  onStatusSelect,
  onActualQuantityChange,
  onTriggerCamera,
  onPreviewPhoto,
  onFilterByBarcode,
  onResetDrug,
}: DrugCardProps) {
  const isCompleted = drug.counted_status === 'completed';
  const isError = drug.counted_status === 'error';

  let isRealtimeError = false;
  if (isMatched && actualQuantity !== '') {
    isRealtimeError = parseInt(actualQuantity) !== drug.expected_quantity;
  }

  return (
    <div
      data-drug-id={drug.id}
      className={`tech-card p-4 transition-all duration-300 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 ${
        isMatched ? 'border-[#00f2fe] ring-2 ring-inset ring-[#00f2fe]/50 scale-[1.02] z-10' : ''
      } ${isError || isRealtimeError ? 'border-[#ff4b5c] bg-[#ff4b5c]/10' : ''} ${isCompleted && !isMatched ? 'opacity-40 grayscale' : ''}`}
    >
      {/* 頂部：序號 + 藥品資訊 + 照片縮圖 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-1 min-w-0">
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
          <div className="min-w-0 flex-1">
            <div className={`font-bold truncate text-base lg:text-lg ${isMatched ? 'text-[#00f2fe]' : 'text-white'}`}>
              {drug.name}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono text-slate-500 truncate">
                {drug.barcode} | 預期: {drug.expected_quantity}
                {isError && drug.actual_quantity !== undefined && (
                  <span className="text-[#ff4b5c] font-bold"> / 實際: {drug.actual_quantity}</span>
                )}
              </span>
              {drug.bonus_quantity > 0 && (
                <span title={`原數量: ${drug.expected_quantity - drug.bonus_quantity} + 贈量: ${drug.bonus_quantity}`}>
                  <Info 
                    className="w-3 h-3 shrink-0 cursor-help" 
                  />
                </span>
              )}
              {onFilterByBarcode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterByBarcode(drug.barcode);
                  }}
                  title="用此條碼篩選"
                  className="shrink-0 p-1 rounded-lg text-[#00f2fe]/60 bg-[#00f2fe]/5 border border-[#00f2fe]/10 hover:text-[#00f2fe] hover:bg-[#00f2fe]/15 hover:border-[#00f2fe]/40 hover:shadow-[0_0_8px_rgba(0,242,254,0.3)] transition-all active:scale-90"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {drug.photo_url && (
          <div
            onClick={() => onPreviewPhoto(drug.photo_url!)}
            className={`w-11 h-11 lg:w-12 lg:h-12 rounded-lg overflow-hidden border cursor-pointer transition-all shrink-0 shadow-inner bg-slate-900 ${
              isMatched ? 'border-[#00f2fe] hover:scale-110' : 'border-slate-700 hover:border-[#00f2fe]'
            }`}
            title="點擊預覽照片"
          >
            <img src={drug.photo_url} alt="Thumbnail" className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      {/* 底部操作區：手機端縱向堆疊、電腦端橫向排列 */}
      {isMatched ? (
        <div className="flex flex-col lg:flex-row gap-3">
          {/* 正確/有誤按鈕 + 數量輸入 */}
          <div className="flex flex-col gap-2 flex-1 bg-slate-950/50 p-3 rounded-xl border border-slate-700">
            {isCompleted || isError ? (
              <div className="flex items-center gap-2 flex-wrap">
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
                {onResetDrug && !isLocked && (
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
            ) : (
              <>
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
                    onClick={() => {
                      onStatusSelect('incorrect');
                      onActualQuantityChange('');
                    }}
                    disabled={isLocked}
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-bold transition-all active:scale-95 ${
                      selectedStatus === 'incorrect'
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
              </>
            )}
          </div>

          {/* 拍照按鈕 */}
          <button
            onClick={onTriggerCamera}
            disabled={
              isUploading ||
              isLocked ||
              (!isCompleted && !isError && selectedStatus === 'incorrect' && !actualQuantity)
            }
            className={`tech-button px-5 py-3 lg:py-2 lg:shrink-0 ${
              !isLocked
                ? 'tech-button-primary'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
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
        </div>
      ) : (
        /* 未匹配時顯示拍照按鈕（禁用狀態） */
        <div className="flex justify-end">
          <button
            disabled
            className="tech-button px-5 py-3 lg:py-2 bg-slate-800 text-slate-500 cursor-not-allowed"
          >
            <Camera className="w-5 h-5" />
            <span className="text-sm font-bold">拍照確認</span>
          </button>
        </div>
      )}
    </div>
  );
}
