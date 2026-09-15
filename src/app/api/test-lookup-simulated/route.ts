import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * 測試專用 API – 模擬條碼搜尋（支援 barcode 和 product_code 雙條碼匹配）
 */
export async function POST(request: Request) {
  try {
    const { manifestId, barcode } = await request.json();

    if (!manifestId || !barcode) {
      return NextResponse.json(
        { ok: false, error: 'manifestId 和 barcode 為必填' },
        { status: 400 }
      );
    }

    // 在 drug_items 中搜尋 barcode 或 product_code 匹配
    const { data: items, error } = await getSupabaseAdmin()
      .from('drug_items')
      .select('id, name, barcode, product_code, expected_quantity, page_number')
      .eq('manifest_id', manifestId)
      .or(`barcode.eq.${barcode},product_code.eq.${barcode}`)
      .limit(1)
      .single();

    if (error || !items) {
      return NextResponse.json({ ok: true, found: false, item: null });
    }

    return NextResponse.json({
      ok: true,
      found: true,
      item: {
        id: items.id,
        name: items.name,
        barcode: items.barcode,
        product_code: items.product_code,
        expected_quantity: items.expected_quantity,
        page_number: items.page_number,
      },
    });
  } catch (err) {
    console.error('test-lookup-simulated error:', err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}