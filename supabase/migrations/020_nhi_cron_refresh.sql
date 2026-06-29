-- 020_nhi_cron_refresh.sql
-- 健保藥品對照表「每月 1 日 03:00」的自動重匯流程
-- 使用 pg_net 擴充功能的 net.http_post 直接呼叫 Edge Function

-- 1. 確保 pg_net 擴充功能已安裝 (透過之前的驗證確認已存在)
-- CREATE EXTENSION IF NOT EXISTS pg_net; -- 已經安裝，此行可註解掉或保留為安全措施

-- 2. 建立呼叫 NHI 更新 Edge Function 的 SQL 函式
CREATE OR REPLACE FUNCTION public.trigger_nhi_refresh()
RETURNS void
LANGUAGE sql
AS $$
  -- 呼叫我們已部署的 refresh-nhi-lookup Edge Function
  -- 使用 net.http_post 從 pg_net 擴充功能
  SELECT net.http_post(
    url => 'https://epjyodyjdssgjqrzgtnc.supabase.co/functions/v1/refresh-nhi-lookup',
    body => '{}'::jsonb,
    params => '{}'::jsonb,
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwanlvZHlqZHNzZ2pxcnpndG5jIiwicm9zZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTI0ODIyNSwiZXhwIjoyMDk2ODI0MjI1fQ.rzePXeqQzsTiQxgosduqvEFGdnfbylV2CIp_XxrA8oA'
    ),
    timeout_milliseconds => 300000
  );
$$;

-- 3. 設定每月 1 日 03:00 (UTC) 執行一次
-- 對應到台灣時間是每月 1 日 11:00
SELECT cron.schedule(
  'nhi_monthly_refresh',
  '0 3 1 * *',
  'SELECT public.trigger_nhi_refresh()'
);