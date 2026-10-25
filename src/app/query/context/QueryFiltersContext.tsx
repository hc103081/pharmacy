'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { DrugSearchFilters } from '@/types/query';

/**
 * 查詢篩選共用狀態
 * SearchPanel（側欄 / 手機抽屜）與 DrugSearchTab（主搜尋區）共用同一份篩選條件，
 * 確保「套用篩選」能真正觸發跨清單查詢。
 */

const DEFAULT_FILTERS: DrugSearchFilters = {
  searchText: '',
  barcode: undefined,
  productCode: undefined,
  storageLocations: [],
  categories: [],
  dateFrom: undefined,
  dateTo: undefined,
  manifestStatus: ['active', 'archived'],
  countedStatus: undefined,
  hasDiscrepancy: null,
};

interface QueryFiltersContextValue {
  /** 目前已套用的篩選條件（實際驅動查詢） */
  filters: DrugSearchFilters;
  /** 部分更新篩選條件 */
  updateFilters: (patch: Partial<DrugSearchFilters>) => void;
  /** 重置為預設條件 */
  resetFilters: () => void;
}

const QueryFiltersContext = createContext<QueryFiltersContextValue | null>(null);

export function QueryFiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<DrugSearchFilters>(DEFAULT_FILTERS);

  const updateFilters = useCallback((patch: Partial<DrugSearchFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const value = useMemo(
    () => ({ filters, updateFilters, resetFilters }),
    [filters, updateFilters, resetFilters]
  );

  return (
    <QueryFiltersContext.Provider value={value}>
      {children}
    </QueryFiltersContext.Provider>
  );
}

export function useQueryFilters(): QueryFiltersContextValue {
  const ctx = useContext(QueryFiltersContext);
  if (!ctx) {
    throw new Error('useQueryFilters 必須在 QueryFiltersProvider 內使用');
  }
  return ctx;
}
