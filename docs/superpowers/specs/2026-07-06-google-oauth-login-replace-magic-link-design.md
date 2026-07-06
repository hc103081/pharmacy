# Google OAuth 登入取代 Magic Link — 設計規格書

**日期：** 2026-07-06
**版本：** v1
**狀態：** 核定實施

---

## 1. 需求概述

### 1.1 背景
現有系統使用 Magic Link（Email OTP）作為唯一登入方式。用戶需輸入 Email、檢查信箱、點擊連結才能登入，流程繁瑣且依賴郵件送達。

### 1.2 目標
將登入機制**完全替換**為 Google OAuth 登入，並**同時完成 Google Drive 授權**（`drive.file` scope），達成「一次登入、一次授權、直接進入系統」的無縫體驗。

### 1.3 核心需求
1. **移除 Magic Link**：登入頁面不再有 Email 輸入框，改為單一「使用 Google 登入」按鈕
2. **Google OAuth 登入**：使用 Supabase 內建 Google Provider
3. **同步授權 Google Drive**：OAuth scope 包含 `https://www.googleapis.com/auth/drive.file`
4. **自動處理首次授權**：登入成功但無 `user_gdrive_connections` 記錄 → 自動導向 Google Drive 授權流程
5. **保留 Middleware 強制綁定邏輯**：已登入無 Drive 連線 → 強制導向授權

---

## 2. 技術決策

| 決策 | 選擇 | 原因 |
|------|------|------|
| OAuth 實作方式 | **Supabase 內建 Google Provider** | 內建用戶建立、session 管理、token 刷新；程式碼最少 |
| Google Drive 授權時機 | **登入時同步授權（scope 加入 drive.file）** | 用戶體驗最佳，一次完成 |
| 取得 Refresh Token 方式 | **二次 OAuth：登入成功 → `/auth/gdrive/connect?prompt=consent&login_hint=email`** | Supabase OAuth 回調不直接暴露 refresh_token；prompt=consent 強制 Google 回傳 |
| 回調路由 | **重用 `/auth/callback` 處理 Google 登入回調** | 現有路由已支援 code 交換 session，減少新增路由 |
| Google Drive 連線儲存 | **既有 `user_gdrive_connections` 表** | 符合現有架構，避免 schema 變更 |

---

## 3. 架構設計

### 3.1 登入流程圖

```
┌─ 登入頁面 /login ─────────────────────────────────────┐
│  • 單一按鈕：「使用 Google 登入」                        │
│  • 點擊 → supabase.auth.signInWithOAuth({              │
│      provider: 'google',                               │
│      options: { scopes: 'openid email drive.file' }    │
│    })                                                  │
└────────────────────┬──────────────────────────────────┘
                     │
                     ▼
┌─ Google OAuth 同意頁 ─────────────────────────────────┐
│  Scope: openid email https://www.googleapis.com/      │
│  auth/drive.file                                       │
│  用戶點選「允許」                                       │
└────────────────────┬──────────────────────────────────┘
                     │
                     ▼
┌─ 回調 /auth/callback?code=xxx ────────────────────────┐
│  • Supabase 交換 code → 建立/取得用戶 → 設定 session   │
│  • 回調路由檢查 user_gdrive_connections                │
│    → 有記錄：導向 / （完成）                           │
│    → 無記錄：導向 /auth/gdrive/connect                 │
│         ?login_hint={email}&prompt=consent             │
└────────────────────┬──────────────────────────────────┘
                     │
                     ▼
┌─ 第二次 Google OAuth（Drive 授權） ────────────────────┐
│  • 因 prompt=consent，Google 強制回傳 refresh_token    │
│  • 回調 /auth/gdrive/callback → 存 refresh_token 到 DB │
│  • 導向 / （完成）                                     │
└────────────────────────────────────────────────────────┘
```

### 3.2 關鍵元件對應表

| 元件 | 檔案 | 變更類型 | 說明 |
|------|------|----------|------|
| 登入頁面 | `src/app/login/page.tsx` | **重寫** | 移除 Magic Link 表單，改為 Google 登入按鈕 |
| 登入 Action | `src/app/login/actions.ts` | **刪除** | 不再需要 Magic Link 發送邏輯 |
| OAuth 回調 | `src/app/auth/callback/route.ts` | **修改** | 移除 Magic Link 處理；登入後檢查 Drive 連線並導向 |
| Google Drive 連線發起 | `src/app/auth/gdrive/connect/route.ts` | **修改** | 支援 `login_hint`、`prompt=consent` 參數 |
| Google Drive 回調 | `src/app/auth/gdrive/callback/route.ts` | **保留** | 現有邏輯已正確存入 refresh_token |
| Middleware | `src/middleware.ts` | **微調** | 確保排除 `/auth/callback`、新增登入頁面處理 |
| 魔術連結 API | `src/app/api/auth/magic-link/route.ts` | **刪除** | 不再使用 |
| 環境變數 | `.env.local` | **保留** | `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` 供 Drive 授權使用 |

