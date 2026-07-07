-- Debug query for gdrive migration failure
SELECT 
  j.id as job_id,
  j.manifest_id,
  j.user_id,
  j.trigger,
  j.status,
  j.retry_count,
  j.storage_deleted,
  j.created_at,
  j.updated_at,
  m.status as manifest_status,
  m.cloud_backup,
  m.archived_at,
  m.storage_size_bytes,
  m.archive_status,
  c.google_email,
  c.refresh_token IS NOT NULL as has_refresh_token,
  c.token_expires_at
FROM gdrive_migration_jobs j
LEFT JOIN manifests m ON j.manifest_id = m.id
LEFT JOIN user_gdrive_connections c ON j.user_id = c.user_id
WHERE j.id = '63ff2ba7-f8d1-4db0-93a2-af00c2f29b8d'
ORDER BY j.created_at DESC;