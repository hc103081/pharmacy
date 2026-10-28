import React from 'react';
import { Loader2, Search } from 'lucide-react';

export default function QueryLoading() {
  return (
    <div className="h-dvh flex flex-col bg-[#07142b] text-slate-100 overflow-hidden">
      {/* 頂部搜尋列骨架 */}
      <div className="shrink-0 bg-[#07142b]/95 border-b border-slate-800/80 p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="h-10 w-10 bg-slate-800 rounded-xl animate-pulse" />
          <div className="h-10 flex-1 bg-slate-800 rounded-xl animate-pulse" />
          <div className="h-10 w-24 bg-slate-800 rounded-xl animate-pulse" />
        </div>
      </div>

      {/* 搜尋候選或結果骨架 */}
      <div className="flex-1 p-4 max-w-4xl mx-auto w-full space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 bg-[#162a56]/40 border border-[#233d7a]/60 rounded-xl space-y-2 animate-pulse">
            <div className="h-5 w-48 bg-slate-800 rounded" />
            <div className="h-4 w-32 bg-slate-800/60 rounded" />
          </div>
        ))}
      </div>

      {/* 浮動載入提示 */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#0a1936]/95 border border-[#00f2fe]/40 shadow-[0_0_30px_rgba(0,242,254,0.25)] backdrop-blur-md">
          <Loader2 className="w-5 h-5 text-[#00f2fe] animate-spin shrink-0" />
          <div className="text-left">
            <p className="text-sm font-bold text-white flex items-center gap-1.5">
              <Search className="w-4 h-4 text-[#00f2fe]" />
              查詢系統載入中
            </p>
            <p className="text-xs text-slate-400">正在準備歷程查詢與存證索引...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
