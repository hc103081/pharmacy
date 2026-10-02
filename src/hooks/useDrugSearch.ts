'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { searchDrugsCrossManifest } from '@/lib/supabaseRpc';
import type { DrugSearchFilters } from '@/types/query';
import { useState, useEffect } from 'react';

export function useDrugSearch(initialFilters: DrugSearchFilters = {}) {
  const [filters, setFilters] = useState<DrugSearchFilters>(initialFilters);

  // 當 filters 變化時，重置查詢頁碼
  useEffect(() => {
    // 這個 effect 會在 filters 改變時觸發
    // 但 useInfiniteQuery 會自動處理重置，所以這裡可以保持空
  }, [filters]);

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['drugSearch', filters],
    queryFn: async ({ pageParam = 0 }) => {
      const results = await searchDrugsCrossManifest({
        ...filters,
        limit: 50,
        offset: pageParam * 50,
      });
      return results;
    },
    getNextPageParam: (lastPage, allPages) => {
      // 如果返回的結果少於限制，表示已經是最後一頁
      if (lastPage.length < 50) return undefined;
      return allPages.length; // 下一頁的 offset
    },
    initialPageParam: 0,
  });

  // 扁平化數據
  const flatData = data?.pages.flatMap(page => page) || [];

  return {
    data: flatData as any[], // DrugSearchResult[]
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
    refetch,
    filters,
    setFilters,
  };
}