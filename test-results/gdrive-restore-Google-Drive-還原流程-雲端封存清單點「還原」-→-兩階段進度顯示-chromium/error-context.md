# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: gdrive-restore.spec.ts >> Google Drive 還原流程 >> 雲端封存清單點「還原」 → 兩階段進度顯示
- Location: tests\e2e\gdrive-restore.spec.ts:25:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button:has-text("archived")').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('button:has-text("archived")').first()

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Google Drive 還原流程 E2E 測試
  5  |  *
  6  |  * 驗證：
  7  |  * 1. cloud_backup=true 的清單點「還原」 → 兩階段進度
  8  |  * 2. 空間預判阻斷 → 明確錯誤提示
  9  |  * 3. Google Drive 404 容錯 → 標記 corrupted、提示無法還原
  10 |  * 4. 網路斷線可重試
  11 |  */
  12 | test.describe('Google Drive 還原流程', () => {
  13 |   test.beforeEach(async ({ page }) => {
  14 |     // 進入清單頁面（需要先登入）
  15 |     await page.goto('/manifests');
  16 |     await page.waitForLoadState('networkidle');
  17 |     
  18 |     // 檢查是否被導向登入頁
  19 |     if (page.url().includes('/login')) {
  20 |       // 此專案使用 Google OAuth 登入，E2E 測試需手動處理或使用測試帳號
  21 |       test.skip(true, '需要 Google OAuth 登入，E2E 測試環境需配置測試帳號');
  22 |     }
  23 |   });
  24 | 
  25 |   test('雲端封存清單點「還原」 → 兩階段進度顯示', async ({ page }) => {
  26 |     // 切換到 archived tab - 等待 tab 按鈕出現並點擊
  27 |     const archivedTab = page.locator('button:has-text("archived")').first();
> 28 |     await expect(archivedTab).toBeVisible({ timeout: 10000 });
     |                               ^ Error: expect(locator).toBeVisible() failed
  29 |     await archivedTab.click();
  30 |     await page.waitForLoadState('networkidle');
  31 | 
  32 |     // 找到雲端封存的清單
  33 |     const cloudArchivedCards = page.locator('.tech-card').filter({ hasText: '已封存（雲端）' });
  34 |     const count = await cloudArchivedCards.count();
  35 | 
  36 |     if (count === 0) {
  37 |       test.skip(true, '無雲端封存清單');
  38 |     }
  39 | 
  40 |     // 點擊還原按鈕
  41 |     const firstCard = cloudArchivedCards.first();
  42 |     await firstCard.locator('button[title="解壓還原"]').click();
  43 | 
  44 |     // 階段 1：從 Google Drive 下載備份
  45 |     await expect(page.locator('text=從 Google Drive 下載備份')).toBeVisible({ timeout: 10000 });
  46 | 
  47 |     // 階段 2：還原資料
  48 |     await expect(page.locator('text=正在還原資料')).toBeVisible({ timeout: 60000 });
  49 | 
  50 |     // 完成
  51 |     await expect(page.locator('text=還原完成')).toBeVisible({ timeout: 120000 });
  52 |   });
  53 | 
  54 |   test('Supabase 空間不足 → storage_full_prevent 錯誤', async ({ page }) => {
  55 |     test.skip(true, '需模擬 Supabase Storage 接近 950MB');
  56 |   });
  57 | 
  58 |   test('Google Drive 檔案被手動刪除 (404) → cloud_backup_missing 錯誤', async ({ page }) => {
  59 |     test.skip(true, '需在 Google Drive 中手動刪除檔案');
  60 |   });
  61 | 
  62 |   test('還原過程網路斷線 → 明確錯誤可重試', async ({ page }) => {
  63 |     test.skip(true, '需模擬網路斷線');
  64 |   });
  65 | 
  66 |   test('Token 過期/撤銷 → gdrive_auth_expired 錯誤 → 提示重新授權', async ({ page }) => {
  67 |     test.skip(true, '需模擬 Token 失效');
  68 |   });
  69 | });
```