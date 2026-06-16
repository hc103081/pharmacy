'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { login } from './actions';
import { Mail, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const sent = searchParams.get('sent');
  const error = searchParams.get('error');
  const [loading, setLoading] = useState(false);

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
        </div>
      </div>
    );
  }

  return (
    <div className="tech-card p-8 max-w-md w-full space-y-6 animate-in fade-in zoom-in duration-300">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-white">PhamaCount</h1>
        <p className="text-sm text-slate-400">藥局智能清點系統</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
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
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="your@email.com"
            className="tech-input w-full"
            disabled={loading}
          />
        </div>

        <button
          formAction={login}
          disabled={loading}
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
    <div className="fixed top-12 left-0 right-0 bottom-0 bg-[#07142b] text-slate-200 flex items-center justify-center p-4 lg:p-6 overflow-y-auto">
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
