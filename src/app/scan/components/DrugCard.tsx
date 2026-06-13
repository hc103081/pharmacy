'use client';

import React from 'react';
import { Camera, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { DrugItem } from '../types';

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
      className={`tech-card p-4 transition-all duration-300 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 ${
        isMatched ? 'border-[#00f2fe] ring-2 ring-inset ring-[#00f2fe]/50 scale-[1.02] z-10' : ''
      } ${isError || isRealtimeError ? 'border-[#ff4b5c] bg-[#ff4b5c]/10' : ''} ${isCompleted && !isMatched ? 'opacity-40 grayscale' : ''}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
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
          <div className="min-w-0">
            <div className={`font-bold text-lg truncate ${isMatched ? 'text-[#00f2fe]' : 'text-white'}`}>
              {drug.name}
            </div>
            <div className="text-xs font-mono text-slate-500 truncate break-all">
              {drug.barcode} | 預期: {drug.expected_quantity}
            </div>
          </div>
        </div>

        {drug.photo_url && (
          <div
            onClick={() => {
              if (isMatched) {
                onTriggerCamera();
              } else {
                onPreviewPhoto(drug.photo_url!);
              }
            }}
            className={`w-12 h-12 rounded-lg overflow-hidden border cursor-pointer transition-all shrink-0 shadow-inner bg-slate-900 ${
              isMatched ? 'border-[#00f2fe] hover:scale-110' : 'border-slate-700 hover:border-[#00f2fe]'
            }`}
            title={isMatched ? '點擊重新拍照' : '點擊預覽'}
          >
            <img src={drug.photo_url} alt="Thumbnail" className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      <div className="flex justify-between items-center gap-4">
        {isMatched && (
          <div className="flex flex-col gap-3 bg-slate-950/50 p-3 rounded-xl border border-slate-700 w-full md:w-auto">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onStatusSelect('correct');
                  onActualQuantityChange(String(drug.expected_quantity));
                  onTriggerCamera();
                }}
                disabled={isLocked}
                className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
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
                className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
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
                <label className="text-[10px] font-bold text-slate-500 uppercase">實際數量:</label>
                <input
                  type="number"
                  value={actualQuantity}
                  onChange={(e) => onActualQuantityChange(e.target.value)}
                  disabled={isLocked}
                  autoFocus
                  className={`flex-1 bg-transparent text-right font-mono text-sm text-[#00f2fe] outline-none ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                  placeholder="0"
                />
              </div>
            )}
          </div>
        )}
        <div className="flex-1" />
        <button
          onClick={onTriggerCamera}
          disabled={
            !isMatched ||
            isUploading ||
            isLocked ||
            (selectedStatus === 'incorrect' && !actualQuantity)
          }
          className={`tech-button px-6 py-2 ${
            isMatched && !isLocked
              ? 'tech-button-primary'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          {isUploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Camera className="w-5 h-5" />
          )}
          <span className="text-sm font-bold">{isUploading ? '上傳中...' : '拍照確認'}</span>
        </button>
      </div>
    </div>
  );
}