-- 020_nhi_cron_refresh.sql
-- 健保藥品對照表「每月 1 日 03:00」的自動重匯流程說明：
-- 由於 Supabase 受管理的 PostgreSQL 不允許執行擴充功能（如 net.http_post）來進行外部 HTTP 呼叫，
-- 因此此排程僅負責在每月 1 日 03:00 (UTC) 重設匯入狀態（last_row=0），
-- 實際的藥品對照表更新由 Vercel Cron 觸發的 Edge Function 執行。
-- 兩者皆設定為同一時間執行，以確保資料同步。

-- 1. 建立一個簡單的函式，僅重設匯入狀態（實際更新由 Vercel 處理）
CREATE OR REPLACE FUNCTION public.reset_nhi_import_state()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.nhi_import_state
  SET last_row = 0
  WHERE id = 1;
END;
$$;

-- 2. 排程：每月 1 日 03:00 (UTC) 執行一次
SELECT cron.schedule(
  'nhi_monthly_reset',
  '0 3 1 * *',
  'SELECT public.reset_nhi_import_state()'
);