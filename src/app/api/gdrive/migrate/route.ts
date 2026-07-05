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

    // Verify manifest belongs to user
    const { data: manifest, error: manifestError } = await supabase
      .from('manifests')
      .select('id, user_id')
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

    // Insert into queue
    const { data: job, error: jobError } = await supabase
      .from('gdrive_migration_jobs')
      .insert({
        manifest_id: manifestId,
        user_id: user.id,
        trigger: 'manual',
        status: 'pending',
      })
      .select('id')
      .single();

    if (jobError) {
      // Check for duplicate (ON CONFLICT DO NOTHING equivalent)
      if (jobError.code === '23505') {
        return NextResponse.json(
          { message: 'Migration already queued' },
          { status: 200 }
        );
      }
      throw jobError;
    }

    return NextResponse.json({
      message: 'Migration queued',
      jobId: job?.id,
    });
  } catch (err) {
    console.error('Manual migrate error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}