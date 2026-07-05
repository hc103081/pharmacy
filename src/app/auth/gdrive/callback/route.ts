import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Get stored state from cookie
  const storedState = request.cookies.get('gdrive_oauth_state')?.value;

  console.log('[gdrive-callback] code:', !!code, 'state match:', state === storedState, 'error:', error);

  // Validate state
  if (error) {
    console.log('[gdrive-callback] OAuth denied:', error);
    return NextResponse.redirect(
      new URL('/?error=oauth_denied', request.url)
    );
  }

  if (!code || !state || state !== storedState) {
    console.log('[gdrive-callback] Invalid state:', { code: !!code, state, storedState });
    return NextResponse.redirect(
      new URL('/?error=invalid_state', request.url)
    );
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('[gdrive-callback] Token exchange failed:', errorData);
      return NextResponse.redirect(
        new URL('/?error=token_exchange_failed', request.url)
      );
    }

    const tokenData = await tokenResponse.json();
    console.log('[gdrive-callback] Token exchange success');

    // Get user info to store email
    let userEmail = 'unknown@gmail.com'; // fallback
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );

    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      userEmail = userInfo.email || userEmail;
      console.log('[gdrive-callback] User info:', userEmail);
    } else {
      console.warn('[gdrive-callback] Userinfo failed:', userInfoResponse.status, '- using fallback email');
      // Try to extract email from ID token (JWT)
      if (tokenData.id_token) {
        try {
          const base64Url = tokenData.id_token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
          if (payload.email) {
            userEmail = payload.email;
            console.log('[gdrive-callback] Extracted email from ID token:', userEmail);
          }
        } catch {}
      }
    }

    // Store in database
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    console.log('[gdrive-callback] Auth user:', user?.id || 'NULL');

    if (!user) {
      console.log('[gdrive-callback] No user session, redirect to login');
      return NextResponse.redirect(new URL('/login?error=no_session', request.url));
    }

    const expiresAt = new Date(
      Date.now() + (tokenData.expires_in ?? 3600) * 1000
    ).toISOString();

    const { error: dbError } = await supabase
      .from('user_gdrive_connections')
      .upsert(
        {
          user_id: user.id,
          google_email: userEmail,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: expiresAt,
          scope: tokenData.scope,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (dbError) {
      console.error('[gdrive-callback] DB error:', dbError);
      return NextResponse.redirect(
        new URL('/?error=db_store_failed', request.url)
      );
    }

    console.log('[gdrive-callback] DB insert success for user:', user.id);

    // Clear state cookie and redirect to home
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.delete('gdrive_oauth_state');
    return response;
  } catch (err) {
    console.error('[gdrive-callback] Exception:', err);
    return NextResponse.redirect(
      new URL('/?error=callback_exception', request.url)
    );
  }
}