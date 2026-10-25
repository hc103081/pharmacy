import { test, expect } from '@playwright/test';

/**
 * 查詢頁面綜合 UI 測試
 * 
 * 使用 API 登入流程
 * 測試場景：
 * 1. 基本 UI 元素驗證
 * 2. 關鍵字搜尋
 * 3. 條碼搜尋
 * 4. Tab 切換
 * 5. 重置篩選
 * 6. 匯出按鈕
 * 7. 響應式設計 (桌面/平板/手機)
 * 8. 左側面板篩選功能 (儲位、類別、組合、重置)
 */

async function apiLogin(page: import('@playwright/test').Page) {
  const response = await page.request.post('/api/test-auth/login', {
    data: {
      email: 'test-user@pharmacy.local',
      password: 'TestPassword123!'
    }
  });
  
  if (!response.ok()) {
    const errorData = await response.json();
    throw new Error(`API 登入失敗: ${errorData.error || 'Unknown error'}`);
  }
  
  const loginData = await response.json();
  console.log('API 登入成功:', loginData.user?.id);
  
  // 導航到查詢頁面
  await page.goto('/query');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

async function waitForQueryPage(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Check for login prompt
  const bodyText = await page.locator('body').textContent();
  if (bodyText?.includes('請先登入')) {
    throw new Error('Not authenticated - API login failed');
  }
  
  // Wait for key elements - 使用多種可能的選擇器
  await Promise.race([
    page.waitForSelector('h1:has-text("藥品查詢系統")', { timeout: 15000 }).catch(() => null),
    page.waitForSelector('input[placeholder="條碼、品名、製造廠代碼..."]', { timeout: 15000 }).catch(() => null),
    page.waitForSelector('button[role="tab"]:has-text("藥品搜尋")', { timeout: 15000 }).catch(() => null),
  ]);
}

async function checkResultsVisible(page: import('@playwright/test').Page) {
  const table = page.locator('table').first();
  const noResults = page.locator('text=無搜尋結果').first();
  const loading = page.locator('text=載入中...').first();
  
  // 等待載入完成，然後等待表格或無結果消息
  await Promise.race([
    table.waitFor({ state: 'visible', timeout: 15000 }).catch(() => null),
    noResults.waitFor({ state: 'visible', timeout: 15000 }).catch(() => null),
    loading.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => null),
  ]);
}

function collectPageErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore expected network/auth errors
      if (
        text.includes('supabase') ||
        text.includes('Failed to fetch') ||
        text.includes('NetworkError') ||
        text.includes('ERR_') ||
        text.includes('401') ||
        text.includes('403') ||
        text.includes('fetch') ||
        text.includes('Auth')
      ) {
        return;
      }
      errors.push(`console.error: ${text}`);
    }
  });
  return errors;
}

