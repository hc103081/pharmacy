# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dual-barcode.spec.ts >> 雙條碼匯入與匹配 >> 搜尋國際碼亦可匹配到相同藥品
- Location: tests\e2e\dual-barcode.spec.ts:68:7

# Error details

```
Error: expect(received).toBeTruthy()

Received: undefined
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('雙條碼匯入與匹配', () => {
  4  |   test('API 匯入支援 barcode 與 product_code 同時存在', async ({ page }) => {
  5  |     // 1️⃣ 直接使用 API 建立測試清單，包含 barcode 與 product_code 不同的藥品
  6  |     const manifestName = '測試雙條碼_' + Date.now();
  7  |     const mockDrugs = [{
  8  |       barcode: '4710123456789',        // 國際碼
  9  |       product_code: '4712343455219', // 商品碼（不同）
  10 |       name: '測試藥品',
  11 |       expected_quantity: 5,
  12 |       bonus_quantity: 0,
  13 |       storage_location: 'F3',
  14 |       category: '4',
  15 |     }];
  16 | 
  17 |     // 2️⃣ 呼叫後端匯入 API（使用 page.request），取得 manifestId
  18 |     const importRes = await page.request.post('/api/test-import', {
  19 |       data: { manifestName, drugs: mockDrugs },
  20 |     });
  21 |     const responseText = await importRes.text();
  22 |     console.log('API Response:', importRes.status(), responseText);
  23 |     const importData = JSON.parse(responseText);
  24 | 
  25 |     expect(importData.success).toBeTruthy();
  26 |     expect(importData.manifestId).toBeTruthy();
  27 |     expect(importData.totalItems).toBe(1);
  28 |     const manifestId = importData.manifestId;
  29 | 
  30 |     // 3️⃣ 驗證資料庫中確實存了兩個條碼
  31 |     // 使用另一個 API 查詢剛建立的清單項目
  32 |     const checkRes = await page.request.post('/api/test-lookup-simulated', {
  33 |       data: { manifestId, barcode: '4710123456789' },
  34 |     });
  35 |     const checkData = await checkRes.json();
  36 |     expect(checkRes.ok()).toBeTruthy();
  37 |   });
  38 | 
  39 |   test('搜尋商品碼可匹配到相同藥品', async ({ page }) => {
  40 |     const manifestName = '測試雙條碼搜尋_' + Date.now();
  41 |     const mockDrugs = [{
  42 |       barcode: '4710123456789',
  43 |       product_code: '4712343455219',
  44 |       name: '測試藥品-搜尋',
  45 |       expected_quantity: 3,
  46 |       bonus_quantity: 0,
  47 |       storage_location: 'A1',
  48 |       category: '1',
  49 |     }];
  50 | 
  51 |     const importRes = await page.request.post('/api/test-import', {
  52 |       data: { manifestName, drugs: mockDrugs },
  53 |     });
  54 |     const importData = await importRes.json();
  55 |     expect(importData.success).toBeTruthy();
  56 |     const manifestId = importData.manifestId;
  57 | 
  58 |     // 使用商品碼搜尋
  59 |     const lookupRes = await page.request.post('/api/test-lookup-simulated', {
  60 |       data: { manifestId, barcode: '4712343455219' },
  61 |     });
  62 |     const lookupData = await lookupRes.json();
  63 |     expect(lookupRes.ok()).toBeTruthy();
  64 |     expect(lookupData.found).toBeTruthy();
  65 |     expect(lookupData.item.name).toBe('測試藥品-搜尋');
  66 |   });
  67 | 
  68 |   test('搜尋國際碼亦可匹配到相同藥品', async ({ page }) => {
  69 |     const manifestName = '測試雙條碼搜尋2_' + Date.now();
  70 |     const mockDrugs = [{
  71 |       barcode: '4710123456789',
  72 |       product_code: '4712343455219',
  73 |       name: '測試藥品-搜尋2',
  74 |       expected_quantity: 3,
  75 |       bonus_quantity: 0,
  76 |       storage_location: 'A1',
  77 |       category: '1',
  78 |     }];
  79 | 
  80 |     const importRes = await page.request.post('/api/test-import', {
  81 |       data: { manifestName, drugs: mockDrugs },
  82 |     });
  83 |     const importData = await importRes.json();
> 84 |     expect(importData.success).toBeTruthy();
     |                                ^ Error: expect(received).toBeTruthy()
  85 |     const manifestId = importData.manifestId;
  86 | 
  87 |     // 使用國際碼搜尋
  88 |     const lookupRes = await page.request.post('/api/test-lookup-simulated', {
  89 |       data: { manifestId, barcode: '4710123456789' },
  90 |     });
  91 |     const lookupData = await lookupRes.json();
  92 |     expect(lookupRes.ok()).toBeTruthy();
  93 |     expect(lookupData.found).toBeTruthy();
  94 |     expect(lookupData.item.name).toBe('測試藥品-搜尋2');
  95 |   });
  96 | });
```