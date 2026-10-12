'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { searchDrugsCrossManifest } from '@/app/query/lib/supabaseRpc';
import { queryKeys } from '@/app/query/lib/queryKeys';
import type { DrugSearchFilters, DrugSearchResult } from '@/types/query';

export const useDrugSearch = (filters: DrugSearchFilters) => {
  return useInfiniteQuery<DrugSearchResult[], Error>({
    queryKey: queryKeys.drugSearch(filters),
    queryFn: async ({ pageParam = 0 }) => {
      const results = await searchDrugsCrossManifest({
        ...filters,
        limit: 50,
        offset: pageParam * 50
      });
      return results;
    },
    getNextPageParam: (lastPage, allPages) => {
      // If we got less than 50 results, we're at the end
      return lastPage.length === 50 ? allPages.length : undefined;
    },
    // Enable stale-while-revalidate for better UX
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

export const useDrugSearchSuspended = (filters: DrugSearchFilters) => {
  const query = useDrugSearch(filters);
  
  // Suspense-friendly version
  if (query.isLoading && !query.data) {
    throw { status: 'pending', component: null };
  }
  
  if (query.error) {
    throw query.error;
  }
  
  return query;
};