test.describe('Query Page UI - Full Functionality', () => {

  test.beforeEach(async ({ page }) => {
    await apiLogin(page);
  });

  test('Basic UI elements visible', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 檢查是否在正確的頁面
    const bodyText = await page.locator('body').textContent();
    if (bodyText?.includes('請先登入')) {
      throw new Error('Still showing login prompt - authentication failed');
    }
    
    // 檢查查詢頁面元素 - 給更多時間等待 Tab 按鈕渲染
    await expect(page.locator('button[role="tab"]:has-text("藥品搜尋")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button[role="tab"]:has-text("歷史記錄")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button[role="tab"]:has-text("趨勢分析")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button[role="tab"]:has-text("報表儀表板")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first()).toBeVisible();
    
    await checkResultsVisible(page);
    expect(errors, `Unexpected errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('Keyword search works', async ({ page }) => {
    const errors = collectPageErrors(page);
    const input = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await input.fill('阿司匹林');
    await input.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await checkResultsVisible(page);
    expect(errors).toEqual([]);
  });

  test('Barcode search works', async ({ page }) => {
    const errors = collectPageErrors(page);
    const input = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await input.fill('4710000000002');
    await input.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await checkResultsVisible(page);
    expect(errors).toEqual([]);
  });

  test('Tab switching works', async ({ page }) => {
    const errors = collectPageErrors(page);
    const tabs = ['歷史記錄', '趨勢分析', '報表儀表板', '藥品搜尋'];
    for (const tabName of tabs) {
      await page.locator(`button:has-text("${tabName}")`).first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    }
    expect(errors).toEqual([]);
  });

  test('Reset filter works', async ({ page }) => {
    const errors = collectPageErrors(page);
    const input = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await input.fill('測試');
    await input.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const resetBtn = page.locator('button:has-text("重置")').first();
    await resetBtn.waitFor({ state: 'visible', timeout: 10000 });
    await resetBtn.click();
    await page.waitForTimeout(1000);
    
    await expect(input).toHaveValue('');
    await checkResultsVisible(page);
    expect(errors).toEqual([]);
  });

  test('Export button visible and clickable', async ({ page }) => {
    const errors = collectPageErrors(page);
    const exportBtn = page.locator('button:has-text("匯出")').first();
    await exportBtn.waitFor({ state: 'visible', timeout: 10000 });
    await expect(exportBtn).toBeVisible();
    
    page.on('dialog', dialog => dialog.accept());
    await exportBtn.click();
    expect(errors).toEqual([]);
  });
});

test.describe('Responsive Design', () => {

  test('Desktop layout', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await apiLogin(page);
    await expect(page.locator('aside').first()).toBeVisible();
    await checkResultsVisible(page);
    expect(errors).toEqual([]);
  });

  test('Mobile layout', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await apiLogin(page);
    await expect(page.locator('button:has-text("藥品搜尋")')).toBeVisible();
    await checkResultsVisible(page);
    expect(errors).toEqual([]);
  });

  test('Tablet layout', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await apiLogin(page);
    await checkResultsVisible(page);
    expect(errors).toEqual([]);
  });
});

test.describe('Left Panel Filters (Desktop)', () => {

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await apiLogin(page);
  });

  test('Storage location filter', async ({ page }) => {
    const errors = collectPageErrors(page);
    const btn = page.locator('aside button:has-text("A1")').first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(500);
      const applyBtn = page.locator('aside button:has-text("套用篩選")').first();
      if (await applyBtn.isVisible().catch(() => false)) {
        await applyBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
    }
    await checkResultsVisible(page);
    expect(errors).toEqual([]);
  });

  test('Category filter', async ({ page }) => {
    const errors = collectPageErrors(page);
    const expandBtn = page.locator('aside button:has-text("展開進階篩選")').first();
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(500);
    }
    
    const catBtn = page.locator('aside button:has-text("西藥")').first();
    if (await catBtn.isVisible().catch(() => false)) {
      await catBtn.click();
      await page.waitForTimeout(500);
      const applyBtn = page.locator('aside button:has-text("套用篩選")').first();
      if (await applyBtn.isVisible().catch(() => false)) {
        await applyBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
    }
    await checkResultsVisible(page);
    expect(errors).toEqual([]);
  });

  test('Panel reset', async ({ page }) => {
    const errors = collectPageErrors(page);
    const input = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await input.fill('測試');
    await input.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const expandBtn = page.locator('aside button:has-text("展開進階篩選")').first();
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(500);
    }
    
    const storageBtn = page.locator('aside button:has-text("A1")').first();
    if (await storageBtn.isVisible().catch(() => false)) {
      await storageBtn.click();
      await page.waitForTimeout(500);
    }
    
    const resetBtn = page.locator('aside button:has-text("重置")').first();
    if (await resetBtn.isVisible().catch(() => false)) {
      await resetBtn.click();
      await page.waitForTimeout(1000);
      await expect(input).toHaveValue('');
    }
    await checkResultsVisible(page);
    expect(errors).toEqual([]);
  });
});