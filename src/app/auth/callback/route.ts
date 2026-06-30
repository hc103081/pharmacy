import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
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

  if (token_hash && type === 'magiclink') {
    const { data, error } = await supabase.auth.verifyOtp({
      type: 'email',
      token_hash,
    });

    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, origin)
      );
    }

    return NextResponse.redirect(
      new URL(`/?email_verified=true&timestamp=${Date.now()}`, origin)
    );
  }

  if (code) {
    try {
      await supabase.auth.exchangeCodeForSession(code);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(message)}`, origin)
      );
    }

    return NextResponse.redirect(
      new URL(`/?logged_in=true&timestamp=${Date.now()}`, origin)
    );
  }

  return NextResponse.redirect(new URL('/', origin));
}