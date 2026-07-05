'use client';

import { Database } from 'lucide-react';

interface ImportOverlayProps {
  isOpen: boolean;
}

export function ImportOverlay({ isOpen }: ImportOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#07142b]/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="tech-card p-8 max-w-sm w-full space-y-6 text-center border-[#00f2fe]/40 shadow-[0_0_40px_rgba(0,242,254,0.15)]">
        {/* 旋轉圖示 */}
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#00f2fe] animate-spin" />
          <div className="absolute inset-2 rounded-full border-4 border-transparent border-b-[#00f2fe]/60 animate-spin" style={{ animationDuration: '2s' }} />
          <Database className="absolute inset-0 m-auto w-8 h-8 text-[#00f2fe]" />
        </div>

        {/* 進度文字 */}
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-white">正在匯入藥品資料</h3>
          <p className="text-sm text-slate-400">正在將藥品寫入資料庫並進行分頁處理...</p>
        </div>

        {/* 動畫進度條 */}
        <div className="relative h-2 bg-slate-800/80 rounded-full overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-[#00f2fe] rounded-full animate-progress-indeterminate" />
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-particle-flow" />
          </div>
        </div>

        {/* 步驟提示 */}
        <div className="flex items-center justify-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#00f2fe] animate-pulse" />
          <span className="text-xs text-slate-500">寫入資料庫</span>
          <span className="w-2 h-2 rounded-full bg-slate-700" />
          <span className="text-xs text-slate-600">建立分頁</span>
          <span className="w-2 h-2 rounded-full bg-slate-700" />
          <span className="text-xs text-slate-600">完成</span>
        </div>
      </div>
    </div>
  );
}