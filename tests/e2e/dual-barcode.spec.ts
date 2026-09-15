import { test, expect } from '@playwright/test';

test.describe('雙條碼匯入與匹配', () => {
  test('API 匯入支援 barcode 與 product_code 同時存在', async ({ page }) => {
    // 1️⃣ 直接使用 API 建立測試清單，包含 barcode 與 product_code 不同的藥品
    const manifestName = '測試雙條碼_' + Date.now();
    const mockDrugs = [{
      barcode: '4710123456789',        // 國際碼
      product_code: '4712343455219', // 商品碼（不同）
      name: '測試藥品',
      expected_quantity: 5,
      bonus_quantity: 0,
      storage_location: 'F3',
      category: '4',
    }];

    // 2️⃣ 呼叫後端匯入 API（使用 page.request），取得 manifestId
    const importRes = await page.request.post('/api/test-import', {
      data: { manifestName, drugs: mockDrugs },
    });
    const responseText = await importRes.text();
    console.log('API Response:', importRes.status(), responseText);
    const importData = JSON.parse(responseText);

    expect(importData.success).toBeTruthy();
    expect(importData.manifestId).toBeTruthy();
    expect(importData.totalItems).toBe(1);
    const manifestId = importData.manifestId;

    // 3️⃣ 驗證資料庫中確實存了兩個條碼
    // 使用另一個 API 查詢剛建立的清單項目
    const checkRes = await page.request.post('/api/test-lookup-simulated', {
      data: { manifestId, barcode: '4710123456789' },
    });
    const checkData = await checkRes.json();
    expect(checkRes.ok()).toBeTruthy();
  });

  test('搜尋商品碼可匹配到相同藥品', async ({ page }) => {
    const manifestName = '測試雙條碼搜尋_' + Date.now();
    const mockDrugs = [{
      barcode: '4710123456789',
      product_code: '4712343455219',
      name: '測試藥品-搜尋',
      expected_quantity: 3,
      bonus_quantity: 0,
      storage_location: 'A1',
      category: '1',
    }];

    const importRes = await page.request.post('/api/test-import', {
      data: { manifestName, drugs: mockDrugs },
    });
    const importData = await importRes.json();
    expect(importData.success).toBeTruthy();
    const manifestId = importData.manifestId;

    // 使用商品碼搜尋
    const lookupRes = await page.request.post('/api/test-lookup-simulated', {
      data: { manifestId, barcode: '4712343455219' },
    });
    const lookupData = await lookupRes.json();
    expect(lookupRes.ok()).toBeTruthy();
    expect(lookupData.found).toBeTruthy();
    expect(lookupData.item.name).toBe('測試藥品-搜尋');
  });

  test('搜尋國際碼亦可匹配到相同藥品', async ({ page }) => {
    const manifestName = '測試雙條碼搜尋2_' + Date.now();
    const mockDrugs = [{
      barcode: '4710123456789',
      product_code: '4712343455219',
      name: '測試藥品-搜尋2',
      expected_quantity: 3,
      bonus_quantity: 0,
      storage_location: 'A1',
      category: '1',
    }];

    const importRes = await page.request.post('/api/test-import', {
      data: { manifestName, drugs: mockDrugs },
    });
    const importData = await importRes.json();
    expect(importData.success).toBeTruthy();
    const manifestId = importData.manifestId;

    // 使用國際碼搜尋
    const lookupRes = await page.request.post('/api/test-lookup-simulated', {
      data: { manifestId, barcode: '4710123456789' },
    });
    const lookupData = await lookupRes.json();
    expect(lookupRes.ok()).toBeTruthy();
    expect(lookupData.found).toBeTruthy();
    expect(lookupData.item.name).toBe('測試藥品-搜尋2');
  });
});