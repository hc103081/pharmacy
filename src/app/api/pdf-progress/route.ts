import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
/**
 * 簡易即時進度 API（示範用）。客戶端可輪詢此端點取得目前 PDF 處理的階段與百分比。
 * 真實環境建議改為 WebSocket 或 Supabase Realtime，此檔案僅作為佔位實作。
 */
export async function GET(req: NextRequest) {
  // 從 query 參數取得唯一的上傳 ID（實務上會使用 UUID）
  const id = req.nextUrl.searchParams.get('id') ?? 'demo';
  // 這裡回傳固定的模擬資料；實際可將進度寫入 DB 或記憶體 cache 再回傳
  const progress = {
    id,
    step: 'parse', // upload | parse | infer | done
    percent: 45,
    label: '模擬解析中…',
  };
  return NextResponse.json(progress);
}
