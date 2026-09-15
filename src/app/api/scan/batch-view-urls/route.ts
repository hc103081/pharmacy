import { getBatchPresignedViewUrls } from '@/app/actions/scan/getViewUrl';
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { manifestId, keys } = await req.json();
    
    if (!manifestId || !keys || !Array.isArray(keys)) {
      return NextResponse.json({ error: '參數錯誤' }, { status: 400 });
    }

    // 驗證 manifest 擁有權
    const { getSupabaseAdmin } = await import('@/lib/supabaseAdmin');
    const { data: manifest, error: manifestError } = await getSupabaseAdmin()
      .from('manifests')
      .select('id, user_id')
      .eq('id', manifestId)
      .single();

    if (manifestError || !manifest || manifest.user_id !== user.id) {
      return NextResponse.json({ error: '無權限' }, { status: 403 });
    }

    const urls = await getBatchPresignedViewUrls(manifestId, keys, 3600);
    
    return NextResponse.json({ urls });
  } catch (error) {
    console.error('Batch view URLs error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}