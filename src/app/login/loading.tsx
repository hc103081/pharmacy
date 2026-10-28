import React from 'react';
import { Loader2, LogIn } from 'lucide-react';

export default function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#07142b] p-4">
      <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#0a1936]/95 border border-[#00f2fe]/40 shadow-[0_0_30px_rgba(0,242,254,0.25)] backdrop-blur-md">
        <Loader2 className="w-5 h-5 text-[#00f2fe] animate-spin shrink-0" />
        <div className="text-left">
          <p className="text-sm font-bold text-white flex items-center gap-1.5">
            <LogIn className="w-4 h-4 text-[#00f2fe]" />
            登入環境載入中
          </p>
          <p className="text-xs text-slate-400">正在準備身分驗證伺服器連線...</p>
        </div>
      </div>
    </div>
  );
}
