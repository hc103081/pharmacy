import { http, HttpResponse } from 'msw';
import type { DrugSearchFilters } from '@/types/query';

// 模擬資料
const mockDrugData = [
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
  {
    barcode: '5555555555555',
    product_code: 'VIT003',
    name: '維他命C泡騰錠 500mg',
    storage_location: 'C區',
    category: '維他命',
    manifest_count: 2,
    total_expected: 30,
    total_actual: 32,
    total_discrepancy: 2,
    avg_discrepancy: 1,
    error_count: 0,
    last_counted_at: '2024-01-13T11:00:00Z',
    history: [],
  },
];

// 篩選邏輯
function filterDrugs(filters: DrugSearchFilters) {
  return mockDrugData.filter(drug => {
    // 搜尋文字
    if (filters.searchText) {
      const search = filters.searchText.toLowerCase();
      const matches = 
        drug.name.toLowerCase().includes(search) ||
        drug.barcode.includes(search) ||
        drug.product_code?.toLowerCase().includes(search);
      if (!matches) return false;
    }

    // 條碼精確搜尋
    if (filters.barcode && drug.barcode !== filters.barcode) return false;

    // 商品代碼精確搜尋
    if (filters.productCode && drug.product_code !== filters.productCode) return false;

    // 儲位篩選
    if (filters.storageLocations && filters.storageLocations.length > 0 && !filters.storageLocations.includes(drug.storage_location)) return false;

    // 類別篩選
    if (filters.categories && filters.categories.length > 0 && drug.category && !filters.categories.includes(drug.category)) return false;

    // 差異篩選
    if (filters.hasDiscrepancy === true && drug.total_discrepancy === 0) return false;
    if (filters.hasDiscrepancy === false && drug.total_discrepancy !== 0) return false;

    return true;
  });
}

export const handlers = [
  // Mock Supabase RPC: search_drugs_cross_manifest
  http.post('*/rest/v1/rpc/search_drugs_cross_manifest', async ({ request }) => {
    const body = await request.json() as DrugSearchFilters;
    
    const filtered = filterDrugs(body);
    
    // 模擬分頁：每頁 2 筆
    const page = (body as any).p_page || 0;
    const pageSize = 2;
    const start = page * pageSize;
    const end = start + pageSize;
    const pageData = filtered.slice(start, end);
    
    return HttpResponse.json({
      data: pageData,
      error: null,
    });
  }),

  // Mock Supabase Auth
  http.post('*/auth/v1/token*', () => {
    return HttpResponse.json({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      user: { id: 'test-user', email: 'test@example.com' },
    });
  }),

  http.get('*/auth/v1/user', () => {
    return HttpResponse.json({
      id: 'test-user',
      email: 'test@example.com',
      user_metadata: { full_name: 'Test User' },
    });
  }),

  // Mock Supabase Storage
  http.post('*/storage/v1/object/*', () => {
    return HttpResponse.json({ 
      data: { path: 'test/path.jpg' }, 
      error: null 
    });
  }),

  // Mock NHI lookup
  http.post('*/rest/v1/rpc/nhi_lookup', async () => {
    return HttpResponse.json({
      data: [
        { code: 'ASP001', name: '阿司匹林腸溶錠 100mg', price: 1.5 },
      ],
      error: null,
    });
  }),
];

// 開發環境用的 handlers (更完整的模擬)
export const devHandlers = [
  ...handlers,
  // 可以在開發時添加更多 handlers
];