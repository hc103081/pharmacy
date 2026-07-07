'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { Loader2, Monitor } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const error = searchParams?.get('error');
  const [loading, setLoading] = useState(false);

  // 檢查是否已登入，若已登入則導向首頁
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        router.push('/');
      }
    });
  }, [supabase, router]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'openid email https://www.googleapis.com/auth/drive.file',
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      console.error('Google login error:', error);
      setLoading(false);
      // 錯誤會由 OAuth 回調處理，這裡不需額外處理
    }
  };

  return (
    <div className="tech-card p-4 sm:p-6 lg:p-8 max-w-full w-full md:max-w-md space-y-6 animate-in fade-in zoom-in duration-300">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-white">PhamaCount</h1>
        <p className="text-sm text-slate-400">藥局智能清點系統</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-pulse-glow">
          {error}
        </div>
      )}

      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        aria-label="使用 Google 登入"
        aria-busy={loading}
        className="tech-button tech-button-primary w-full py-3 font-bold flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        <Monitor className="w-5 h-5" />
        使用 Google 登入
      </button>

      <p className="text-xs text-slate-500 text-center">
        登入即代表同意我們的服務條款與隱私權政策。<br />
        首次登入將同步授權 Google Drive 雲端備份權限。
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="fixed top-12 left-0 right-0 bottom-0 bg-[#07142b] text-slate-200 flex items-center justify-center p-4 lg:p-6 overflow-y-auto overscroll-contain scrolling-touch">
      <Suspense
        fallback={
          <div className="tech-card p-8 max-w-md w-full text-center">
            <Loader2 className="w-8 h-8 text-[#00f2fe] animate-spin mx-auto" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
