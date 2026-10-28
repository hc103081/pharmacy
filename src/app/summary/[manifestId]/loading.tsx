import React from 'react';
import { Loader2, FileCheck2 } from 'lucide-react';

export default function SummaryLoading() {
  return (
    <div className="h-dvh flex flex-col bg-[#07142b] text-slate-100 overflow-hidden">
      <div className="shrink-0 bg-[#07142b]/95 border-b border-slate-800/80 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="h-6 w-36 bg-slate-800 rounded animate-pulse" />
          <div className="h-8 w-24 bg-slate-800 rounded-lg animate-pulse" />
        </div>
      </div>

      <div className="p-4 max-w-4xl mx-auto w-full space-y-4">
        <div className="p-6 bg-[#162a56]/40 border border-[#233d7a]/60 rounded-xl space-y-4 animate-pulse">
          <div className="h-7 w-48 bg-slate-800 rounded" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-[#0a1936]/80 rounded-lg" />
            ))}
          </div>
        </div>
      </div>

      <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#0a1936]/95 border border-[#00f2fe]/40 shadow-[0_0_30px_rgba(0,242,254,0.25)] backdrop-blur-md">
          <Loader2 className="w-5 h-5 text-[#00f2fe] animate-spin shrink-0" />
          <div className="text-left">
            <p className="text-sm font-bold text-white flex items-center gap-1.5">
              <FileCheck2 className="w-4 h-4 text-[#00f2fe]" />
              盤點總結載入中
            </p>
            <p className="text-xs text-slate-400">正在統計各項盤點差異與存證照片...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
