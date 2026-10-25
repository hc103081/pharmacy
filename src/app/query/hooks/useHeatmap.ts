'use client';

import { useQuery } from '@tanstack/react-query';
import { getLocationCategoryHeatmap } from '@/app/query/lib/supabaseRpc';
import { queryKeys } from '@/app/query/lib/queryKeys';
import type { HeatmapCell } from '@/types/query';

export const useHeatmap = (dateFrom?: string, dateTo?: string) => {
  return useQuery<HeatmapCell[], Error>({
    queryKey: queryKeys.heatmap(dateFrom, dateTo),
    queryFn: () => getLocationCategoryHeatmap(dateFrom, dateTo),
    // Enable stale-while-revalidate for better UX
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

export const useHeatmapSuspended = (dateFrom?: string, dateTo?: string) => {
  const query = useHeatmap(dateFrom, dateTo);
  
  // Suspense-friendly version - 直接返回，避免拋出物件導致 [object Object] 錯誤
  if (query.isLoading && !query.data) {
    // 直接返回 query 物件，讓呼叫者自行處理 loading 狀態
    return query;
  }
  
  return query;
};