---

## 4. 詳細實作規格

### 4.1 登入頁面 (`src/app/login/page.tsx`)

```tsx
// 核心變更：
// 1. 移除 LoginForm 中的 Email input、Magic Link 邏輯
// 2. 新增 handleGoogleLogin：呼叫 supabase.auth.signInWithOAuth
// 3. 保留科技風格 UI（tech-card、tech-button 等）

'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Chrome } from 'lucide-react';
// ... 現有 imports

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

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
      // 顯示錯誤 toast
    }
  };

  return (
    <div className="fixed top-12 left-0 right-0 bottom-0 bg-[#07142b] ...">
      <div className="tech-card p-8 max-w-md w-full space-y-6 text-center">
        <h1 className="text-2xl font-bold text-white">PhamaCount</h1>
        <p className="text-sm text-slate-400">藥局智能清點系統</p>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="tech-button tech-button-primary w-full py-3 font-bold flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          <Chrome className="w-5 h-5" />
          使用 Google 登入
        </button>

        <p className="text-xs text-slate-500">
          登入即代表同意我們的服務條款與隱私權政策。<br />
          首次登入將同步授權 Google Drive 雲端備份權限。
        </p>
      </div>
    </div>
  );
}
```

### 4.2 OAuth 回調 (`src/app/auth/callback/route.ts`)

```typescript
// 核心變更：
// 1. 移除 token_hash / magiclink 邏輯
// 2. 僅保留 code 交換 session 邏輯
// 3. 交換成功後，檢查 user_gdrive_connections
// 4. 無記錄 → 導向 /auth/gdrive/connect?login_hint=email&prompt=consent

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error_param = searchParams.get('error');
  const error_description = searchParams.get('error_description');

  if (error_param || error_description) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(error_description ?? error_param ?? '登入失敗')}`,
        origin
      )
    );
  }

  const supabase = await createClient();

  if (code) {
    try {
      await supabase.auth.exchangeCodeForSession(code);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(message)}`, origin)
      );
    }

    // 取得用戶資訊
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent('無法取得用戶資訊')}`, origin)
      );
    }

    // 檢查 Google Drive 連線
    const { data: gdriveConn } = await supabase
      .from('user_gdrive_connections')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!gdriveConn) {
      // 無連線 → 導向 Drive 授權，帶入 login_hint 與 prompt=consent
      const connectUrl = new URL('/auth/gdrive/connect', origin);
      connectUrl.searchParams.set('login_hint', user.email ?? '');
      connectUrl.searchParams.set('prompt', 'consent');
      return NextResponse.redirect(connectUrl);
    }

    // 有連線 → 直接進入系統
    return NextResponse.redirect(new URL(`/?logged_in=true`, origin));
  }

  return NextResponse.redirect(new URL('/', origin));
}
```

### 4.3 Google Drive 連線發起 (`src/app/auth/gdrive/connect/route.ts`)

```typescript
// 核心變更：
// 1. 讀取 login_hint、prompt 參數並加入 Google OAuth URL
// 2. 保留現有 state cookie 邏輯

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const loginHint = searchParams.get('login_hint') ?? '';
  const prompt = searchParams.get('prompt') ?? 'consent';

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Google OAuth not configured' },
      { status: 500 }
    );
  }

  const scope = 'https://www.googleapis.com/auth/drive.file openid email';
  const state = crypto.randomUUID();

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', prompt);
  authUrl.searchParams.set('state', state);
  if (loginHint) {
    authUrl.searchParams.set('login_hint', loginHint);
  }

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('gdrive_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });

  return response;
}
```

### 4.4 Middleware (`src/middleware.ts`)

```typescript
// 核心變更：
// 1. 確保 whitelist 包含 /auth/callback
// 2. 登入頁面 /login 允許存取（避免重導向循環）

// 現有 whitelist 已包含：
// pathname === '/login'
// pathname.startsWith('/auth/gdrive')
// 新增確認：
// pathname === '/auth/callback'  ← 已在 /api/ 開頭下被排除，但為保險明確加入
```

---

## 5. Supabase Dashboard 設定清單

在 [Supabase Dashboard](https://supabase.com/dashboard) 執行：

1. **Authentication → Providers → Google**：啟用
2. **Client ID**：填入 `GOOGLE_CLIENT_ID`
3. **Client Secret**：填入 `GOOGLE_CLIENT_SECRET`
4. **Redirect URL**：`https://{your-domain}/auth/callback`
   - 本地開發：`http://localhost:3000/auth/callback`
