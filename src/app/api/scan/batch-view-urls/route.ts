import { getBatchPresignedViewUrls } from '@/app/actions/scan/getViewUrl';
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  console.log('>>> [batch-view-urls] ROUTE HANDLER STARTED', { url: req.url, method: req.method });
  try {
    const supabase = await createClient();
    
    // Debug: 檢查 cookie
    const cookieStore = await (await import('next/headers')).cookies();
    const allCookies = cookieStore.getAll();
    console.log('[batch-view-urls] Cookies count:', allCookies.length);
    console.log('[batch-view-urls] Has auth token:', allCookies.some(c => c.name.includes('auth-token')));
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('[batch-view-urls] Auth result:', { user: user?.id, authError: authError?.message });
    
    if (authError || !user) {
      return NextResponse.json({ error: '未登入', debug: { authError: authError?.message, cookieCount: allCookies.length } }, { status: 401 });
    }

    const { manifestId, keys } = await req.json();
    console.log('[batch-view-urls] Request payload:', { manifestId, keys });
    
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

    console.log('[batch-view-urls] Manifest query result:', { manifest, manifestError });

    // 開發環境除錯
    if (process.env.NODE_ENV === 'development') {
      console.log('[batch-view-urls] current user:', user.id);
      console.log('[batch-view-urls] manifest owner:', manifest?.user_id);
      console.log('[batch-view-urls] match:', manifest?.user_id === user.id);
    }

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