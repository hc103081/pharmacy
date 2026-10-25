import { test, expect } from '@playwright/test';

test.describe('Debug Tab Structure', () => {
  test('debug page structure', async ({ page }) => {
    // 檢查 cookies（由 auth.setup.ts 設置）
    const cookies = await page.context().cookies();
    console.log('Cookies from auth setup:', cookies);
    
    // 導航到查詢頁面
    await page.goto('/query');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // 檢查頁面標題 - 給更多時間等待頁面渲染
    try {
      const title = page.locator('h1, h2, .title, .header, [data-testid="title"], [role="heading"]');
      await expect(title.first()).toBeVisible({ timeout: 15000 });
      const titleText = await title.first().textContent();
      console.log('Page title found:', titleText);
    } catch (error) {
      console.log('❌ No title element found:', error);
    }
    
    // 檢查頁面 URL
    console.log('Page URL:', page.url());
    
    // 檢查頁面內容是否包含登入相關文本
    const bodyText = await page.locator('body').textContent();
    console.log('Body text contains "請先登入":', bodyText?.includes('請先登入'));
    console.log('Body text contains "Sign in":', bodyText?.includes('Sign in'));
    
    // 檢查頁面是否包含任何內容
    if (bodyText && bodyText.length > 0) {
      console.log('Body text length:', bodyText.length);
      console.log('Body text preview:', bodyText.substring(0, 200));
    } else {
      console.log('❌ Body is empty');
    }
    
    // 檢查查詢頁面元素 - 給更多時間等待 Tab 按鈕渲染
    try {
      console.log('Looking for Tab buttons...');
      
      // 檢查是否有任何按鈕
      const buttons = await page.locator('button').count();
      console.log('Total buttons found:', buttons);
      
      // 檢查所有按鈕的文本
      const buttonTexts = await page.locator('button').allInnerTexts();
      console.log('Button texts:', buttonTexts);
      
      // 檢查查詢頁面元素
      await expect(page.locator('button[role="tab"]:has-text("藥品搜尋")')).toBeVisible({ timeout: 15000 });
      console.log('✅ 藥品搜尋 Tab 按鈕找到');
      
      await expect(page.locator('button[role="tab"]:has-text("歷史記錄")')).toBeVisible({ timeout: 15000 });
      console.log('✅ 歷史記錄 Tab 按鈕找到');
      
      await expect(page.locator('button[role="tab"]:has-text("趨勢分析")')).toBeVisible({ timeout: 15000 });
      console.log('✅ 趨勢分析 Tab 按鈕找到');
      
      await expect(page.locator('button[role="tab"]:has-text("報表儀表板")')).toBeVisible({ timeout: 15000 });
      console.log('✅ 報表儀表板 Tab 按鈕找到');
      
      await expect(page.locator('input[placeholder="條碼、品名、製造廠代碼..."]')).toBeVisible();
      console.log('✅ 搜尋輸入框找到');
      
    } catch (error) {
      console.log('❌ 頁面元素未找到:', error);
      
      // 檢查是否有錯誤信息
      const errorMessages = await page.locator('.error, .alert, .notification, [role="alert"]').allInnerTexts();
      if (errorMessages.length > 0) {
        console.log('Error messages found:', errorMessages);
      }
    }
    
    // 截圖調試
    await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
    console.log('Debug screenshot saved');
  });
});