'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { Loader2, Monitor, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const error = searchParams?.get('error');
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState('test-user@pharmacy.local');
  const [devPassword, setDevPassword] = useState('TestPassword123!');
  const [showPassword, setShowPassword] = useState(false);

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

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setDevLoading(true);
    setDevError(null);

    try {
      const response = await fetch('/api/test-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: devEmail, password: devPassword }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setDevError(data.error || '登入失敗');
        setDevLoading(false);
        return;
      }

      // 登入成功，重新載入頁面以應用認證狀態
      window.location.reload();
    } catch (err) {
      console.error('Dev login error:', err);
      setDevError('登入過程發生錯誤');
      setDevLoading(false);
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

      {/* Dev-only Email/Password Login Form */}
      {process.env.NODE_ENV !== 'production' && (
        <div className="space-y-4 border-t border-slate-700 pt-6">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <AlertCircle className="w-3 h-3" />
            <span>開發/測試環境專用 - 僅在非生產環境顯示</span>
          </div>

          <form onSubmit={handleDevLogin} className="space-y-4">
            {devError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-pulse-glow flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {devError}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="dev-email" className="text-sm font-medium text-slate-300">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  id="dev-email"
                  type="email"
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  disabled={devLoading}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/50 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00f2fe] focus:border-transparent transition-all duration-200 shadow-[0_0_15px_rgba(0,242,254,0.1)]"
                  placeholder="test-user@pharmacy.local"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="dev-password" className="text-sm font-medium text-slate-300">
                密碼
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  id="dev-password"
                  type={showPassword ? 'text' : 'password'}
                  value={devPassword}
                  onChange={(e) => setDevPassword(e.target.value)}
                  disabled={devLoading}
                  className="w-full pl-10 pr-12 py-3 rounded-xl bg-slate-900/50 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00f2fe] focus:border-transparent transition-all duration-200 shadow-[0_0_15px_rgba(0,242,254,0.1)]"
                  placeholder="TestPassword123!"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={devLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={devLoading}
              aria-busy={devLoading}
              className="tech-button tech-button-primary w-full py-3 font-bold flex items-center justify-center gap-2"
            >
              {devLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              <Mail className="w-5 h-5" />
              開發模式登入 (Email/Password)
            </button>
          </form>
        </div>
      )}

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
