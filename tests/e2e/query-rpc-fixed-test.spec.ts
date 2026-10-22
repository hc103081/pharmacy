import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

// 創建 Admin Client (繞過 RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

test.describe('search_drugs_cross_manifest RPC 修復驗證', () => {
  
  test.describe('核心功能驗證 (修復後)', () => {
    
    test('RPC 應返回 12+ 筆測試記錄', async () => {
      const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
        p_search_text: null,
        p_barcode: null,
        p_product_code: null,
        p_storage_locations: null,
        p_categories: null,
        p_date_from: null,
        p_date_to: null,
        p_manifest_status: ['active', 'archived'],
        p_counted_status: null,
        p_has_discrepancy: null,
        p_limit: 50,
        p_offset: 0
      });
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      
      console.log(`✅ 修復後 RPC 返回 ${data.length} 筆結果`);
      
      // 修復後：應返回至少 12 筆測試記錄 (種子數據 10 + 2)
      expect(data.length).toBeGreaterThanOrEqual(12);
    });
    
    test('條碼搜尋阿司匹林應在 2+ 個清單中找到 (跨清單查詢核心功能)', async () => {
      const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
        p_search_text: null,
        p_barcode: '4710000000001',
        p_product_code: null,
        p_storage_locations: null,
        p_categories: null,
        p_date_from: null,
        p_date_to: null,
        p_manifest_status: ['active', 'archived'],
        p_counted_status: null,
        p_has_discrepancy: null,
        p_limit: 50,
        p_offset: 0
      });
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      
      console.log(`✅ 阿司匹林跨清單搜尋返回 ${data.length} 筆結果`);
      
      // 阿司匹林應該在 2 個清單中都有 (active + archived)
      expect(data.length).toBeGreaterThanOrEqual(2);
      
      // 驗證每筆都是阿司匹林
      data.forEach(item => {
        expect(item.barcode).toBe('4710000000001');
        expect(item.name).toBe('阿司匹林腸溶錠 100mg');
      });
    });
    
    test('關鍵字搜尋「阿司匹林」應正常運作', async () => {
      const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
        p_search_text: '阿司匹林',
        p_barcode: null,
        p_product_code: null,
        p_storage_locations: null,
        p_categories: null,
        p_date_from: null,
        p_date_to: null,
        p_manifest_status: ['active', 'archived'],
        p_counted_status: null,
        p_has_discrepancy: null,
        p_limit: 50,
        p_offset: 0
      });
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      
      const hasAspirin = data.some((item: any) => 
        item.name.includes('阿司匹林') || item.barcode === '4710000000001'
      );
      expect(hasAspirin).toBe(true);
      
      console.log(`✅ 關鍵字搜尋「阿司匹林」返回 ${data.length} 筆結果`);
    });
    
    test('條碼搜尋布洛芬應在 2 個清單中找到', async () => {
      const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
        p_search_text: null,
        p_barcode: '4710000000002',
        p_product_code: null,
        p_storage_locations: null,
        p_categories: null,
        p_date_from: null,
        p_date_to: null,
        p_manifest_status: ['active', 'archived'],
        p_counted_status: null,
        p_has_discrepancy: null,
        p_limit: 50,
        p_offset: 0
      });
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2); // 在兩個清單中都有
      
      data.forEach(item => {
        expect(item.barcode).toBe('4710000000002');
        expect(item.name).toBe('布洛芬錠 200mg');
      });
      
      console.log('✅ 條碼搜尋布洛芬正確返回 2 筆結果 (跨兩個清單)');
    });
    
    test('儲位 A1 篩選應正常運作', async () => {
      const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
        p_search_text: null,
        p_barcode: null,
        p_product_code: null,
        p_storage_locations: ['A1'],
        p_categories: null,
        p_date_from: null,
        p_date_to: null,
        p_manifest_status: ['active', 'archived'],
        p_counted_status: null,
        p_has_discrepancy: null,
        p_limit: 50,
        p_offset: 0
      });
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      
      const allA1 = data.every((item: any) => item.storage_location === 'A1');
      expect(allA1).toBe(true);
      
      console.log(`✅ 儲位 A1 篩選返回 ${data.length} 筆結果`);
    });
    
    test('類別西藥篩選應正常運作', async () => {
      const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
        p_search_text: null,
        p_barcode: null,
        p_product_code: null,
        p_storage_locations: null,
        p_categories: ['西藥'],
        p_date_from: null,
        p_date_to: null,
        p_manifest_status: ['active', 'archived'],
        p_counted_status: null,
        p_has_discrepancy: null,
        p_limit: 50,
        p_offset: 0
      });
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      
      const allWestern = data.every((item: any) => item.category === '西藥');
      expect(allWestern).toBe(true);
      
      console.log(`✅ 類別西藥篩選返回 ${data.length} 筆結果`);
    });
    
    test('只查詢 archived 清單應返回 2 筆 (種子數據)', async () => {
      const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
        p_search_text: null,
        p_barcode: null,
        p_product_code: null,
        p_storage_locations: null,
        p_categories: null,
        p_date_from: null,
        p_date_to: null,
        p_manifest_status: ['archived'],
        p_counted_status: null,
        p_has_discrepancy: null,
        p_limit: 50,
        p_offset: 0
      });
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      
      // Archived 清單有 2 筆 (種子數據)
      expect(data.length).toBe(2);
      
      console.log(`✅ 只查詢 archived 清單返回 ${data.length} 筆結果`);
    });
    
    test('已清點狀態篩選應正常運作', async () => {
      const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
        p_search_text: null,
        p_barcode: null,
        p_product_code: null,
        p_storage_locations: null,
        p_categories: null,
        p_date_from: null,
        p_date_to: null,
        p_manifest_status: ['active', 'archived'],
        p_counted_status: 'completed',
        p_has_discrepancy: null,
        p_limit: 50,
        p_offset: 0
      });
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      
      const allCompleted = data.every((item: any) => item.counted_status === 'completed');
      expect(allCompleted).toBe(true);
      
      console.log(`✅ 已清點狀態篩選返回 ${data.length} 筆結果`);
    });
    
    test('有差異項目篩選應正常運作', async () => {
      const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
        p_search_text: null,
        p_barcode: null,
        p_product_code: null,
        p_storage_locations: null,
        p_categories: null,
        p_date_from: null,
        p_date_to: null,
        p_manifest_status: ['active', 'archived'],
        p_counted_status: null,
        p_has_discrepancy: 1,
        p_limit: 50,
        p_offset: 0
      });
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      
      const allDiscrepancy = data.every((item: any) => 
        (item.actual_quantity || 0) !== (item.expected_quantity || 0)
      );
      expect(allDiscrepancy).toBe(true);
      
      console.log(`✅ 有差異項目篩選返回 ${data.length} 筆結果`);
    });
    
    test('分頁功能應正常運作 (使用 id 作為次要排序確保穩定)', async () => {
      const { data: page1, error: error1 } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
        p_search_text: null,
        p_barcode: null,
        p_product_code: null,
        p_storage_locations: null,
        p_categories: null,
        p_date_from: null,
        p_date_to: null,
        p_manifest_status: ['active', 'archived'],
        p_counted_status: null,
        p_has_discrepancy: null,
        p_limit: 5,
        p_offset: 0
      });
      
      expect(error1).toBeNull();
      expect(page1).toBeDefined();
      expect(page1.length).toBe(5);
      
      const { data: page2, error: error2 } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
        p_search_text: null,
        p_barcode: null,
        p_product_code: null,
        p_storage_locations: null,
        p_categories: null,
        p_date_from: null,
        p_date_to: null,
        p_manifest_status: ['active', 'archived'],
        p_counted_status: null,
        p_has_discrepancy: null,
        p_limit: 5,
        p_offset: 5
      });
      
      expect(error2).toBeNull();
      expect(page2).toBeDefined();
      expect(page2.length).toBe(5);
      
      // 確保不重複 (使用 id 比對)
      const page1Ids = page1.map((item: any) => item.id);
      const page2Ids = page2.map((item: any) => item.id);
      const intersection = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(intersection.length).toBe(0);
      
      console.log('✅ 分頁功能正常運作');
    });
    
    test('清單狀態篩選：active 應包含種子數據的 20 筆 (2 個 active 清單 × 10)', async () => {
      // 查詢所有 active 清單的項目數 (不限制 limit)
      const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
        p_search_text: null,
        p_barcode: null,
        p_product_code: null,
        p_storage_locations: null,
        p_categories: null,
        p_date_from: null,
        p_date_to: null,
        p_manifest_status: ['active'],
        p_counted_status: null,
        p_has_discrepancy: null,
        p_limit: 100,
        p_offset: 0
      });
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      
      // 種子數據有 2 個 active 清單，每個 10 筆 = 20 筆
      // 資料庫中可能有更多 active 數據，至少應有 20 筆
      expect(data.length).toBeGreaterThanOrEqual(20);
      
      console.log(`✅ 查詢 active 清單返回 ${data.length} 筆結果 (至少 20 筆種子數據)`);
    });
  });
  
  test.describe('修復內容說明', () => {
    test('說明：RPC 修復內容 - JOIN manifests 表並使用 m.status', async () => {
      // 此測試只記錄修復內容，不執行實際斷言
      console.log('📋 RPC 修復內容:');
      console.log('  Bug: WHERE 條件 `status = ANY(p_manifest_status)` 引用 drug_items 不存在的欄位');
      console.log('  Fix: JOIN manifests m ON di.manifest_id = m.id');
      console.log('       使用 m.status = ANY(p_manifest_status) 替代');
      console.log('  授權: GRANT EXECUTE ON FUNCTION TO authenticated');
      
      // 驗證函數存在且可執行
      const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
        p_search_text: null,
        p_barcode: null,
        p_product_code: null,
        p_storage_locations: null,
        p_categories: null,
        p_date_from: null,
        p_date_to: null,
        p_manifest_status: ['active'],
        p_counted_status: null,
        p_has_discrepancy: null,
        p_limit: 1,
        p_offset: 0
      });
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(0);
      
      console.log('✅ RPC 函數執行正常，修復生效');
    });
  });
});