import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current connection
    const { data: connection, error } = await supabase
      .from('user_gdrive_connections')
      .select('refresh_token, token_expires_at')
      .eq('user_id', user.id)
      .single();

    if (error || !connection?.refresh_token) {
      return NextResponse.json(
        { error: 'No Google Drive connection found' },
        { status: 404 }
      );
    }

    // Check if token is still valid (with 5 min buffer)
    const expiresAt = connection.token_expires_at
      ? new Date(connection.token_expires_at).getTime()
      : 0;
    const now = Date.now();

    if (expiresAt > now + 5 * 60 * 1000) {
      // Token still valid, return current access token
      const { data: currentConn } = await supabase
        .from('user_gdrive_connections')
        .select('access_token')
        .eq('user_id', user.id)
        .single();

      // Guard: if access_token is null/empty despite valid expiresAt, force refresh
      if (!currentConn?.access_token) {
        console.warn('[token-refresh] Token expired but access_token missing, forcing refresh');
      } else {
        return NextResponse.json({ access_token: currentConn.access_token });
      }
    }

    // Refresh token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: connection.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Token refresh failed:', errorData);

      // If refresh_token is invalid, mark connection as invalid
      if (errorData.error === 'invalid_grant') {
        await supabase
          .from('user_gdrive_connections')
          .update({ refresh_token: null, access_token: null })
          .eq('user_id', user.id);
      }

      return NextResponse.json(
        { error: 'Token refresh failed', details: errorData },
        { status: 401 }
      );
    }

    const tokenData = await tokenResponse.json();
    const expiresAtNew = new Date(
      Date.now() + (tokenData.expires_in ?? 3600) * 1000
    ).toISOString();

    // Update database with new tokens
    const { error: updateError } = await supabase
      .from('user_gdrive_connections')
      .update({
        access_token: tokenData.access_token,
        token_expires_at: expiresAtNew,
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Failed to update tokens:', updateError);
      return NextResponse.json(
        { error: 'Failed to store new tokens' },
        { status: 500 }
      );
    }

    return NextResponse.json({ access_token: tokenData.access_token });
  } catch (err) {
    console.error('Token refresh error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}