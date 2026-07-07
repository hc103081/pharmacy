import { test, expect } from '@playwright/test';

/**
 * Google Drive 還原流程 E2E 測試
 *
 * 驗證：
 * 1. cloud_backup=true 的清單點「還原」 → 兩階段進度
 * 2. 空間預判阻斷 → 明確錯誤提示
 * 3. Google Drive 404 容錯 → 標記 corrupted、提示無法還原
 * 4. 網路斷線可重試
 */
test.describe('Google Drive 還原流程', () => {
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

  test('雲端封存清單點「還原」 → 兩階段進度顯示', async ({ page }) => {
    // 切換到 archived tab - 等待 tab 按鈕出現並點擊
    const archivedTab = page.locator('button:has-text("archived")').first();
    await expect(archivedTab).toBeVisible({ timeout: 10000 });
    await archivedTab.click();
    await page.waitForLoadState('networkidle');

    // 找到雲端封存的清單
    const cloudArchivedCards = page.locator('.tech-card').filter({ hasText: '已封存（雲端）' });
    const count = await cloudArchivedCards.count();

    if (count === 0) {
      test.skip(true, '無雲端封存清單');
    }

    // 點擊還原按鈕
    const firstCard = cloudArchivedCards.first();
    await firstCard.locator('button[title="解壓還原"]').click();

    // 階段 1：從 Google Drive 下載備份
    await expect(page.locator('text=從 Google Drive 下載備份')).toBeVisible({ timeout: 10000 });

    // 階段 2：還原資料
    await expect(page.locator('text=正在還原資料')).toBeVisible({ timeout: 60000 });

    // 完成
    await expect(page.locator('text=還原完成')).toBeVisible({ timeout: 120000 });
  });

  test('Supabase 空間不足 → storage_full_prevent 錯誤', async ({ page }) => {
    test.skip(true, '需模擬 Supabase Storage 接近 950MB');
  });

  test('Google Drive 檔案被手動刪除 (404) → cloud_backup_missing 錯誤', async ({ page }) => {
    test.skip(true, '需在 Google Drive 中手動刪除檔案');
  });

  test('還原過程網路斷線 → 明確錯誤可重試', async ({ page }) => {
    test.skip(true, '需模擬網路斷線');
  });

  test('Token 過期/撤銷 → gdrive_auth_expired 錯誤 → 提示重新授權', async ({ page }) => {
    test.skip(true, '需模擬 Token 失效');
  });
});