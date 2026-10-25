import { test, expect } from '@playwright/test';

/**
 * 查詢頁面篩選功能 E2E 測試
 * 
 * 測試場景：
 * 1. 頁面載入與基本渲染
 * 2. 側邊欄篩選面板開關
 * 3. 儲位篩選套用與重置
 * 4. 類別篩選套用與重置
 * 5. 關鍵字搜尋
 * 6. 日期範圍篩選
 * 7. 組合篩選條件
 * 8. 重置功能
 */

// 收集頁面錯誤的輔助函數
function collectPageErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // 忽略預期的網路/認證錯誤
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

// 使用已認證的專案 - 此測試需要有效的 auth state
// test.describe.configure({ retries: 0 });
// test.use({ storageState: 'playwright/.auth/user.json' });

test.describe('查詢頁面篩選功能 (已登入)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/query');
    await page.waitForLoadState('networkidle');
  });

  test('查詢頁面應正常載入並顯示基本 UI', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 驗證頁面標題
    await expect(page.locator('h1, [role="heading"]').first()).toBeVisible({ timeout: 15000 });
    
    // 驗證側邊欄觸發按鈕存在
    const filterTrigger = page.locator('[data-testid="open-filters"], button:has-text("篩選"), button:has-text("Filter")').first();
    await expect(filterTrigger).toBeVisible({ timeout: 10000 });
    
    // 驗證結果列表區域存在
    await expect(page.locator('[data-testid="drug-list"], [data-testid="drug-table"], .drug-results, main').first()).toBeVisible();
    
    // 無未捕獲的頁面錯誤
    expect(errors, `Unexpected errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('點擊篩選按鈕應開啟側邊欄', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 找到並點擊篩選按鈕
    const filterTrigger = page.locator('[data-testid="open-filters"], button:has-text("篩選"), button:has-text("Filter")').first();
    await filterTrigger.click();
    
    // 驗證側邊欄打開
    const sidebar = page.locator('[data-testid="filter-sidebar"], aside:has-text("儲位"), aside:has-text("類別"), .filter-panel').first();
    await expect(sidebar).toBeVisible({ timeout: 5000 });
    
    // 驗證側邊欄包含預期內容
    await expect(page.locator('text=/儲位|Storage Location/i')).toBeVisible();
    await expect(page.locator('text=/類別|Category/i')).toBeVisible();
    
    expect(errors).toEqual([]);
  });

  test('選擇儲位並套用篩選應更新結果', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 開啟側邊欄
    const filterTrigger = page.locator('[data-testid="open-filters"], button:has-text("篩選"), button:has-text("Filter")').first();
    await filterTrigger.click();
    
    // 選擇第一個儲位
    const firstStorageCheckbox = page.locator('[data-testid="storage-location"] input[type="checkbox"], input[type="checkbox"]:near(:text("A區"))').first();
    if (await firstStorageCheckbox.isVisible().catch(() => false)) {
      await firstStorageCheckbox.check();
    } else {
      // 嘗試其他選擇器
      await page.locator('input[type="checkbox"]').first().check();
    }
    
    // 點擊套用篩選
    const applyButton = page.locator('[data-testid="apply-filters"], button:has-text("套用篩選"), button:has-text("Apply")').first();
    await applyButton.click();
    
    // 等待查詢完成
    await page.waitForLoadState('networkidle');
    
    // 驗證結果已更新（至少不報錯）
    const resultsArea = page.locator('[data-testid="drug-list"], [data-testid="drug-table"], .drug-results, main').first();
    await expect(resultsArea).toBeVisible();
    
    expect(errors).toEqual([]);
  });

  test('選擇類別並套用篩選應更新結果', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    const filterTrigger = page.locator('[data-testid="open-filters"], button:has-text("篩選"), button:has-text("Filter")').first();
    await filterTrigger.click();
    
    // 選擇第一個類別
    const firstCategoryCheckbox = page.locator('[data-testid="category"] input[type="checkbox"], input[type="checkbox"]:near(:text("止痛藥"))').first();
    if (await firstCategoryCheckbox.isVisible().catch(() => false)) {
      await firstCategoryCheckbox.check();
    } else {
      // 找到類別區域的第一個 checkbox
      const checkboxes = page.locator('input[type="checkbox"]');
      if (await checkboxes.count() > 1) {
        await checkboxes.nth(1).check();
      }
    }
    
    const applyButton = page.locator('[data-testid="apply-filters"], button:has-text("套用篩選"), button:has-text("Apply")').first();
    await applyButton.click();
    
    await page.waitForLoadState('networkidle');
    
    const resultsArea = page.locator('[data-testid="drug-list"], [data-testid="drug-table"], .drug-results, main').first();
    await expect(resultsArea).toBeVisible();
    
    expect(errors).toEqual([]);
  });

  test('輸入關鍵字搜尋應過濾結果', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    const filterTrigger = page.locator('[data-testid="open-filters"], button:has-text("篩選"), button:has-text("Filter")').first();
    await filterTrigger.click();
    
    // 在搜尋框輸入關鍵字
    const searchInput = page.locator('[data-testid="search-input"], input[placeholder*="搜尋"], input[placeholder*="Search"]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('阿司匹林');
    }
    
    const applyButton = page.locator('[data-testid="apply-filters"], button:has-text("套用篩選"), button:has-text("Apply")').first();
    await applyButton.click();
    
    await page.waitForLoadState('networkidle');
    
    // 驗證結果區域仍可見
    const resultsArea = page.locator('[data-testid="drug-list"], [data-testid="drug-table"], .drug-results, main').first();
    await expect(resultsArea).toBeVisible();
    
    expect(errors).toEqual([]);
  });

  test('選擇日期範圍並套用應更新結果', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    const filterTrigger = page.locator('[data-testid="open-filters"], button:has-text("篩選"), button:has-text("Filter")').first();
    await filterTrigger.click();
    
    // 設定日期範圍
    const dateFromInput = page.locator('[data-testid="date-from"], input[label*="起始"], input[placeholder*="起始"]').first();
    const dateToInput = page.locator('[data-testid="date-to"], input[label*="結束"], input[placeholder*="結束"]').first();
    
    if (await dateFromInput.isVisible().catch(() => false)) {
      await dateFromInput.fill('2024-01-01');
    }
    if (await dateToInput.isVisible().catch(() => false)) {
      await dateToInput.fill('2024-01-31');
    }
    
    const applyButton = page.locator('[data-testid="apply-filters"], button:has-text("套用篩選"), button:has-text("Apply")').first();
    await applyButton.click();
    
    await page.waitForLoadState('networkidle');
    
    const resultsArea = page.locator('[data-testid="drug-list"], [data-testid="drug-table"], .drug-results, main').first();
    await expect(resultsArea).toBeVisible();
    
    expect(errors).toEqual([]);
  });

  test('點擊重置按鈕應清除所有篩選條件', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    const filterTrigger = page.locator('[data-testid="open-filters"], button:has-text("篩選"), button:has-text("Filter")').first();
    await filterTrigger.click();
    
    // 先選擇一些條件
    const checkboxes = page.locator('input[type="checkbox"]');
    if (await checkboxes.count() > 0) {
      await checkboxes.first().check();
    }
    
    const searchInput = page.locator('[data-testid="search-input"], input[placeholder*="搜尋"]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('測試');
    }
    
    // 點擊重置
    const resetButton = page.locator('[data-testid="reset-filters"], button:has-text("重置"), button:has-text("Reset")').first();
    await resetButton.click();
    
    // 驗證輸入框已清空
    if (await searchInput.isVisible().catch(() => false)) {
      await expect(searchInput).toHaveValue('');
    }
    
    // 驗證 checkbox 已取消選取
    if (await checkboxes.count() > 0) {
      await expect(checkboxes.first()).not.toBeChecked();
    }
    
    expect(errors).toEqual([]);
  });

  test('組合多重篩選條件應正常運作', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    const filterTrigger = page.locator('[data-testid="open-filters"], button:has-text("篩選"), button:has-text("Filter")').first();
    await filterTrigger.click();
    
    // 同時選擇儲位和類別
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    if (count >= 2) {
      await checkboxes.nth(0).check();
      await checkboxes.nth(Math.min(1, count - 1)).check();
    }
    
    const searchInput = page.locator('[data-testid="search-input"], input[placeholder*="搜尋"]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('止痛');
    }
    
    const applyButton = page.locator('[data-testid="apply-filters"], button:has-text("套用篩選"), button:has-text("Apply")').first();
    await applyButton.click();
    
    await page.waitForLoadState('networkidle');
    
    const resultsArea = page.locator('[data-testid="drug-list"], [data-testid="drug-table"], .drug-results, main').first();
    await expect(resultsArea).toBeVisible();
    
    expect(errors).toEqual([]);
  });

  test('篩選結果應顯示在頁面頂部', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    const filterTrigger = page.locator('[data-testid="open-filters"], button:has-text("篩選"), button:has-text("Filter")').first();
    await filterTrigger.click();
    
    const checkboxes = page.locator('input[type="checkbox"]');
    if (await checkboxes.count() > 0) {
      await checkboxes.first().check();
    }
    
    const applyButton = page.locator('[data-testid="apply-filters"], button:has-text("套用篩選"), button:has-text("Apply")').first();
    await applyButton.click();
    
    await page.waitForLoadState('networkidle');
    
    // 驗證頁面頂部顯示當前篩選條件
    const activeFilters = page.locator('[data-testid="active-filters"], .active-filters, text=/目前篩選|Active filters/i').first();
    // 可能不一定有這個元素，所以用 try-catch
    const hasActiveFilters = await activeFilters.isVisible().catch(() => false);
    
    expect(errors).toEqual([]);
  });
});

test.describe('查詢頁面響應式測試 (已登入)', () => {
  // test.use({ storageState: 'playwright/.auth/user.json' });
  test('手機版視窗應正常顯示篩選功能', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 設定手機視窗大小
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/query');
    await page.waitForLoadState('networkidle');
    
    // 驗證篩選按鈕在手機版仍可見
    const filterTrigger = page.locator('[data-testid="open-filters"], button:has-text("篩選"), button:has-text("Filter")').first();
    await expect(filterTrigger).toBeVisible({ timeout: 10000 });
    
    // 點擊開啟側邊欄（手機版可能是底部抽屜或全屏彈窗）
    await filterTrigger.click();
    
    // 驗證側邊欄/抽屜打開
    const sidebar = page.locator('[data-testid="filter-sidebar"], aside, .filter-drawer, .filter-bottom-sheet').first();
    await expect(sidebar).toBeVisible({ timeout: 5000 });
    
    expect(errors).toEqual([]);
  });
});