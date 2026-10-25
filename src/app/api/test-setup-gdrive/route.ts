import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  // Only allow in development/test environment
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // If userId is email, get the actual UUID from auth users
    let userUuid = userId;
    if (userId.includes('@')) {
      console.log(`User ID is email ${userId}, getting UUID from auth users`);
      const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (listError || !users || users.users.length === 0) {
        console.error(`User not found with email ${userId}:`, listError);
        return NextResponse.json({ error: `User not found: ${userId}` }, { status: 404 });
      }
      
      userUuid = users.users[0].id;
      console.log(`Found UUID for user ${userId}: ${userUuid}`);
    }

    // Check if connection already exists
    const existing = await supabaseAdmin
      .from('user_gdrive_connections')
      .select('id')
      .eq('user_id', userUuid)
      .single();

    if (existing.data) {
      console.log(`GDrive connection already exists for user ${userUuid}`);
      return NextResponse.json({ success: true, message: 'Connection already exists' });
    }

    // Create a test GDrive connection
    const { data, error } = await supabaseAdmin
      .from('user_gdrive_connections')
      .insert({
        user_id: userUuid,
        google_email: userId,
        access_token: 'test_access_token_' + userUuid,
        refresh_token: 'test_refresh_token_' + userUuid,
        token_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
        scope: 'https://www.googleapis.com/auth/drive.file',
        connected_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating GDrive connection:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`Created test GDrive connection for user ${userUuid}`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Test GDrive connection created',
      connection: data 
    });
  } catch (error) {
    console.error('Test GDrive setup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}