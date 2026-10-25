import { test, expect } from '@playwright/test';

/**
 * 查詢頁面真實功能測試
 * 
 * 使用新的 API 登入流程和多個清單數據進行測試
 * 測試場景：
 * 1. 頁面載入與基本渲染
 * 2. 關鍵字搜尋（品名搜尋）
 * 3. 條碼搜尋
 * 4. Tab 切換
 * 5. 響應式設計驗證
 * 6. 左側篩選面板功能
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

// 輔助函數：使用 API 登入
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

// 輔助函數：等待查詢頁面載入
async function waitForQueryPage(page: import('@playwright/test').Page) {
  // 等待頁面載入
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // 檢查是否被重定向到登入頁
  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
    throw new Error(`Redirected to login page: ${currentUrl}`);
  }
  
  // 等待主要內容載入 - 使用多種可能的選擇器
  await Promise.race([
    page.waitForSelector('h1:has-text("藥品查詢系統")', { timeout: 15000 }).catch(() => null),
    page.waitForSelector('input[placeholder="條碼、品名、製造廠代碼..."]', { timeout: 15000 }).catch(() => null),
    page.waitForSelector('button:has-text("藥品搜尋")', { timeout: 15000 }).catch(() => null),
  ]);
  
  await page.waitForTimeout(1000);
}

// 輔助函數：檢查結果區域是否可見（表格或無結果訊息）
async function checkResultsArea(page: import('@playwright/test').Page) {
  // 使用正確的 Playwright 選擇器語法
  const table = page.locator('table').first();
  const noResultsText = page.locator('text=無搜尋結果').first();
  
  // 等待其中一個出現
  await Promise.race([
    table.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null),
    noResultsText.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null),
  ]);
  
  // 檢查至少一個可見
  const tableVisible = await table.isVisible().catch(() => false);
  const textVisible = await noResultsText.isVisible().catch(() => false);
  
  if (!tableVisible && !textVisible) {
    throw new Error('結果區域既無表格也無「無搜尋結果」文字');
  }
}

test.describe('查詢頁面真實功能測試 (API 登入)', () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page);
    await waitForQueryPage(page);
  });

  test('查詢頁面應正常載入並顯示基本 UI', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 驗證 QueryHeader 的標題
    await expect(page.locator('h1:has-text("藥品查詢系統")')).toBeVisible({ timeout: 15000 });
    
    // 驗證 Tab 列表存在
    await expect(page.locator('button:has-text("藥品搜尋")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("歷史記錄")')).toBeVisible();
    await expect(page.locator('button:has-text("趨勢分析")')).toBeVisible();
    await expect(page.locator('button:has-text("報表儀表板")')).toBeVisible();
    
    // 驗證主搜尋框存在（在 DrugSearchTab 中）
    await expect(page.locator('input[placeholder="條碼、品名、製造廠代碼..."]')).toBeVisible();
    
    // 驗證結果區域存在
    await checkResultsArea(page);
    
    // 無未捕獲的頁面錯誤
    expect(errors, `Unexpected errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('關鍵字搜尋應正常運作（品名搜尋）', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 在 DrugSearchTab 的搜尋框輸入關鍵字
    const searchInput = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 15000 });
    await searchInput.fill('阿司匹林');
    
    // 按 Enter 搜尋
    await searchInput.press('Enter');
    
    // 等待查詢完成
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // 驗證結果區域仍可見
    await checkResultsArea(page);
    
    expect(errors).toEqual([]);
  });

  test('條碼搜尋應正常運作', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    const searchInput = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 15000 });
    await searchInput.fill('4710000000000');
    await searchInput.press('Enter');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    await checkResultsArea(page);
    
    expect(errors).toEqual([]);
  });

  test('Tab 切換應正常運作', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 切換到「歷史記錄」Tab
    const historyTab = page.locator('button:has-text("歷史記錄")').first();
    await historyTab.waitFor({ state: 'visible', timeout: 10000 });
    await historyTab.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // 切換到「趨勢分析」Tab
    const trendTab = page.locator('button:has-text("趨勢分析")').first();
    await trendTab.waitFor({ state: 'visible', timeout: 10000 });
    await trendTab.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // 切換到「報表儀表板」Tab
    const reportTab = page.locator('button:has-text("報表儀表板")').first();
    await reportTab.waitFor({ state: 'visible', timeout: 10000 });
    await reportTab.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // 切換回「藥品搜尋」Tab
    const drugSearchTab = page.locator('button:has-text("藥品搜尋")').first();
    await drugSearchTab.waitFor({ state: 'visible', timeout: 10000 });
    await drugSearchTab.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // 驗證回到藥品搜尋，結果區域可見
    await checkResultsArea(page);
    
    expect(errors).toEqual([]);
  });

  test('重置篩選條件應正常運作（使用主搜尋框的重置按鈕）', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 先設置搜尋關鍵字
    const mainSearchInput = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await mainSearchInput.waitFor({ state: 'visible', timeout: 15000 });
    await mainSearchInput.fill('測試關鍵字');
    await mainSearchInput.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // 點擊主搜尋區域的「重置」按鈕
    const resetButton = page.locator('button:has-text("重置")').first();
    await resetButton.waitFor({ state: 'visible', timeout: 10000 });
    await resetButton.click();
    await page.waitForTimeout(1000);
    
    // 驗證搜尋框已清空
    await expect(mainSearchInput).toHaveValue('');
    
    // 驗證結果區域可見
    await checkResultsArea(page);
    
    expect(errors).toEqual([]);
  });

  test('匯出按鈕應可見且可點擊', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 驗證匯出按鈕存在
    const exportButton = page.locator('button:has-text("匯出結果")').first();
    await exportButton.waitFor({ state: 'visible', timeout: 15000 });
    await expect(exportButton).toBeVisible();
    
    // 點擊匯出按鈕（會觸發 alert）
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    await exportButton.click();
    await page.waitForTimeout(1000);
    
    expect(errors).toEqual([]);
  });
});

test.describe('查詢頁面響應式測試 (已登入)', () => {
  test.use({ storageState: 'tests/e2e/auth-state.json' });
  
  test('桌面版視窗應正常顯示查詢功能', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/query');
    await waitForQueryPage(page);
    
    // 驗證頁面標題可見
    await expect(page.locator('h1:has-text("藥品查詢系統")')).toBeVisible({ timeout: 15000 });
    
    // 驗證左側搜尋面板可見（桌面版）
    const leftPanel = page.locator('aside').first();
    await expect(leftPanel).toBeVisible({ timeout: 10000 });
    
    // 驗證 Tab 列表可見
    await expect(page.locator('button:has-text("藥品搜尋")')).toBeVisible();
    
    // 驗證結果區域可見
    await checkResultsArea(page);
    
    expect(errors).toEqual([]);
  });
  
  test('手機版視窗應正常顯示查詢功能', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/query');
    await waitForQueryPage(page);
    
    // 驗證頁面標題可見
    await expect(page.locator('h1:has-text("藥品查詢系統")')).toBeVisible({ timeout: 15000 });
    
    // 驗證 Tab 列表可見
    await expect(page.locator('button:has-text("藥品搜尋")')).toBeVisible({ timeout: 10000 });
    
    // 驗證結果區域可見
    await checkResultsArea(page);
    
    // 主搜尋框在 DrugSearchTab 中應該可見
    const mainSearchInput = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await expect(mainSearchInput).toBeVisible({ timeout: 15000 });
    
    expect(errors).toEqual([]);
  });
  
  test('平板版視窗應正常顯示查詢功能', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/query');
    await waitForQueryPage(page);
    
    // 驗證頁面標題可見
    await expect(page.locator('h1:has-text("藥品查詢系統")')).toBeVisible({ timeout: 15000 });
    
    // 驗證 Tab 列表可見
    await expect(page.locator('button:has-text("藥品搜尋")')).toBeVisible();
    
    // 驗證結果區域可見
    await checkResultsArea(page);
    
    expect(errors).toEqual([]);
  });
});

// 測試左側 SearchPanel 的篩選功能（桌面版）
test.describe('查詢頁面左側篩選面板測試 (桌面版)', () => {
  test.use({ storageState: 'tests/e2e/auth-state.json' });
  
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/query');
    await waitForQueryPage(page);
  });

  test('左側面板儲位篩選應正常運作', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 在左側 SearchPanel 中找到儲位按鈕
    const storageButton = page.locator('aside button:has-text("A1")').first();
    if (await storageButton.isVisible().catch(() => false)) {
      await storageButton.click();
      await page.waitForTimeout(500);
      
      // 點擊「套用篩選」按鈕
      const applyButton = page.locator('aside button:has-text("套用篩選")').first();
      if (await applyButton.isVisible().catch(() => false)) {
        await applyButton.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
    }
    
    // 驗證結果區域可見
    await checkResultsArea(page);
    
    expect(errors).toEqual([]);
  });

  test('左側面板類別篩選應正常運作', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 先展開進階篩選（如果未展開）
    const expandButton = page.locator('aside button:has-text("展開進階篩選")').first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(500);
    }
    
    // 在左側 SearchPanel 中點擊類別按鈕
    const categoryButton = page.locator('aside button:has-text("西藥")').first();
    if (await categoryButton.isVisible().catch(() => false)) {
      await categoryButton.click();
      await page.waitForTimeout(500);
      
      // 點擊「套用篩選」按鈕
      const applyButton = page.locator('aside button:has-text("套用篩選")').first();
      if (await applyButton.isVisible().catch(() => false)) {
        await applyButton.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
    }
    
    await checkResultsArea(page);
    
    expect(errors).toEqual([]);
  });

  test('左側面板組合篩選條件應正常運作', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 先展開進階篩選
    const expandButton = page.locator('aside button:has-text("展開進階篩選")').first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(500);
    }
    
    // 1. 在主搜尋框輸入關鍵字
    const mainSearchInput = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await mainSearchInput.waitFor({ state: 'visible', timeout: 15000 });
    await mainSearchInput.fill('止痛');
    await mainSearchInput.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // 2. 選擇儲位
    const storageButton = page.locator('aside button:has-text("A1")').first();
    if (await storageButton.isVisible().catch(() => false)) {
      await storageButton.click();
      await page.waitForTimeout(500);
    }
    
    // 3. 選擇類別
    const categoryButton = page.locator('aside button:has-text("西藥")').first();
    if (await categoryButton.isVisible().catch(() => false)) {
      await categoryButton.click();
      await page.waitForTimeout(500);
    }
    
    // 4. 點擊「套用篩選」按鈕
    const applyButton = page.locator('aside button:has-text("套用篩選")').first();
    if (await applyButton.isVisible().catch(() => false)) {
      await applyButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
    
    await checkResultsArea(page);
    
    expect(errors).toEqual([]);
  });

  test('左側面板重置篩選應正常運作', async ({ page }) => {
    const errors = collectPageErrors(page);
    
    // 先設置搜尋關鍵字
    const mainSearchInput = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await mainSearchInput.waitFor({ state: 'visible', timeout: 15000 });
    await mainSearchInput.fill('測試關鍵字');
    await mainSearchInput.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // 展開進階篩選並選擇儲位
    const expandButton = page.locator('aside button:has-text("展開進階篩選")').first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(500);
    }
    
    const storageButton = page.locator('aside button:has-text("A1")').first();
    if (await storageButton.isVisible().catch(() => false)) {
      await storageButton.click();
      await page.waitForTimeout(500);
    }
    
    // 點擊左側面板的「重置」按鈕
    const resetButton = page.locator('aside button:has-text("重置")').first();
    if (await resetButton.isVisible().catch(() => false)) {
      await resetButton.click();
      await page.waitForTimeout(1000);
      
      // 驗證主搜尋框已清空
      await expect(mainSearchInput).toHaveValue('');
    }
    
    await checkResultsArea(page);
    
    expect(errors).toEqual([]);
  });
});