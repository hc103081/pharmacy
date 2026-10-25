import { test, expect } from '@playwright/test';

test.describe('Simple Query Test', () => {
  test('API login and check page structure', async ({ page }) => {
    // 使用 API 登入
    const response = await page.request.post('/api/test-auth/login', {
      data: {
        email: 'test-user@pharmacy.local',
        password: 'TestPassword123!'
      }
    });
    
    expect(response.ok()).toBe(true);
    const loginData = await response.json();
    console.log('API 登入成功:', loginData.user?.id);
    
    // 導航到查詢頁面
    await page.goto('/query');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // 檢查頁面 URL
    console.log('Page URL:', page.url());
    
    // 檢查頁面是否包含任何內容
    const bodyText = await page.locator('body').textContent();
    console.log('Body text length:', bodyText?.length || 0);
    console.log('Body text preview:', bodyText?.substring(0, 200));
    
    // 檢查查詢頁面元素
    await expect(page.locator('h1, h2, .title').first()).toBeVisible({ timeout: 10000 });
    console.log('✅ 標題元素找到');
    
    // 檢查 Tab 按鈕
    await expect(page.locator('button[role="tab"]:has-text("藥品搜尋")')).toBeVisible({ timeout: 10000 });
    console.log('✅ 藥品搜尋 Tab 找到');
    
    await expect(page.locator('button[role="tab"]:has-text("歷史記錄")')).toBeVisible({ timeout: 10000 });
    console.log('✅ 歷史記錄 Tab 找到');
    
    // 檢查 SearchPanel（只在桌面版顯示）
    const searchPanel = page.locator('.hidden\\:lg\\:block');
    const searchPanelCount = await searchPanel.count();
    console.log('SearchPanel count:', searchPanelCount);
    
    if (searchPanelCount > 0) {
      console.log('✅ SearchPanel 找到（桌面版）');
      
      // 在桌面版中檢查搜尋框
      const searchInput = searchPanel.locator('input[placeholder*="條碼、品名、製造廠代碼..."]');
      const searchInputCount = await searchInput.count();
      console.log('Search input count:', searchInputCount);
      
      if (searchInputCount > 0) {
        console.log('✅ 搜尋框找到（桌面版）');
        await expect(searchInput.first()).toBeVisible();
      } else {
        console.log('❌ 搜尋框未找到（桌面版）');
      }
    } else {
      console.log('❌ SearchPanel 未找到（可能是在移動版）');
      
      // 檢查移動版的搜尋框（作為 drawer）
      const mobileSearchPanel = page.locator('lg\\:block.lg\\:hidden');
      const mobileSearchPanelCount = await mobileSearchPanel.count();
      console.log('Mobile SearchPanel count:', mobileSearchPanelCount);
      
      if (mobileSearchPanelCount > 0) {
        console.log('✅ 移動版 SearchPanel 找到');
        
        // 檢查移動版的搜尋框
        const mobileSearchInput = mobileSearchPanel.locator('input[placeholder*="條碼、品名、製造廠代碼..."]');
        const mobileSearchInputCount = await mobileSearchInput.count();
        console.log('Mobile search input count:', mobileSearchInputCount);
        
        if (mobileSearchInputCount > 0) {
          console.log('✅ 移動版搜尋框找到');
          await expect(mobileSearchInput.first()).toBeVisible();
        } else {
          console.log('❌ 移動版搜尋框未找到');
        }
      }
    }
    
    // 截圖調試
    await page.screenshot({ path: 'simple-query-test.png', fullPage: true });
    console.log('📸 截圖已保存');
    
    // 總結
    console.log('🎉 簡單查詢測試完成');
  });
});