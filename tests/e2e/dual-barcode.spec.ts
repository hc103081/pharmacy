import { test, expect } from '@playwright/test';

test('雙條碼匯入與匹配', async ({ page }) => {
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

  // 2️⃣ 呼叫後端匯入 API（使用 fetch），取得 manifestId
  const importRes = await page.evaluate(async ({manifestName, mockDrugs}) => {
    const resp = await fetch('/api/test-import', { // 假設已有測試用的 API
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifestName, drugs: mockDrugs })
    });
    const data = await resp.json();
    return data;
  }, { manifestName, mockDrugs });

  expect(importRes.success).toBeTruthy();
  const manifestId = importRes.manifestId;

  // 3️⃣ 前往掃描頁面
  await page.goto(`http://localhost:3001/scan?manifestId=${manifestId}`);

  // 4️⃣ 檢查卡片同時顯示兩條碼（barcode 與 product_code）
  const barcodeEl = page.locator('text=4710123456789');
  const productCodeEl = page.locator('text=4712343455219');
  await expect(barcodeEl).toBeVisible();
  await expect(productCodeEl).toBeVisible();

  // 5️⃣ 使用搜尋欄掃到商品碼，應高亮卡片
  const searchInput = page.locator('input[placeholder*="掃描或輸入條碼"]');
  await searchInput.fill('4712343455219');
  await expect(page.locator('.border-\[\#00f2fe\]').first()).toBeVisible({ timeout: 5000 });

  // 6️⃣ 清除搜尋，改為掃國際碼，亦應高亮
  await searchInput.fill('4710123456789');
  await expect(page.locator('.border-\[\#00f2fe\]').first()).toBeVisible({ timeout: 5000 });
});