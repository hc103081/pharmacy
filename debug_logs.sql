-- Check archive logs for the failing manifest
SELECT * FROM archive_logs 
WHERE manifest_id = '7135cc74-ad53-4c52-96e1-0e832bf62bf5'
ORDER BY created_at DESC LIMIT 20;