'use client';

import React, { useState } from 'react';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

interface PhotoPreviewProps {
  imageUrl: string;
  onClose: () => void;
}

export default function PhotoPreview({ imageUrl, onClose }: PhotoPreviewProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md cursor-zoom-out"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full flex items-center justify-center animate-in zoom-in duration-300 min-h-[240px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 載入中骨架與旋轉圈 */}
        {!isLoaded && !hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="relative w-12 h-12 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-[#00f2fe]/20" />
              <div className="absolute inset-0 rounded-full border-4 border-t-[#00f2fe] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            </div>
            <span className="text-xs text-slate-300 font-mono tracking-wider">正在載入高畫質存證照片...</span>
          </div>
        )}

        {/* 載入失敗提示 */}
        {hasError && (
          <div className="flex flex-col items-center justify-center gap-2 p-6 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400">
            <AlertCircle className="w-8 h-8 text-[#ff4b5c]" />
            <span className="text-xs">存證照片載入失敗，請確認網路連線</span>
          </div>
        )}

        {/* 實體大圖 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Drug evidence"
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            setIsLoaded(true);
            setHasError(true);
          }}
          className={`w-full h-auto max-h-[85vh] object-contain rounded-lg shadow-2xl border border-white/10 transition-opacity duration-300 ${
            isLoaded && !hasError ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-black/60 text-white rounded-full hover:bg-black/90 transition-colors z-10 shadow-lg active:scale-95"
          title="關閉放大視窗"
          aria-label="關閉放大視窗"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
