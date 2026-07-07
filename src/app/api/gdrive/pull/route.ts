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

    const body = await request.json();
    const { manifestId } = body;

    if (!manifestId) {
      return NextResponse.json(
        { error: 'manifestId required' },
        { status: 400 }
      );
    }

    // Verify manifest belongs to user and is cloud_archived
    const { data: manifest, error: manifestError } = await supabase
      .from('manifests')
      .select('id, user_id, cloud_backup, gdrive_file_id')
      .eq('id', manifestId)
      .single();

    if (manifestError || !manifest) {
      return NextResponse.json(
        { error: 'Manifest not found' },
        { status: 404 }
      );
    }

    if (manifest.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!manifest.cloud_backup || !manifest.gdrive_file_id) {
      return NextResponse.json(
        { error: 'Manifest not backed up to Google Drive' },
        { status: 400 }
      );
    }

    // Invoke gdrive-pull Edge Function
    const functionsUrl = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!functionsUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'Server configuration missing' },
        { status: 500 }
      );
    }

    const response = await fetch(
      `${functionsUrl}/gdrive-pull`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ manifestId }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: result.error || 'Pull failed' },
        { status: response.status }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Pull trigger error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}