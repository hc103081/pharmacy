-- Migration: Create drug-photos storage bucket and RLS policies
-- Created: 2026-06-14

-- 1. Create storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'drug-photos',
  'drug-photos',
  true,
  52428800, -- 50MB max file size
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policy: Authenticated users can upload photos to their own manifest folders
CREATE POLICY "Users can upload drug photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'drug-photos'
  AND auth.uid() IS NOT NULL
);

-- 3. RLS policy: Anyone can view drug photos (public bucket)
CREATE POLICY "Anyone can view drug photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'drug-photos');

-- 4. RLS policy: Authenticated users can update their own photos
CREATE POLICY "Users can update own drug photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'drug-photos')
WITH CHECK (bucket_id = 'drug-photos');

-- 5. RLS policy: Authenticated users can delete their own photos
CREATE POLICY "Users can delete own drug photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'drug-photos');