'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { searchDrugsCrossManifest } from '@/app/query/lib/supabaseRpc';
import { queryKeys } from '@/app/query/lib/queryKeys';
import type { DrugSearchFilters, DrugSearchResult } from '@/types/query';

export const useDrugSearch = (filters: DrugSearchFilters) => {
  return useInfiniteQuery<DrugSearchResult[], Error>({
    queryKey: queryKeys.drugSearch(filters),
    queryFn: async ({ pageParam }: { pageParam: unknown }) => {
      const page = (pageParam as number) ?? 0;
      const results = await searchDrugsCrossManifest({
        ...filters,
        limit: 50,
        offset: page * 50
      });
      return results;
    },
    getNextPageParam: (lastPage, allPages) => {
      // 如果最後一頁有 50 筆資料，表示還有下一頁
      //下一個頁面的索引就是目前所有頁面的數量（因為頁面索引從 0 開始）
      return lastPage.length === 50 ? allPages.length : undefined;
    },
    initialPageParam: 0,
    // Enable stale-while-revalidate for better UX
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

export const useDrugSearchSuspended = (filters: DrugSearchFilters) => {
  const query = useDrugSearch(filters);
  
  // 直接返回 query，讓呼叫者自行判斷 loading 狀態
  // 避免拋出物件導致 "[object Object]" 錯誤
  return query;
};