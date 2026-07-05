import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ connected: false }, { status: 401 });
    }

    // Get connection
    const { data: connection, error } = await supabase
      .from('user_gdrive_connections')
      .select('google_email, access_token, token_expires_at, gdrive_root_folder_id')
      .eq('user_id', user.id)
      .single();

    if (error || !connection) {
      return NextResponse.json({ connected: false });
    }

    // Check if access token is valid
    const expiresAt = connection.token_expires_at
      ? new Date(connection.token_expires_at).getTime()
      : 0;
    const isTokenValid = expiresAt > Date.now() + 5 * 60 * 1000;

    // If token is expired, try to refresh
    let accessToken = connection.access_token;
    if (!isTokenValid) {
      try {
        const refreshResponse = await fetch(
          `${request.nextUrl.origin}/api/gdrive/token-refresh`,
          { method: 'POST' }
        );
        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          accessToken = data.access_token;
        }
      } catch {
        // Ignore refresh error, will return invalid token
      }
    }

    // Get Google Drive storage quota
    let storageQuota = null;
    if (accessToken) {
      try {
        const quotaResponse = await fetch(
          'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (quotaResponse.ok) {
          const quotaData = await quotaResponse.json();
          storageQuota = quotaData.storageQuota;
        }
      } catch {
        // Ignore quota fetch error
      }
    }

    return NextResponse.json({
      connected: true,
      email: connection.google_email,
      token_valid: isTokenValid,
      storage_quota: storageQuota,
      root_folder_id: connection.gdrive_root_folder_id,
    });
  } catch (err) {
    console.error('Status check error:', err);
    return NextResponse.json({ connected: false }, { status: 500 });
  }
}