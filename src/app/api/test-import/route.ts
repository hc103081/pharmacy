import { NextResponse } from 'next/server';
import { importDrugs } from '@/app/actions/import';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * 測試專用 API – 建立一筆測試清單並匯入藥品。
 * 僅在開發環境 (process.env.NODE_ENV === 'development') 被呼叫。
 */
export async function POST(request: Request) {
  try {
    const { manifestName, drugs } = await request.json();

    // 取得一個測試用的使用者（此處簡化為取第一個使用者）
    const { data } = await getSupabaseAdmin().auth.admin.listUsers();
    const users = (data as { users: Array<{ id: string }> })?.users;
    const testUser = users?.[0];
    if (!testUser) {
      return NextResponse.json({ success: false, error: '測試使用者不存在' }, { status: 400 });
    }

    // 呼叫原有的匯入函式，將 product_code 也傳入
    const result = await importDrugs(
      manifestName,
      drugs.map((d: any) => ({
        barcode: d.barcode ?? '',
        product_code: d.product_code ?? '',
        name: d.name ?? '',
        expected_quantity: d.expected_quantity ?? 0,
        bonus_quantity: d.bonus_quantity ?? 0,
        storage_location: d.storage_location ?? '',
        category: d.category ?? '',
      })),
      testUser.id,
      {}
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error('test-import API error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
