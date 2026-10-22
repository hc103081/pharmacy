import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

// Only allow in development/test environment
if (process.env.NODE_ENV === 'production') {
  // In production, this route should not exist or return 404
}

const TEST_USER_EMAIL = 'test-user@pharmacy.local';
const TEST_USER_PASSWORD = 'TestPassword123!';

export async function POST(request: NextRequest) {
  // Only allow in non-production environments
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: 'Test auth API not available in production' },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate credentials
    if (email !== TEST_USER_EMAIL || password !== TEST_USER_PASSWORD) {
      return NextResponse.json(
        { success: false, error: 'Invalid test credentials' },
        { status: 401 }
      );
    }

    // Create Supabase Admin client with service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Sign in with password using admin client to verify credentials
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    if (signInError || !signInData.session) {
      console.error('Test auth sign in error:', signInError);
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      );
    }

    // Create server client for setting cookies
    const response = NextResponse.json({
      success: true,
      user: {
        id: signInData.user.id,
        email: signInData.user.email,
      },
    });

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

    // Set the session using the server client - this will set proper SSR cookies
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    });

    if (sessionError) {
      console.error('Test auth set session error:', sessionError);
      return NextResponse.json(
        { success: false, error: 'Failed to set session' },
        { status: 500 }
      );
    }

    return response;
  } catch (error) {
    console.error('Test auth login error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}