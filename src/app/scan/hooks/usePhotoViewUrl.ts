'use client';

import { useCallback, useMemo } from 'react';
import { getPresignedViewUrl } from '@/app/actions/scan/getViewUrl';
import type { DrugItem } from '@/types';

interface UsePhotoViewUrlOptions {
  manifestId: string | null;
}

/**
 * Hook for generating B2 presigned view URLs on demand
 * Supports both legacy Supabase URLs and new B2 keys
 */
export function usePhotoViewUrl({ manifestId }: UsePhotoViewUrlOptions) {
  const getViewUrl = useCallback(
    async (photoKeyOrUrl: string): Promise<string | null> => {
      if (!manifestId || !photoKeyOrUrl) return null;

      // If it's already a full HTTP URL (legacy Supabase), use directly
      if (photoKeyOrUrl.startsWith('http')) {
        return photoKeyOrUrl;
      }

      // Otherwise it's a B2 key, generate presigned view URL
      try {
        const res = await getPresignedViewUrl(manifestId, photoKeyOrUrl, 3600, 'inline');
        return res.success ? res.viewUrl || null : null;
      } catch {
        return null;
      }
    },
    [manifestId]
  );

  // Batch version for pre-fetching multiple URLs
  const getBatchViewUrls = useCallback(
    async (photoKeysOrUrls: string[]): Promise<Record<string, string>> => {
      if (!manifestId || photoKeysOrUrls.length === 0) return {};

      try {
        const res = await getPresignedViewUrl(manifestId, '', 3600, 'inline');
        // The batch function is in the same Server Action module
        // We'll call a separate batch function
        const batchRes = await fetch(`/api/scan/batch-view-urls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manifestId, keys: photoKeysOrUrls }),
        });
        if (batchRes.ok) {
          const data = await batchRes.json();
          return data.urls || {};
        }
      } catch {
        // Fallback: return empty
      }
      return {};
    },
    [manifestId]
  );

  return { getViewUrl, getBatchViewUrls };
}

/**
 * Client-side utility to check if a photo_url is a B2 key (relative path)
 * vs legacy Supabase public URL
 */
export function isB2Key(photoUrl: string): boolean {
  return !photoUrl.startsWith('http');
}

/**
 * Extract a display-friendly identifier from photo_url
 */
export function getPhotoDisplayId(photoUrl: string): string {
  if (photoUrl.startsWith('http')) {
    // Legacy Supabase URL: extract filename
    try {
      const url = new URL(photoUrl);
      return url.pathname.split('/').pop() || 'photo';
    } catch {
      return 'photo';
    }
  }
  // B2 key: use the key itself
  return photoUrl.split('/').pop() || 'photo';
}