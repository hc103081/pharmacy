UPDATE gdrive_migration_jobs
SET retry_count = 0, status = 'pending', updated_at = now()
WHERE id = '63ff2ba7-f8d1-4db0-93a2-af00c2f29b8d';