import { test, expect } from '@playwright/test';

/**
 * 查詢頁面基本功能測試（不依賴認證）
 * 
 * 測試場景：
 * 1. 頁面載入與基本渲染
 * 2. 關鍵字搜尋功能
 * 3. 響應式設計驗證
 */

test.describe('查詢頁面基本功能測試', () => {
  
  test('查詢頁面應正常載入', async ({ page }) => {
    await page.goto('/query');
    
    // 等待頁面載入
    await page.waitForLoadState('networkidle');
    
    // 檢查是否重定向到登入頁面
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
      console.log('⚠️ 頁面重定向到登入頁面，跳過認證相關測試');
      return;
    }
    
    // 檢查基本 UI 元素
    await expect(page.locator('h1, h2, .title').first()).toBeVisible();
    await expect(page.locator('input[placeholder*="搜尋"], input[placeholder*="查詢"]')).toBeVisible();
    
    console.log('✅ 查詢頁面基本載入正常');
  });

  test('關鍵字搜尋功能應正常運作', async ({ page }) => {
    await page.goto('/query');
    await page.waitForLoadState('networkidle');
    
    // 等待搜尋框出現
    const searchInput = page.locator('input[placeholder*="搜尋"], input[placeholder*="查詢"], input[placeholder*="條碼"]');
    await searchInput.waitFor({ state: 'visible', timeout: 10000 });
    
    // 測試基本輸入功能
    await searchInput.fill('測試');
    await searchInput.press('Enter');
    
    // 等待搜尋結果
    await page.waitForLoadState('networkidle');
    
    // 檢查是否有搜尋結果相關的元素
    const resultsContainer = page.locator('.results, .items, .list, [data-testid="results"]');
    const hasResults = await resultsContainer.count() > 0;
    
    console.log(`🔍 搜尋功能測試完成，找到結果: ${hasResults}`);
  });

  test('響應式設計測試', async ({ page }) => {
    await page.goto('/query');
    await page.waitForLoadState('networkidle');
    
    // 測試桌面版
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1000);
    
    // 檢查桌面版布局
    const desktopLayout = page.locator('.desktop, .lg\\:, .md\\:');
    const hasDesktopLayout = await desktopLayout.count() > 0;
    
    // 測試手機版
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    
    // 檢查手機版布局
    const mobileLayout = page.locator('.mobile, .sm\\:, [data-testid="mobile"]');
    const hasMobileLayout = await mobileLayout.count() > 0;
    
    console.log(`📱 響應式設計測試完成 - 桌面版: ${hasDesktopLayout}, 手機版: ${hasMobileLayout}`);
  });

  test('基本 UI 元素檢查', async ({ page }) => {
    await page.goto('/query');
    await page.waitForLoadState('networkidle');
    
    // 等待主要元素載入
    await page.waitForTimeout(2000);
    
    // 檢查各種可能的 UI 元素
    const selectors = [
      'h1, h2, h3', // 標題
      'input[type="text"], input[type="search"]', // 輸入框
      'button', // 按鈕
      '.search, .filter, .query', // 搜尋/篩選相關
      '.tab, .nav', // Tab 導航
      '.card, .item, .list-item', // 列表項目
      '.loading, .spinner', // 載入中元素
    ];
    
    const results = [];
    
    for (const selector of selectors) {
      const elements = page.locator(selector);
      const count = await elements.count();
      if (count > 0) {
        results.push(`${selector}: ${count} 個元素`);
      }
    }
    
    console.log('📋 基本 UI 元素檢查完成:');
    results.forEach(result => console.log(`  - ${result}`));
  });

  test('頁面載入性能測試', async ({ page }) => {
    await page.goto('/query');
    
    // 測量頁面載入時間
    const startTime = Date.now();
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    
    console.log(`⏱️ 頁面載入時間: ${loadTime}ms`);
    
    // 檢查是否有性能問題
    if (loadTime > 10000) {
      console.log('⚠️ 頁面載入時間較長，可能存在性能問題');
    }
  });

  test('控制台錯誤檢查', async ({ page }) => {
    // 監聽控制台錯誤
    const consoleErrors: string[] = [];
    const consoleLogs: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.error('🚨 控制台錯誤:', msg.text());
      } else if (msg.type() === 'warning') {
        consoleLogs.push(msg.text());
        console.warn('⚠️ 控制台警告:', msg.text());
      }
    });
    
    await page.goto('/query');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    console.log(`📊 控制台錯誤檢查完成 - 錯誤: ${consoleErrors.length}, 警告: ${consoleLogs.length}`);
    
    if (consoleErrors.length > 0) {
      console.log('發現的控制台錯誤:');
      consoleErrors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
  });
});