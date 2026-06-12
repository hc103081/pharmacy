import Link from 'next/link';
import { PackageSearch, FileUp, ClipboardCheck } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#07142b] text-slate-200">
      <div className="max-w-2xl w-full text-center space-y-12">
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-[#162a56] rounded-2xl border border-blue-500/30 shadow-[0_0_20px_rgba(0,242,254,0.2)]">
              <PackageSearch className="w-10 h-10 text-[#00f2fe]" />
            </div>
          </div>
          <h1 className="text-5xl font-black tracking-tight text-white">
            Phama<span className="text-[#00f2fe]">Count</span> Web
          </h1>
          <p className="text-lg text-slate-400 max-w-md mx-auto">
            藥局智能藥品清點與數位化管理系統
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link 
            href="/import" 
            className="tech-card p-8 group hover:border-[#00f2fe]/50"
          >
            <div className="flex flex-col items-center gap-6">
              <div className="p-4 bg-blue-500/10 text-[#00f2fe] rounded-full group-hover:bg-[#00f2fe] group-hover:text-slate-900 transition-all duration-300 shadow-[0_0_15px_rgba(0,242,254,0.3)]">
                <FileUp className="w-8 h-8" />
              </div>
              <div className="text-2xl font-bold text-white">匯入清單</div>
              <p className="text-sm text-slate-400 text-center leading-relaxed">
                上傳藥品清單，自動生成分頁數位核對表
              </p>
            </div>
          </Link>

          <Link 
            href="/manifests" 
            className="tech-card p-8 group hover:border-[#00f2fe]/50"
          >
            <div className="flex flex-col items-center gap-6">
              <div className="p-4 bg-blue-500/10 text-[#00f2fe] rounded-full group-hover:bg-[#00f2fe] group-hover:text-slate-900 transition-all duration-300 shadow-[0_0_15px_rgba(0,242,254,0.3)]">
                <ClipboardCheck className="w-8 h-8" />
              </div>
              <div className="text-2xl font-bold text-white">開始清點</div>
              <p className="text-sm text-slate-400 text-center leading-relaxed">
                選擇清單並依照分頁進行條碼核對
              </p>
            </div>
          </Link>
        </div>

        <div className="text-sm text-slate-500 font-medium">
          © 2026 PhamaCount Web • 提升藥局物流效率
        </div>
      </div>
    </main>
  );
}
