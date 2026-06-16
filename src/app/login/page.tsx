'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { login } from './actions';
import { Mail, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const sent = searchParams.get('sent');
  const error = searchParams.get('error');
  const [loading, setLoading] = useState(false);
  // 取得 email 參數
  const email = searchParams.get('email') ?? '';
  // 重新寄送驗證信的狀態
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [resendError, setResendError] = useState('');
  // 重新寄送驗證信的處理函式
  const handleResend = async () => {
    if (!email) return;
    setResendLoading(true);
    setResendMsg('');
    setResendError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
    });
    setResendLoading(false);
    if (error) setResendError(error.message);
    else setResendMsg('驗證信已重新寄送，請檢查信箱。');
  };

  // 已登入自動跳轉
  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  if (user) return null;

  if (sent === 'true') {
    return (
      <div className="tech-card p-8 max-w-md w-full space-y-6 animate-in fade-in zoom-in duration-300 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-[#00f2fe]/10 flex items-center justify-center">
          <Mail className="w-8 h-8 text-[#00f2fe]" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-white">請檢查你的信箱</h1>
          <p className="text-sm text-slate-400">
            我們已發送一組 Magic Link 到你的 Email，點擊連結即可登入。
          </p>
          <p className="text-xs text-slate-500">驗證成功後將自動跳轉至主頁面...</p>
          <div role="status" aria-live="polite">
            {resendError && <p className="text-sm text-[#ff4b5c]">{resendError}</p>}
            {resendMsg && <p className="text-sm text-[#00f2fe]">{resendMsg}</p>}
          </div>
          <button
              onClick={handleResend}
              disabled={resendLoading}
              aria-label="重新寄送驗證信"
              className="mt-4 tech-button tech-button-primary w-full py-2 font-medium flex items-center justify-center gap-2"
          >
            {resendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '重新寄送驗證信'}
          </button>
          <button
            onClick={() => router.push('/login')}
            className="mt-2 tech-button tech-button-primary w-full py-2 font-medium flex items-center justify-center gap-2"
          >
            返回登入
          </button>
        </div>
      </div>
    );
  }

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

      <form
        className="space-y-4"
        onSubmit={() => setLoading(true)}
      >
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-slate-400">
            Email
          </label>
          <div className="flex items-center tech-input">
            <Mail className="w-5 h-5 text-[#00f2fe] mr-2" />
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="your@email.com"
              className="flex-1 bg-transparent text-white focus:outline-none"
              disabled={loading}
            />
          </div>
        </div>

        <button
          formAction={login}
          disabled={loading}
          aria-label="發送 Magic Link 登入"
          aria-busy={loading}
          className="tech-button tech-button-primary w-full py-3 font-bold flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          發送 Magic Link 登入
        </button>
      </form>

      <p className="text-xs text-slate-500 text-center">
        輸入 Email 後，我們會發送一組登入連結到你的信箱。首次使用將自動建立帳號。
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    // 把固定定位的 top 設為 header 高度 (3rem) 讓內容不被遮住
    <div className="fixed top-12 left-0 right-0 bottom-0 bg-[#07142b] text-slate-200 flex items-center justify-center p-4 lg:p-6 overflow-y-auto overscroll-contain scrolling-touch">
      <Suspense fallback={
        <div className="tech-card p-8 max-w-md w-full text-center">
          <Loader2 className="w-8 h-8 text-[#00f2fe] animate-spin mx-auto" />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