5. **Additional Scopes**：`openid email https://www.googleapis.com/auth/drive.file`
6. **儲存**

> ⚠️ **重要**：Google Cloud Console 的 OAuth 同意畫面必須設為 **Production** 狀態，否則 refresh_token 7 天過期。

---

## 6. 環境變數

| 變數 | 用途 | 範例 |
|------|------|------|
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID（Drive 授權用） | `582076302927-xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | `GOCSPX-xxx` |
| `GOOGLE_REDIRECT_URI` | Drive 授權回調 URI | `http://localhost:3000/auth/gdrive/callback` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案 URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | `eyJ...` |

> Supabase Dashboard 另行設定相同的 `GOOGLE_CLIENT_ID/SECRET`。

---

## 7. 刪除檔案清單

以下檔案不再需要，**應完整刪除**：

| 檔案 | 原用途 |
|------|--------|
| `src/app/login/actions.ts` | Magic Link 發送 Server Action |
| `src/app/api/auth/magic-link/route.ts` | Magic Link 發送 API Route |

---

## 8. 驗收條件

### 8.1 功能驗收
- [ ] 訪問 `/login` 顯示「使用 Google 登入」按鈕，無 Email 輸入框
- [ ] 點擊按鈕導向 Google OAuth 同意頁（含 `drive.file` scope）
- [ ] 同意後回調 `/auth/callback`，成功建立 session
- [ ] 首次登入無 `user_gdrive_connections` → 自動導向 `/auth/gdrive/connect?prompt=consent`
- [ ] 第二次 OAuth 同意頁 → 回調 `/auth/gdrive/callback` → DB 寫入 `refresh_token`
- [ ] 導向首頁 `/`，Middleware 檢查通過
- [ ] 二次登入（已有 Drive 連線）→ 直接進入系統，不再要求授權
- [ ] 登出後重新登入 → 正常運作

### 8.2 邊界情境
- [ ] 取消 Google OAuth 同意 → 導向 `/login?error=oauth_denied` 顯示錯誤
- [ ] 網路錯誤/逾時 → 導向 `/login?error=...` 顯示友善錯誤
- [ ] 重複授權（已有連線再次點擊登入）→ 正常處理，不重複寫入
- [ ] `refresh_token` 失效（用戶撤銷權限）→ Middleware 檢查失敗 → 導向重新授權

### 8.3 相容性
- [ ] 既有用戶（已有 Magic Link 帳號）可用 Google 登入（同 Email 自動關聯）
- [ ] 既有 `user_gdrive_connections` 資料不受影響
- [ ] Middleware 強制綁定邏輯正常運作

---

## 9. 實施順序建議

```
1. Supabase Dashboard 設定 Google Provider
2. 修改 src/app/auth/callback/route.ts（移除 magiclink、加入 Drive 連線檢查）
3. 修改 src/app/auth/gdrive/connect/route.ts（支援 login_hint、prompt）
4. 重寫 src/app/login/page.tsx（Google 登入按鈕）
5. 刪除 src/app/login/actions.ts
6. 刪除 src/app/api/auth/magic-link/route.ts
7. 確認 middleware.ts whitelist 正確
8. 本地測試完整流程
9. 部署至 Vercel、更新生產環境變數
10. Google Cloud Console 加入生產域名 Redirect URI
```

---

## 10. 風險與緩解

| 風險 | 影響 | 緩解方案 |
|------|------|----------|
| Supabase Google Provider 設定錯誤 | 完全無法登入 | 本地先測試，確認回調正常後再部署 |
| `refresh_token` 無法取得 | Drive 授權失敗 | 使用 `prompt=consent` 強制回傳；本地驗證 |
| 既有用戶 Email 衝突 | 無法登入 | Supabase 以 Email 為鍵自動關聯，通常無問題 |
| 生產環境 Redirect URI 不符 | OAuth 失敗 | 部署前在 Google Cloud Console 加入生產域名 |

---

## 11. 相關文件

- `docs/superpowers/specs/2026-06-26-gdrive-cloud-backup-design.md` - Google Drive 備份原始規格
- `docs/superpowers/specs/2026-07-05-gdrive-cloud-backup-design-v2.md` - v2 規格
- `docs/superpowers/plans/2026-07-05-gdrive-cloud-backup-implementation-plan.md` - 實施計畫

---

**規格文件完成。請審閱確認，無誤後我將建立實作計畫。**