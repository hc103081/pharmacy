-- Migration: Create import_screenshots storage bucket and RLS policies
-- Created: 2026-06-18

-- 1. Create storage bucket for PDF import screenshots (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'import_screenshots',
  'import_screenshots',
  true,
  52428800, -- 50MB max file size
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policy: Authenticated users can upload import screenshots
CREATE POLICY "Users can upload import screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'import_screenshots'
  AND auth.uid() IS NOT NULL
);

-- 3. RLS policy: Anyone can view import screenshots (public bucket)
CREATE POLICY "Anyone can view import screenshots"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'import_screenshots');

-- 4. RLS policy: Authenticated users can update import screenshots
CREATE POLICY "Users can update import screenshots"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'import_screenshots')
WITH CHECK (bucket_id = 'import_screenshots');

-- 5. RLS policy: Authenticated users can delete import screenshots
CREATE POLICY "Users can delete import screenshots"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'import_screenshots');