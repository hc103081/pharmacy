import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDrugSearchSuspended } from '@/app/query/hooks/useDrugSearch';
import { DrugSearchFilters } from '@/types/query';
import React from 'react';
import { vi, beforeAll, afterEach, afterAll } from 'vitest';

// Use vi.hoisted to define mock data before vi.mock is hoisted
const { mockRpcResponse, mockSearchDrugsCrossManifest } = vi.hoisted(() => {
  const response = [
    {
      barcode: '1234567890123',
      product_code: 'ASP001',
      name: '阿司匹林腸溶錠 100mg',
      storage_location: 'A區',
      category: '止痛藥',
      manifest_count: 5,
      total_expected: 100,
      total_actual: 98,
      total_discrepancy: -2,
      avg_discrepancy: -0.4,
      error_count: 1,
      last_counted_at: '2024-01-15T10:30:00Z',
      history: [
        {
          manifest_id: 'manifest-1',
          manifest_name: '1月份盤點單',
          page_number: 1,
          expected: 20,
          actual: 20,
          status: 'completed' as const,
          counted_at: '2024-01-10T09:00:00Z',
        },
        {
          manifest_id: 'manifest-2',
          manifest_name: '1月份盤點單',
          page_number: 2,
          expected: 20,
          actual: 18,
          status: 'error' as const,
          counted_at: '2024-01-11T09:00:00Z',
        },
      ],
    },
    {
      barcode: '9876543210987',
      product_code: 'IBU002',
      name: '布洛芬緩釋膠囊 200mg',
      storage_location: 'B區',
      category: '止痛藥',
      manifest_count: 3,
      total_expected: 50,
      total_actual: 50,
      total_discrepancy: 0,
      avg_discrepancy: 0,
      error_count: 0,
      last_counted_at: '2024-01-14T14:20:00Z',
      history: [],
    },
  ];

  const mockFn = vi.fn().mockResolvedValue(response);

  return { mockRpcResponse: response, mockSearchDrugsCrossManifest: mockFn };
});

// Mock the supabaseRpc module using hoisted mock
vi.mock('@/app/query/lib/supabaseRpc', () => ({
  searchDrugsCrossManifest: mockSearchDrugsCrossManifest,
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useDrugSearchSuspended', () => {
  const defaultFilters: DrugSearchFilters = {
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

  beforeEach(() => {
    mockSearchDrugsCrossManifest.mockClear();
    mockSearchDrugsCrossManifest.mockResolvedValue(mockRpcResponse);
  });

  it('應使用預設篩選條件查詢並返回資料', async () => {
    const { result } = renderHook(() => useDrugSearchSuspended(defaultFilters), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toBeDefined();
    // useInfiniteQuery 返回 { pages: T[][] } 結構
    const flatData = result.current.data?.pages?.flat() ?? [];
    expect(flatData).toHaveLength(2);
    expect(flatData[0].name).toBe('阿司匹林腸溶錠 100mg');
    expect(flatData[1].name).toBe('布洛芬緩釋膠囊 200mg');
  });

  it('篩選條件變化應觸發重新查詢', async () => {
    const { result, rerender } = renderHook(
      ({ filters }) => useDrugSearchSuspended(filters),
      { wrapper: createWrapper(), initialProps: { filters: defaultFilters } }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    const flatData = result.current.data?.pages?.flat() ?? [];
    expect(flatData).toHaveLength(2);

    // 更新篩選條件
    const newFilters: DrugSearchFilters = {
      ...defaultFilters,
      storageLocations: ['A區'],
    };

    rerender({ filters: newFilters });

    await waitFor(() => expect(result.current.data).toBeDefined());
    // 驗證 RPC 被呼叫時帶入正確參數 (hook 的格式)
    expect(mockSearchDrugsCrossManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        storageLocations: ['A區'],
      })
    );
  });

  it('關鍵字搜尋應傳遞 searchText 參數', async () => {
    const { result, rerender } = renderHook(
      ({ filters }) => useDrugSearchSuspended(filters),
      { wrapper: createWrapper(), initialProps: { filters: defaultFilters } }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());

    const searchFilters: DrugSearchFilters = {
      ...defaultFilters,
      searchText: '阿司匹林',
    };

    rerender({ filters: searchFilters });

    await waitFor(() => expect(result.current.data).toBeDefined());
    
    expect(mockSearchDrugsCrossManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        searchText: '阿司匹林',
      })
    );
  });

  it('條碼搜尋應傳遞 barcode 參數', async () => {
    const { result, rerender } = renderHook(
      ({ filters }) => useDrugSearchSuspended(filters),
      { wrapper: createWrapper(), initialProps: { filters: defaultFilters } }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());

    const barcodeFilters: DrugSearchFilters = {
      ...defaultFilters,
      barcode: '1234567890123',
    };

    rerender({ filters: barcodeFilters });

    await waitFor(() => expect(result.current.data).toBeDefined());
    
    expect(mockSearchDrugsCrossManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        barcode: '1234567890123',
      })
    );
  });

  it('日期範圍應正確傳遞 dateFrom 和 dateTo', async () => {
    const { result, rerender } = renderHook(
      ({ filters }) => useDrugSearchSuspended(filters),
      { wrapper: createWrapper(), initialProps: { filters: defaultFilters } }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());

    const dateFilters: DrugSearchFilters = {
      ...defaultFilters,
      dateFrom: '2024-01-01',
      dateTo: '2024-01-31',
    };

    rerender({ filters: dateFilters });

    await waitFor(() => expect(result.current.data).toBeDefined());
    
    expect(mockSearchDrugsCrossManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
      })
    );
  });

  it('hasDiscrepancy 為 true 時應只查詢有差異的藥品', async () => {
    const { result, rerender } = renderHook(
      ({ filters }) => useDrugSearchSuspended(filters),
      { wrapper: createWrapper(), initialProps: { filters: defaultFilters } }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());

    const discrepancyFilters: DrugSearchFilters = {
      ...defaultFilters,
      hasDiscrepancy: true,
    };

    rerender({ filters: discrepancyFilters });

    await waitFor(() => expect(result.current.data).toBeDefined());
    
    expect(mockSearchDrugsCrossManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        hasDiscrepancy: true,
      })
    );
  });

  it('countedStatus 應正確傳遞清點狀態篩選', async () => {
    const { result, rerender } = renderHook(
      ({ filters }) => useDrugSearchSuspended(filters),
      { wrapper: createWrapper(), initialProps: { filters: defaultFilters } }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());

    const statusFilters: DrugSearchFilters = {
      ...defaultFilters,
      countedStatus: 'error',
    };

    rerender({ filters: statusFilters });

    await waitFor(() => expect(result.current.data).toBeDefined());
    
    expect(mockSearchDrugsCrossManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        countedStatus: 'error',
      })
    );
  });

  it('查詢錯誤時應正確處理 error 狀態', async () => {
    mockSearchDrugsCrossManifest.mockImplementationOnce(() => {
      throw new Error('Database connection failed');
    });

    const { result } = renderHook(() => useDrugSearchSuspended(defaultFilters), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it('查詢期間 isLoading 應為 true', async () => {
    let resolveFn: (value: typeof mockRpcResponse) => void;
    const promise = new Promise<typeof mockRpcResponse>((resolve) => {
      resolveFn = resolve;
    });

    mockSearchDrugsCrossManifest.mockReturnValueOnce(promise);

    const { result } = renderHook(() => useDrugSearchSuspended(defaultFilters), {
      wrapper: createWrapper(),
    });

    // 查詢開始時 isLoading 應為 true (可能需要等待 microtask)
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    resolveFn!(mockRpcResponse);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});