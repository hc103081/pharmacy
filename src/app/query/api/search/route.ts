import { NextRequest, NextResponse } from 'next/server';
import { searchDrugsCrossManifest } from '@/app/query/lib/supabaseRpc';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      searchText = '',
      storageLocations = [],
      categories = [],
      dateFrom,
      dateTo,
      manifestStatus = ['active', 'archived'],
      countedStatus,
      hasDiscrepancy,
      page = 1,
      pageSize = 20
    } = body;

    const supabase = createClient();

    const offset = (page - 1) * pageSize;
    const limit = pageSize;

    const result = await searchDrugsCrossManifest({
      searchText,
      barcode: undefined,
      productCode: undefined,
      storageLocations: storageLocations.length > 0 ? storageLocations : undefined,
      categories: categories.length > 0 ? categories : undefined,
      dateFrom,
      dateTo,
      manifestStatus,
      countedStatus,
      hasDiscrepancy,
      limit,
      offset
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('查詢 API 錯誤:', error);
    return NextResponse.json(
      { error: '查詢失敗', details: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    );
  }
}