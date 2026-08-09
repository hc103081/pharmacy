// AI 計數功能 E2E 測試
import { test, expect } from '@playwright/test';

test.describe('AI 計數功能', () => {
  test.beforeEach(async ({ page }) => {
    // 進入掃描頁面 (需要有效的 manifestId)
    await page.goto('/scan?manifestId=test-manifest');
    await page.waitForLoadState('networkidle');
  });

  test('啟用 AI 模式 → 顯示設定面板', async ({ page }) => {
    // 1. 點擊齒輪圖示開啟 AI 設定
    await page.click('button[aria-label="AI 計數設定"]');
    
    // 2. 驗證設定面板出現
    await expect(page.locator('text=啟用 AI 計數模式')).toBeVisible();
    await expect(page.locator('text=模式:')).toBeVisible();
  });

  test('勾選 AI 模式 → 顯示模式指示器', async ({ page }) => {
    // 1. 開啟設定並啟用 AI 模式
    await page.click('button[aria-label="AI 計數設定"]');
    await page.click('input[type="checkbox"]');
    
    // 2. 驗證模式指示器顯示 (WebGPU 或 WASM)
    await expect(page.locator('text=/模式: (🟢 WebGPU|🟡 CPU)/')).toBeVisible();
  });

  test('AI 模式開啟時 → 拍照按鈕正常運作', async ({ page }) => {
    // 1. 啟用 AI 模式
    await page.click('button[aria-label="AI 計數設定"]');
    await page.click('input[type="checkbox"]');
    
    // 2. 點擊第一個藥品的拍照按鈕 (如果有藥品)
    const firstDrugCard = page.locator('[data-drug-id]').first();
    if (await firstDrugCard.isVisible()) {
      await firstDrugCard.locator('button:has-text("拍照確認")').click();
      
      // 3. 驗證 CameraModal 開啟
      await expect(page.locator('text=AI 計數模式')).toBeVisible({ timeout: 5000 });
    }
  });

  test('離線模式下 AI 功能仍可啟用 (模型從快取讀取)', async ({ page, context }) => {
    // 1. 先正常載入頁面建立快取
    await page.goto('/scan?manifestId=test-manifest');
    await page.waitForLoadState('networkidle');
    
    // 2. 開啟 AI 設定並啟用
    await page.click('button[aria-label="AI 計數設定"]');
    await page.click('input[type="checkbox"]');
    await expect(page.locator('text=/模式: (🟢 WebGPU|🟡 CPU)/')).toBeVisible();
    
    // 3. 斷網
    await context.setOffline(true);
    
    // 4. 重新整理頁面
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // 5. 驗證 AI 設定仍可開啟 (不顯示下載中)
    await page.click('button[aria-label="AI 計數設定"]');
    await expect(page.locator('input[type="checkbox"]')).toBeChecked();
    await expect(page.locator('text=載入中...')).not.toBeVisible();
  });
});

test.describe('AI 計數互動 (需模型檔案)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/scan?manifestId=test-manifest');
    await page.waitForLoadState('networkidle');
    
    // 啟用 AI 模式
    await page.click('button[aria-label="AI 計數設定"]');
    await page.click('input[type="checkbox"]');
    await expect(page.locator('text=/模式: (🟢 WebGPU|🟡 CPU)/')).toBeVisible();
  });

  test('點擊相片產生 Mask + 數字標籤', async ({ page }) => {
    // 此測試需要實際模型檔案和測試圖片
    // 在 CI 中可使用 mock 或跳過
    test.skip(!process.env.HAS_MODEL_FILES, '需要模型檔案');
    
    // 1. 開啟相機/選擇測試圖片
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('tests/fixtures/test-pills.jpg');
    
    // 2. 等待 Encoder 完成
    await expect(page.locator('text=AI 模型分析中')).toBeHidden({ timeout: 30000 });
    
    // 3. 在 Canvas 上點擊 3 次
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 100, y: 100 } });
    await canvas.click({ position: { x: 200, y: 200 } });
    await canvas.click({ position: { x: 300, y: 150 } });
    
    // 4. 驗證計數顯示
    await expect(page.locator('text=AI 偵測顆粒數')).toBeVisible();
    await expect(page.locator('text=3')).toBeVisible();
  });

  test('右鍵點擊現有 Mask 可刪除 (負向點擊)', async ({ page }) => {
    test.skip(!process.env.HAS_MODEL_FILES, '需要模型檔案');
    
    // 先點擊建立幾個 Mask
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 100, y: 100 } });
    await canvas.click({ position: { x: 200, y: 200 } });
    
    // 右鍵點擊第一個 Mask 位置
    await canvas.click({ position: { x: 100, y: 100 }, button: 'right' });
    
    // 驗證計數減少
    await expect(page.locator('text=1')).toBeVisible();
  });

  test('Undo/Redo 功能正常', async ({ page }) => {
    test.skip(!process.env.HAS_MODEL_FILES, '需要模型檔案');
    
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 100, y: 100 } });
    await expect(page.locator('text=1')).toBeVisible();
    
    // 點擊復原
    await page.click('button:has-text("復原")');
    await expect(page.locator('text=0')).toBeVisible();
  });

  test('採用 AI 結果 → 關閉 Modal 並更新數量', async ({ page }) => {
    test.skip(!process.env.HAS_MODEL_FILES, '需要模型檔案');
    
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 100, y: 100 } });
    await canvas.click({ position: { x: 200, y: 200 } });
    
    // 點擊採用 AI 結果
    await page.click('button:has-text("採用 AI 結果")');
    
    // 驗證 Modal 關閉且數量更新
    await expect(page.locator('[data-drug-id]')).toContainText('2');
  });
});