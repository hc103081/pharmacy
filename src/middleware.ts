import { updateSession } from '@/lib/supabase/middleware';
import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  // First run session update
  let supabaseResponse = await updateSession(request);

  // GDrive connection check
  const { pathname } = request.nextUrl;

  // Whitelist: OAuth/API/_next/static/login - must NOT be intercepted
  if (
    pathname.startsWith('/auth/gdrive') ||
    pathname.startsWith('/api/gdrive') ||
    pathname.startsWith('/api/') ||
    pathname === '/auth/callback' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/login' ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp)$/)
  ) {
    return supabaseResponse;
  }

  // Check if user is logged in (updateSession already handled redirect for unauthenticated)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log('[middleware] pathname:', pathname, 'user:', user?.id || 'NULL');

  // Not logged in - let updateSession handle redirect to /login
  if (!user) {
    console.log('[middleware] No user, letting updateSession handle');
    return supabaseResponse;
  }

  // Logged in but no GDrive connection - force OAuth
  const { data: gdriveConn, error: connError } = await supabase
    .from('user_gdrive_connections')
    .select('id')
    .eq('user_id', user.id)
    .single();

  console.log('[middleware] gdriveConn:', !!gdriveConn, 'error:', connError?.message);

  if (!gdriveConn) {
    console.log('[middleware] No GDrive connection, redirecting to /auth/gdrive/connect');
    return NextResponse.redirect(
      new URL('/auth/gdrive/connect', request.url)
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};