import React from 'react';
import { Loader2, ClipboardList } from 'lucide-react';

export default function ManifestsLoading() {
  return (
    <div className="h-dvh flex flex-col bg-[#07142b] text-slate-100 overflow-hidden">
      {/* 頂部導航骨架 */}
      <div className="shrink-0 bg-[#07142b]/95 border-b border-slate-800/80 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="h-6 w-32 bg-slate-800 rounded animate-pulse" />
          <div className="h-8 w-24 bg-slate-800 rounded-lg animate-pulse" />
        </div>
      </div>

      {/* 標籤頁切換骨架 */}
      <div className="p-4 max-w-4xl mx-auto w-full space-y-4">
        <div className="flex gap-2 border-b border-slate-800 pb-2">
          <div className="h-9 w-28 bg-slate-800 rounded-lg animate-pulse" />
          <div className="h-9 w-28 bg-slate-800/60 rounded-lg animate-pulse" />
        </div>

        {/* 清單卡片骨架 */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-5 bg-[#162a56]/40 border border-[#233d7a]/60 rounded-xl space-y-3 animate-pulse">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <div className="h-5 w-44 bg-slate-800 rounded" />
                <div className="h-4 w-28 bg-slate-800/60 rounded" />
              </div>
              <div className="h-6 w-16 bg-slate-800 rounded-full" />
            </div>
            <div className="h-10 bg-[#0a1936]/80 rounded-lg" />
          </div>
        ))}
      </div>

      {/* 浮動提示 */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#0a1936]/95 border border-[#00f2fe]/40 shadow-[0_0_30px_rgba(0,242,254,0.25)] backdrop-blur-md">
          <Loader2 className="w-5 h-5 text-[#00f2fe] animate-spin shrink-0" />
          <div className="text-left">
            <p className="text-sm font-bold text-white flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-[#00f2fe]" />
              清單列表載入中
            </p>
            <p className="text-xs text-slate-400">正在同步雲端與本地盤點單清單...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
