import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  const supabase = await createClient();

  if (token_hash && type === 'magiclink') {
    const { error } = await supabase.auth.verifyOtp({
      type: 'email',
      token_hash,
    });

    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, origin)
      );
    }
    
    // 成功驗證後，導向到成功頁面或直接到首頁，並添加成功提示
    return NextResponse.redirect(
      new URL(`/?email_verified=true&timestamp=${Date.now()}`, origin)
    );
  } else if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    // OAuth 登入成功後也加入時間戳以避免快取問題
    return NextResponse.redirect(
      new URL(`/?logged_in=true&timestamp=${Date.now()}`, origin)
    );
  }

  return NextResponse.redirect(new URL('/', origin));
}