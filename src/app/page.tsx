'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  PackageSearch, 
  Search,
  FileUp, 
  ClipboardCheck, 
  CheckCircle, 
  Clock, 
  Play, 
  ChevronRight,
  Loader2,
  Calendar
} from 'lucide-react';
import { UserMenu } from '@/components/UserMenu';
import { TeachingButton } from '@/components/teaching';
import { createClient } from '@/lib/supabase/client';
import { useNavigationProgress } from '@/components/navigation/NavigationProgress';
import type { Manifest } from '@/types';

interface RecentManifestItem extends Manifest {
  completed_count?: number;
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#07142b] flex items-center justify-center text-slate-500 font-medium">載入中...</div>}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { startNavigation } = useNavigationProgress();
  const emailVerified = searchParams.get('email_verified') === 'true';
  const loggedIn = searchParams.get('logged_in') === 'true';

  const [recentManifests, setRecentManifests] = useState<RecentManifestItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState<boolean>(true);

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

  // 獲取最近作業中的清單
  const fetchRecentManifests = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadingRecent(false);
        return;
      }

      // 查詢最近 3 筆未封存清單
      const { data, error } = await supabase
        .from('manifests')
        .select('*, drug_items(counted_status)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) {
        // Fallback 簡易查詢
        const fallback = await supabase
          .from('manifests')
          .select('*')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(3);
        if (!fallback.error && fallback.data) {
          setRecentManifests(fallback.data);
        }
      } else if (data) {
        const formatted: RecentManifestItem[] = data.map((m: any) => {
          const completed = Array.isArray(m.drug_items)
            ? m.drug_items.filter((d: any) => d.counted_status === 'completed').length
            : (m.completed_items ?? 0);
          return {
            ...m,
            completed_count: completed,
          };
        });
        setRecentManifests(formatted);
      }
    } catch {
      // 容錯處理，不影響主頁顯示
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    fetchRecentManifests();
  }, [fetchRecentManifests]);

  return (
    <>
      <div className="min-h-dvh flex flex-col bg-[#07142b] text-slate-200">
        {/* 全寬頂部導航列 */}
        <header className="fixed top-0 left-0 right-0 z-40 bg-[#07142b]/95 backdrop-blur-xl border-b border-slate-800/80">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#162a56] border border-[#00f2fe]/40 flex items-center justify-center text-[#00f2fe] shadow-[0_0_12px_rgba(0,242,254,0.2)]">
                <PackageSearch className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-black tracking-tight text-white leading-tight">
                  Phama<span className="text-[#00f2fe]">Count</span> Web
                </span>
                <span className="text-[10px] text-slate-400">藥局智能清點系統</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <UserMenu />
            </div>
          </div>
        </header>

        {/* 主內容區 */}
        <main className="flex-1 min-h-0 overflow-y-auto pt-20 md:pt-24 pb-12 px-4 sm:px-6 flex flex-col items-center">
          <div className="max-w-4xl w-full space-y-6 md:space-y-8 my-auto py-4">
            
            {/* 品牌視覺標題 */}
            <div className="text-center space-y-2 pt-2">
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
                Phama<span className="text-[#00f2fe]">Count</span> Web
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                藥局智能藥品清點與數位化管理系統
              </p>
            </div>

            {/* 成功驗證與登入提示訊息 */}
            {emailVerified && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl px-4 py-3 text-xs flex items-center gap-2.5">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>電子郵件驗證成功，您的帳號已確認，現在可以正常使用系統。</span>
              </div>
            )}
            {loggedIn && (
              <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-xl px-4 py-3 text-xs flex items-center gap-2.5">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>登入成功，歡迎回到 PhamaCount 系統。</span>
              </div>
            )}

            {/* 主行動三卡片區 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
              {/* 匯入清單卡片 */}
              <Link 
                href="/import" 
                onClick={() => startNavigation('正在開啟匯入模組...')}
                className="bg-[#162a56] backdrop-blur-lg border border-[#00f2fe]/30 hover:border-[#00f2fe] rounded-2xl p-6 sm:p-7 transition-all duration-300 group hover:shadow-[0_0_25px_rgba(0,242,254,0.25)] relative overflow-hidden flex flex-col justify-between"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-[#00f2fe] group-hover:bg-[#00f2fe] group-hover:text-slate-950 transition-all duration-300 shadow-[0_0_15px_rgba(0,242,254,0.2)] flex-shrink-0">
                    <FileUp className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-white group-hover:text-[#00f2fe] transition-colors">
                        匯入清單
                      </h2>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-[#00f2fe] group-hover:translate-x-1 transition-all" />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      上傳藥品清單，自動以每頁 44 項生成分頁數位核對表
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="text-blue-300/80">支援 Excel / PDF 檔案解析</span>
                  <span className="text-[#00f2fe] font-medium group-hover:underline">前往上傳 &rarr;</span>
                </div>
              </Link>

              {/* 開始清點卡片 */}
              <Link 
                href="/manifests" 
                onClick={() => startNavigation('正在載入清單管理...')}
                className="bg-gradient-to-br from-[#162a56] to-[#0d2044] backdrop-blur-lg border border-[#00f2fe]/40 hover:border-[#00f2fe] rounded-2xl p-6 sm:p-7 transition-all duration-300 group hover:shadow-[0_0_25px_rgba(0,242,254,0.35)] relative overflow-hidden flex flex-col justify-between"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#00f2fe]/20 border border-[#00f2fe]/50 flex items-center justify-center text-[#00f2fe] group-hover:bg-[#00f2fe] group-hover:text-slate-950 transition-all duration-300 shadow-[0_0_15px_rgba(0,242,254,0.3)] flex-shrink-0">
                    <ClipboardCheck className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-white group-hover:text-[#00f2fe] transition-colors">
                        開始清點
                      </h2>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-[#00f2fe] group-hover:translate-x-1 transition-all" />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      選擇清單並依照分頁進行條碼核對與相機拍照存證
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="text-emerald-400/90 font-medium">條碼鏡頭掃描 • 44 項直達</span>
                  <span className="text-[#00f2fe] font-medium group-hover:underline">瀏覽清冊 &rarr;</span>
                </div>
              </Link>

              {/* 查詢系統卡片 */}
              <Link 
                href="/query" 
                onClick={() => startNavigation('正在載入查詢系統...')}
                className="bg-[#162a56] backdrop-blur-lg border border-[#00f2fe]/30 hover:border-[#00f2fe] rounded-2xl p-6 sm:p-7 transition-all duration-300 group hover:shadow-[0_0_25px_rgba(0,242,254,0.25)] relative overflow-hidden flex flex-col justify-between"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#00f2fe]/10 border border-[#00f2fe]/30 flex items-center justify-center text-[#00f2fe] group-hover:bg-[#00f2fe] group-hover:text-slate-950 transition-all duration-300 shadow-[0_0_15px_rgba(0,242,254,0.2)] flex-shrink-0">
                    <Search className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-white group-hover:text-[#00f2fe] transition-colors">
                        查詢系統
                      </h2>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-[#00f2fe] group-hover:translate-x-1 transition-all" />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      跨清單即時藥品搜尋、盤點履歷與存證比對分析
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="text-cyan-300/80">即時搜尋 • 影像留存對照</span>
                  <span className="text-[#00f2fe] font-medium group-hover:underline">前往查詢 &rarr;</span>
                </div>
              </Link>
            </div>

            {/* 最近作業中的清單（Resume Section） */}
            <div className="bg-[#162a56]/60 backdrop-blur-md border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs sm:text-sm font-bold text-slate-200 tracking-wider">
                    最近作業中的清單
                  </h3>
                </div>
                <Link 
                  href="/manifests" 
                  className="text-xs text-[#00f2fe] hover:underline flex items-center gap-1 transition-colors"
                >
                  查看全部清單 &rarr;
                </Link>
              </div>

              {loadingRecent ? (
                <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-[#00f2fe]" />
                  <span>載入最近清單中...</span>
                </div>
              ) : recentManifests.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  目前尚無進行中的清單，請點擊上方「匯入清單」或「開始清點」建立作業。
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recentManifests.map((manifest) => {
                    const total = manifest.total_items || 0;
                    const completed = manifest.completed_count ?? (manifest.completed_items ?? 0);
                    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                    const isFullyDone = total > 0 && completed >= total;

                    return (
                      <div 
                        key={manifest.id}
                        className="bg-[#0b1b38]/90 hover:bg-[#10244c] border border-blue-500/20 hover:border-[#00f2fe]/40 rounded-xl p-3 sm:p-3.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-bold text-white truncate">
                              {manifest.name}
                            </span>
                            {manifest.created_at && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-500" />
                                {new Date(manifest.created_at).toLocaleDateString('zh-TW')}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                            <span>
                              已核對 <span className="text-[#00f2fe] font-medium">{completed}</span> / {total} 項
                            </span>
                            <span className="text-slate-600">•</span>
                            <span className={isFullyDone ? 'text-emerald-400 font-medium' : 'text-slate-300'}>
                              {percent}%
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                          {/* 微型進度條 */}
                          <div className="w-24 sm:w-28 bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-700/60">
                            <div 
                              className={`h-full transition-all duration-300 ${isFullyDone ? 'bg-emerald-400' : 'bg-[#00f2fe]'}`}
                              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                            />
                          </div>

                          {/* 動作按鈕：一鍵進入盤點 */}
                          <button
                            type="button"
                            onClick={() => {
                              startNavigation(`正在進入「${manifest.name}」清點作業...`);
                              router.push(`/scan?manifestId=${manifest.id}`);
                            }}
                            className="bg-[#00f2fe] hover:bg-cyan-300 active:scale-95 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-[0_0_10px_rgba(0,242,254,0.25)] flex-shrink-0"
                          >
                            <Play className="w-3 h-3 fill-slate-950" />
                            <span>繼續盤點</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 底部版權 */}
            <div className="text-center text-[11px] text-slate-500 font-medium pt-2">
              © 2026 PhamaCount Web • 提升藥局物流效率與精準清點
            </div>
          </div>
        </main>
      </div>

      {/* 教學按鈕 */}
      <TeachingButton module="system-overview" variant="fixed-bottom-right" className="mb-4" />
    </>
  );
}
