import React from 'react';
import { Loader2 } from 'lucide-react';

export default function GlobalLoading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#07142b] text-slate-100">
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-[#162a56]/40 border border-[#233d7a] backdrop-blur-md shadow-[0_0_30px_rgba(0,242,254,0.15)]">
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-[#00f2fe]/20 border-t-[#00f2fe] animate-spin shadow-[0_0_15px_rgba(0,242,254,0.5)]" />
          <Loader2 className="w-6 h-6 text-[#00f2fe] animate-spin absolute" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-base font-semibold text-white tracking-wide">
            系統模組載入中
          </p>
          <p className="text-xs text-slate-400">
            正在初始化頁面與資料環境...
          </p>
        </div>
      </div>
    </div>
  );
}
