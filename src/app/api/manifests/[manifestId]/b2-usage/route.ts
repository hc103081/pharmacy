import { getB2Usage } from '@/app/actions/manifests/getB2Usage';
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ manifestId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: '未登入或登入已過期，請重新登入' },
        { status: 401 }
      );
    }

    const { manifestId } = await params;
    const result = await getB2Usage(manifestId);

    if (!result.success) {
      const status = result.error?.includes('無權限') ? 403 : 404;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API /manifests/[id]/b2-usage] Error:', error);
    return NextResponse.json(
      { success: false, error: '伺服器錯誤，請稍後再試' },
      { status: 500 }
    );
  }
}