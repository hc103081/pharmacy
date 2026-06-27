'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PackageSearch, FileUp, ClipboardCheck, CheckCircle } from 'lucide-react';
import { UserMenu } from '@/components/UserMenu';
import { TeachingButton } from '@/components/teaching';

export default function HomePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const emailVerified = searchParams.get('email_verified') === 'true';
  const loggedIn = searchParams.get('logged_in') === 'true';
  
  // 清除 URL 參數以避免重複顯示訊息
  useEffect(() => {
    if (emailVerified || loggedIn) {
      const url = new URL(window.location.href);
      url.searchParams.delete('email_verified');
      url.searchParams.delete('logged_in');
      url.searchParams.delete('timestamp');
      window.history.replaceState({}, '', url.toString());
    }
  }, [emailVerified, loggedIn]);

  return (
    <>
      <main className="fixed inset-0 flex flex-col items-center justify-center p-4 lg:p-6 bg-[#07142b] text-slate-200 overflow-y-auto">
        <UserMenu />
        <div className="max-w-2xl w-full text-center space-y-8 lg:space-y-12">
          <div className="space-y-3 lg:space-y-4">
            <div className="flex items-center justify-center gap-3 mb-3 lg:mb-4">
              <div className="p-3 bg-[#162a56] rounded-2xl border border-blue-500/30 shadow-[0_0_20px_rgba(0,242,254,0.2)]">
                <PackageSearch className="w-8 h-8 lg:w-10 lg:h-10 text-[#00f2fe]" />
              </div>
            </div>
            <h1 className="text-3xl lg:text-5xl font-black tracking-tight text-white">
              Phama<span className="text-[#00f2fe]">Count</span> Web
            </h1>
            <p className="text-sm lg:text-lg text-slate-400 max-w-md mx-auto px-4">
              藥局智能藥品清點與數位化管理系統
            </p>
          </div>

          {/* 成功驗證訊息 */}
          {emailVerified && (
            <div className="bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg px-4 py-3 mx-4 mb-6 animate-in fade-in zoom-in duration-300">
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5" />
                <div>
                  <p className="font-medium">電子郵件驗證成功！</p>
                  <p className="text-sm">您的帳號已確認，現在可以正常使用系統。</p>
                </div>
              </div>
            </div>
          )}
          
          {/* 登入成功訊息 */}
          {loggedIn && (
            <div className="bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg px-4 py-3 mx-4 mb-6 animate-in fade-in zoom-in duration-300">
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5" />
                <div>
                  <p className="font-medium">登入成功！</p>
                  <p className="text-sm">歡迎回到 PhamaCount 系統。</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 px-0">
            <Link 
              href="/import" 
              className="tech-card p-6 lg:p-8 group hover:border-[#00f2fe]/50"
            >
              <div className="flex flex-col items-center gap-4 lg:gap-6">
                <div className="p-4 bg-blue-500/10 text-[#00f2fe] rounded-full group-hover:bg-[#00f2fe] group-hover:text-slate-900 transition-all duration-300 shadow-[0_0_15px_rgba(0,242,254,0.3)]">
                  <FileUp className="w-7 h-7 lg:w-8 lg:h-8" />
                </div>
                <div className="text-xl lg:text-2xl font-bold text-white">匯入清單</div>
                <p className="text-xs lg:text-sm text-slate-400 text-center leading-relaxed">
                  上傳藥品清單，自動生成分頁數位核對表
                </p>
              </div>
            </Link>

            <Link 
              href="/manifests" 
              className="tech-card p-6 lg:p-8 group hover:border-[#00f2fe]/50"
            >
              <div className="flex flex-col items-center gap-4 lg:gap-6">
                <div className="p-4 bg-blue-500/10 text-[#00f2fe] rounded-full group-hover:bg-[#00f2fe] group-hover:text-slate-900 transition-all duration-300 shadow-[0_0_15px_rgba(0,242,254,0.3)]">
                  <ClipboardCheck className="w-7 h-7 lg:w-8 lg:h-8" />
                </div>
                <div className="text-xl lg:text-2xl font-bold text-white">開始清點</div>
                <p className="text-xs lg:text-sm text-slate-400 text-center leading-relaxed">
                  選擇清單並依照分頁進行條碼核對
                </p>
              </div>
            </Link>
          </div>

          <div className="text-xs lg:text-sm text-slate-500 font-medium">
            © 2026 PhamaCount Web • 提升藥局物流效率
          </div>
        </div>
      </main>
      {/* 教學按鈕 - 放在右下角 */}
      <TeachingButton module="system-overview" variant="fixed-bottom-right" className="mb-4" />
    </>
  );
}