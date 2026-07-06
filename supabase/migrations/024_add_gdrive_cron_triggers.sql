-- 1. gdrive-migrate-cron：每天 04:00 UTC 自動分派移轉任務
CREATE OR REPLACE FUNCTION trigger_gdrive_migrate_cron()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  function_url text := 'https://epjyodyjdssgjqrzgtnc.supabase.co/functions/v1/gdrive-migrate-cron';
  service_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  SELECT net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) INTO result;

  RETURN jsonb_build_object(
    'triggered', true,
    'function', 'gdrive-migrate-cron',
    'response', result
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'triggered', false,
    'function', 'gdrive-migrate-cron',
    'error', SQLERRM
  );
END;
$$;

-- 2. gdrive-queue-worker：每 5 分鐘處理佇列
CREATE OR REPLACE FUNCTION trigger_gdrive_queue_worker()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  function_url text := 'https://epjyodyjdssgjqrzgtnc.supabase.co/functions/v1/gdrive-queue-worker';
  service_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  SELECT net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) INTO result;

  RETURN jsonb_build_object(
    'triggered', true,
    'function', 'gdrive-queue-worker',
    'response', result
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'triggered', false,
    'function', 'gdrive-queue-worker',
    'error', SQLERRM
  );
END;
$$;

-- 3. gdrive-storage-cleanup：每週日 02:00 UTC 清理 Storage
CREATE OR REPLACE FUNCTION trigger_gdrive_storage_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  function_url text := 'https://epjyodyjdssgjqrzgtnc.supabase.co/functions/v1/gdrive-storage-cleanup';
  service_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  SELECT net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) INTO result;

  RETURN jsonb_build_object(
    'triggered', true,
    'function', 'gdrive-storage-cleanup',
    'response', result
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'triggered', false,
    'function', 'gdrive-storage-cleanup',
    'error', SQLERRM
  );
END;
$$;

-- 4. 批次觸發：一次觸發 migrate-cron → queue-worker
CREATE OR REPLACE FUNCTION trigger_gdrive_migration_full_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cron_result jsonb;
  worker_result jsonb;
BEGIN
  SELECT trigger_gdrive_migrate_cron() INTO cron_result;
  PERFORM pg_sleep(2);
  SELECT trigger_gdrive_queue_worker() INTO worker_result;
  
  RETURN jsonb_build_object(
    'migrate_cron', cron_result,
    'queue_worker', worker_result
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'error', SQLERRM
  );
END;
$$;

-- 權限：允許 authenticated 角色呼叫
GRANT EXECUTE ON FUNCTION trigger_gdrive_migrate_cron() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_gdrive_queue_worker() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_gdrive_storage_cleanup() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_gdrive_migration_full_cycle() TO authenticated;