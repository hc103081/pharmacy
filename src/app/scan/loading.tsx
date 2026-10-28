import React from 'react';
import { Loader2, PackageCheck } from 'lucide-react';

export default function ScanLoading() {
  return (
    <div className="h-dvh flex flex-col bg-[#07142b] text-slate-100 overflow-hidden">
      {/* 頂部骨架 */}
      <div className="shrink-0 h-14 bg-[#162a56]/80 border-b border-[#233d7a] px-4 flex items-center justify-between">
        <div className="h-6 w-24 bg-slate-800/80 rounded animate-pulse" />
        <div className="h-7 w-32 bg-slate-800/80 rounded-full animate-pulse" />
        <div className="h-6 w-16 bg-slate-800/80 rounded animate-pulse" />
      </div>

      {/* 盤點資訊骨架 */}
      <div className="p-4 space-y-3 max-w-3xl mx-auto w-full">
        <div className="p-4 bg-[#162a56]/50 border border-[#233d7a] rounded-xl space-y-3">
          <div className="h-5 w-48 bg-slate-800/80 rounded animate-pulse" />
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-[#0a1936]/80 border border-[#1e3468] rounded-lg animate-pulse" />
            ))}
          </div>
        </div>

        {/* 藥品卡片骨架清單 */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 bg-[#162a56]/40 border border-[#233d7a]/60 rounded-xl space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-5 w-40 bg-slate-800/80 rounded animate-pulse" />
              <div className="h-5 w-20 bg-slate-800/80 rounded animate-pulse" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="h-12 bg-[#0a1936]/70 rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 浮動載入徽章 */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#0a1936]/95 border border-[#00f2fe]/40 shadow-[0_0_30px_rgba(0,242,254,0.25)] backdrop-blur-md">
          <Loader2 className="w-5 h-5 text-[#00f2fe] animate-spin shrink-0" />
          <div className="text-left">
            <p className="text-sm font-bold text-white flex items-center gap-1.5">
              <PackageCheck className="w-4 h-4 text-[#00f2fe]" />
              盤點清單載入中
            </p>
            <p className="text-xs text-slate-400">正在同步離線暫存與條碼索引...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
