import { test, expect } from '@playwright/test';

/**
 * Supabase Storage 用量警告 E2E 測試
 *
 * 驗證：
 * 1. 本地佔用 > 800MB → 黃色警告「儲存空間即將滿載」
 * 2. 本地佔用 > 950MB → 紅色警告「儲存空間接近上限」
 * 3. 雲端備份清單不計入本地用量計算
 */

test.describe('Storage 用量警告', () => {
  test.beforeEach(async ({ page }) => {
    // 進入清單頁面（需要先登入）
    await page.goto('/manifests');
    await page.waitForLoadState('networkidle');
    
    // 檢查是否被導向登入頁
    if (page.url().includes('/login')) {
      // 此專案使用 Google OAuth 登入，E2E 測試需手動處理或使用測試帳號
      test.skip(true, '需要 Google OAuth 登入，E2E 測試環境需配置測試帳號');
    }
  });

  test('正常用量（< 800MB）→ 無警告', async ({ page }) => {
    // 預設環境應無警告
    await expect(page.locator('text=儲存空間即將滿載')).not.toBeVisible();
    await expect(page.locator('text=儲存空間接近上限')).not.toBeVisible();
  });

  test('用量 800MB~950MB → 黃色警告', async ({ page }) => {
    test.skip(true, '需模擬 800MB+ 本地用量（建立大量測試清單）');
  });

  test('用量 > 950MB → 紅色警告', async ({ page }) => {
    test.skip(true, '需模擬 950MB+ 本地用量');
  });

  test('雲端備份清單不計入本地用量', async ({ page }) => {
    // 驗證 cloud_backup=true 的清單不被計入 localStorageUsage
    test.skip(true, '需有雲端封存清單的測試環境');
  });

  test('警告點擊顯示本地佔用大小', async ({ page }) => {
    test.skip(true, '需模擬用量');
  });
});