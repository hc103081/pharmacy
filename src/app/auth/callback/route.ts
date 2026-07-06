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
      if (user.email) {
        connectUrl.searchParams.set('login_hint', user.email);
      }
      connectUrl.searchParams.set('prompt', 'consent');
      return NextResponse.redirect(connectUrl);
    }

    // 有連線 → 直接進入系統
    return NextResponse.redirect(new URL(`/?logged_in=true&timestamp=${Date.now()}`, origin));
  }

  return NextResponse.redirect(new URL('/', origin));
}