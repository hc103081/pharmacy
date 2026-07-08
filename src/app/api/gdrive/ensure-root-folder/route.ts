import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get connection with refresh token
    const { data: connection, error } = await supabase
      .from('user_gdrive_connections')
      .select('access_token, refresh_token, token_expires_at, gdrive_root_folder_id')
      .eq('user_id', user.id)
      .single();

    if (error || !connection) {
      return NextResponse.json({ error: 'Google Drive not connected' }, { status: 404 });
    }

    // If already cached, return it
    if (connection.gdrive_root_folder_id) {
      return NextResponse.json({ root_folder_id: connection.gdrive_root_folder_id });
    }

    // Check if access token is valid, refresh if needed
    const expiresAt = connection.token_expires_at
      ? new Date(connection.token_expires_at).getTime()
      : 0;
    const isTokenValid = expiresAt > Date.now() + 5 * 60 * 1000;

    let accessToken = connection.access_token;
    if (!isTokenValid && connection.refresh_token) {
      try {
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

        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          accessToken = tokenData.access_token;
          
          // Update stored access token
          const newExpiresAt = new Date(
            Date.now() + (tokenData.expires_in ?? 3600) * 1000
          ).toISOString();
          
          await supabase
            .from('user_gdrive_connections')
            .update({ access_token: accessToken, token_expires_at: newExpiresAt })
            .eq('user_id', user.id);
        }
      } catch {
        // Ignore refresh error, will fail below
      }
    }

    if (!accessToken) {
      return NextResponse.json({ error: 'No valid access token' }, { status: 401 });
    }

    // Find or create PhamaCount root folder
    const listRes = await fetch(
      `${GOOGLE_DRIVE_API}/files?q=name='PhamaCount' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name,createdTime)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      return NextResponse.json({ error: 'Failed to list Drive folders' }, { status: 500 });
    }

    const listData = await listRes.json();
    let folderId: string;

    if (listData.files && listData.files.length > 0) {
      // Use the most recently created folder
      listData.files.sort((a: { createdTime: string }, b: { createdTime: string }) => 
        b.createdTime.localeCompare(a.createdTime)
      );
      folderId = listData.files[0].id;
    } else {
      // Create new folder
      const createRes = await fetch(`${GOOGLE_DRIVE_API}/files`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${accessToken}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          name: 'PhamaCount', 
          mimeType: 'application/vnd.google-apps.folder' 
        }),
      });

      if (!createRes.ok) {
        return NextResponse.json({ error: 'Failed to create root folder' }, { status: 500 });
      }

      const createData = await createRes.json();
      folderId = createData.id;
    }

    // Cache in database
    await supabase
      .from('user_gdrive_connections')
      .update({ gdrive_root_folder_id: folderId })
      .eq('user_id', user.id);

    return NextResponse.json({ root_folder_id: folderId });
  } catch (err) {
    console.error('[ensure-root-folder] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}