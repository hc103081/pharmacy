import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

// Only allow in development/test environment
if (process.env.NODE_ENV === 'production') {
  // In production, this route should not exist or return 404
}

export async function POST(request: NextRequest) {
  // Only allow in non-production environments
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: 'Test auth API not available in production' },
      { status: 404 }
    );
  }

  try {
    const response = NextResponse.json({ success: true });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      }
    );

    // Sign out - this will clear the session cookies
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Test auth logout error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to sign out' },
        { status: 500 }
      );
    }

    return response;
  } catch (error) {
    console.error('Test auth logout error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}