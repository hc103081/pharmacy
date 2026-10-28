import React from 'react';
import { Loader2, FileUp } from 'lucide-react';

export default function ImportLoading() {
  return (
    <div className="h-dvh flex flex-col bg-[#07142b] text-slate-100 overflow-hidden">
      <div className="shrink-0 bg-[#07142b]/95 border-b border-slate-800/80 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="h-6 w-32 bg-slate-800 rounded animate-pulse" />
          <div className="h-8 w-24 bg-slate-800 rounded-lg animate-pulse" />
        </div>
      </div>

      <div className="p-4 max-w-4xl mx-auto w-full space-y-4">
        <div className="p-8 border-2 border-dashed border-slate-700 rounded-2xl flex flex-col items-center justify-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-800 animate-pulse" />
          <div className="h-5 w-48 bg-slate-800 rounded animate-pulse" />
        </div>
      </div>

      <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#0a1936]/95 border border-[#00f2fe]/40 shadow-[0_0_30px_rgba(0,242,254,0.25)] backdrop-blur-md">
          <Loader2 className="w-5 h-5 text-[#00f2fe] animate-spin shrink-0" />
          <div className="text-left">
            <p className="text-sm font-bold text-white flex items-center gap-1.5">
              <FileUp className="w-4 h-4 text-[#00f2fe]" />
              匯入模組載入中
            </p>
            <p className="text-xs text-slate-400">正在準備 PDF 與 OCR 解析器...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
