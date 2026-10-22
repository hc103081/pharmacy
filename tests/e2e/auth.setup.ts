import { test as setup, expect } from '@playwright/test';
import { config } from 'dotenv';

// 載入環境變數
config({ path: '.env.local' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_USER = {
  email: 'test-user@pharmacy.local',
  password: 'TestPassword123!'
};

setup('authenticate and save storage state', async ({ page }) => {
  try {
    console.log('🔑 開始設置測試認證（透過 Test Auth API 登入）...');
    
    // 使用 Test Auth API 登入
    const loginResponse = await page.request.post(`${BASE_URL}/api/test-auth/login`, {
      data: {
        email: TEST_USER.email,
        password: TEST_USER.password
      }
    });
    
    if (!loginResponse.ok()) {
      const errorData = await loginResponse.json();
      throw new Error(`登入失敗: ${errorData.error || 'Unknown error'}`);
    }
    
    const loginData = await loginResponse.json();
    console.log('✅ Test Auth API 登入成功:', loginData.user?.id);
    
    // 導航到首頁並等待載入
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // 導航到查詢頁面驗證登入狀態
    await page.goto(`${BASE_URL}/query`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // 驗證未被導向登入頁面（即沒有 "請先登入" 文字）
    const loginText = page.locator('text=請先登入');
    await expect(loginText).not.toBeVisible({ timeout: 5000 });
    
    // 使用 Playwright 的內建方法保存認證狀態
    await page.context().storageState({ path: 'tests/e2e/auth-state.json' });
    
    console.log('✅ 認證狀態設置完成（Test Auth API）');
    console.log(`測試用戶: ${TEST_USER.email}`);
    
  } catch (error) {
    console.error('❌ 認證設置失敗:', error);
    throw error;
  }
});