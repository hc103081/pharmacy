-- Migration: Migrate existing data to user hc103081@gmail.com
-- Created: 2026-06-14
-- Run AFTER the user hc103081@gmail.com has logged in at least once (so auth.users record exists)

DO $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Get the user ID for hc103081@gmail.com
  SELECT id INTO target_user_id FROM auth.users WHERE email = 'hc103081@gmail.com';

  IF target_user_id IS NOT NULL THEN
    -- Assign all existing manifests to this user
    UPDATE manifests SET user_id = target_user_id WHERE user_id IS NULL;
  END IF;
END $$;