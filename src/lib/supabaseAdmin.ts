import { SupabaseClient, createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let _cachedAdmin: SupabaseClient | null = null;

/**
 * 取得 Supabase Admin 客戶端（service_role key）。
 * 使用延遲初始化，避免在環境變數缺失時模組載入就 crash。
 * 錯誤會在實際呼叫時才拋出，而不是在 import 階段。
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'Supabase Admin 環境變數未設定（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY），請確認 Vercel 專案設定'
    );
  }
  if (!_cachedAdmin) {
    _cachedAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _cachedAdmin;
}
