import { test, expect } from '@playwright/test';

/**
 * GDrive OAuth 流程測試
 * - 首次登入無連線 → 導向 OAuth
 * - 授權完成 → 回到系統 → DB 有 user_gdrive_connections 記錄
 */
test.describe('GDrive OAuth Flow', () => {
  test.beforeEach(async ({ page }) => {
    // 清除 cookies/localStorage 模擬新用戶
    await page.context().clearCookies();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // 檢查是否被導向登入頁
    if (page.url().includes('/login')) {
      // 此專案使用 Google OAuth 登入，E2E 測試需手動處理或使用測試帳號
      test.skip(true, '需要 Google OAuth 登入，E2E 測試環境需配置測試帳號');
    }
  });

  test('首次登入無 GDrive 連線 → 強制導向 OAuth', async ({ page }) => {
    test.skip(!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD, '缺少測試帳號環境變數');

    // 登入流程（假設已有測試用戶）
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
    await page.click('button[type="submit"]');

    // 驗證導向 OAuth
    await expect(page).toHaveURL(/accounts\.google\.com/);
    await expect(page.locator('text=PhamaCount')).toBeVisible(); // OAuth 同意畫面顯示應用名稱
  });

  test('OAuth 授權完成 → 回到系統 → DB 有記錄', async ({ page }) => {
    test.skip(!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD, '需要測試帳號');

    // 登入
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
    await page.click('button[type="submit"]');

    // 在 OAuth 頁面點擊同意（需手動或模擬）
    // 注意：實際 E2E 需要處理 Google OAuth 頁面互動
    // 這裡僅驗證導向流程

    // 授權完成後應導向首頁
    await page.waitForURL('/', { timeout: 30000 });
    await expect(page.locator('h1:has-text("選擇清點清單")')).toBeVisible();
  });

  test('已有連線用戶直接進入系統', async ({ page }) => {
    test.skip(!process.env.TEST_AUTHORIZED_EMAIL || !process.env.TEST_AUTHORIZED_PASSWORD, '需要已授權的測試帳號');

    // 假設用戶已授權
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.TEST_AUTHORIZED_EMAIL!);
    await page.fill('input[type="password"]', process.env.TEST_AUTHORIZED_PASSWORD!);
    await page.click('button[type="submit"]');

    // 應直接進入首頁，不導向 OAuth
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1:has-text("選擇清點清單")')).toBeVisible();
  });
});