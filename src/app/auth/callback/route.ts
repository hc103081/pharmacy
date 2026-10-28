import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error_param = searchParams.get('error');
  const error_description = searchParams.get('error_description');

  // 反向代理（如 Vercel）環境下解析真實外部 Host 與協議
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const siteUrl = (process.env.NODE_ENV === 'production' && forwardedHost)
    ? `${forwardedProto}://${forwardedHost}`
    : origin;

  if (error_param || error_description) {
    const errorMsg = error_description || error_param || '登入授權已被取消或失敗';
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorMsg)}`, siteUrl)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent('缺少認證授權代碼 (code)')}`, siteUrl)
    );
  }

  const cookieStore = await cookies();
  const cookiesToSetLater: Array<{ name: string; value: string; options: any }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSetLater.push(...cookiesToSet);
          for (const { name, value, options } of cookiesToSet) {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // 容錯防護
            }
          }
        },
      },
    }
  );

  // 1. 換取 Session
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error('[auth/callback] exchangeCodeForSession failed:', exchangeError);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(`授權驗證失敗：${exchangeError.message}`)}`, siteUrl)
    );
  }

  // 2. 獲取使用者物件（優先從換碼結果獲取，避免二次 network round-trip）
  let user: User | null = data?.user ?? data?.session?.user ?? null;
  if (!user) {
    const { data: userData } = await supabase.auth.getUser();
    user = userData?.user ?? null;
  }

  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent('登入成功但無法解析使用者資訊')}`, siteUrl)
    );
  }

  // 3. 檢查 Google Drive 連線
  const { data: gdriveConn } = await supabase
    .from('user_gdrive_connections')
    .select('id, refresh_token')
    .eq('user_id', user.id)
    .single();

  const isFakeToken = gdriveConn?.refresh_token?.startsWith('fake_');

  let targetUrl: URL;
  if (!gdriveConn || isFakeToken) {
    targetUrl = new URL('/auth/gdrive/connect', siteUrl);
    if (user.email) {
      targetUrl.searchParams.set('login_hint', user.email);
    }
    targetUrl.searchParams.set('prompt', 'consent');
  } else {
    targetUrl = new URL(`/?logged_in=true&timestamp=${Date.now()}`, siteUrl);
  }

  // 4. 構建重定向並明確附加 Set-Cookie 標頭
  const response = NextResponse.redirect(targetUrl);
  for (const { name, value, options } of cookiesToSetLater) {
    response.cookies.set(name, value, options);
  }

  return response;
}
