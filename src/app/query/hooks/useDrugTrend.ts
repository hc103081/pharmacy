'use client';

import { useQuery } from '@tanstack/react-query';
import { getDrugTrendData } from '@/app/query/lib/supabaseRpc';
import { queryKeys } from '@/app/query/lib/queryKeys';
import type { DrugTrendPoint } from '@/types/query';

export const useDrugTrend = (barcode: string, productCode?: string) => {
  return useQuery<DrugTrendPoint[], Error>({
    queryKey: queryKeys.drugTrend(barcode, productCode),
    queryFn: () => getDrugTrendData(barcode, productCode),
    // Enable stale-while-revalidate for better UX
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    // Don't fetch if no barcode
    enabled: !!barcode,
  });
};

export const useDrugTrendSuspended = (barcode: string, productCode?: string) => {
  const query = useDrugTrend(barcode, productCode);
  
  // Suspense-friendly version
  if (query.isLoading && !query.data) {
    throw { status: 'pending', component: null };
  }
  
  if (query.error) {
    throw query.error;
  }
  
  return query;
};