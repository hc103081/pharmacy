import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('PhamaCount Web Full Flow', () => {
  const BASE_URL = 'http://localhost:3000';
  let manifestId = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/import`);
    await page.fill('input[placeholder*="例如:"]', 'E2E Setup Manifest');

    const mockDrugs = Array.from({ length: 88 }, (_, i) => ({
      barcode: `BC${String(i + 1).padStart(3, '0')}`,
      name: `測試藥品 ${i + 1}`,
      expected_quantity: 10,
    }));
    await page.fill('textarea', JSON.stringify(mockDrugs, null, 2));
    await page.click('button:has-text("立即匯入並分頁")');

    await expect(page.locator('text=匯入成功')).toBeVisible({ timeout: 10000 });

    // 從成功訊息中擷取 manifestId（格式：匯入成功！共匯入 88 項藥品...後續跳轉 URL 中有）
    const url = await page.evaluate(() => window.location.href);
    const idMatch = url.match(/manifestId=([a-z0-9-]+)/);
    manifestId = idMatch ? idMatch[1] : '';

    // 等待自動跳轉到掃描頁
    await page.waitForURL(/.*scan.*/, { timeout: 10000 });
    await page.close();
  });

  test('Complete flow: Import -> Scan -> Summary -> Archive', async ({ page }) => {
    expect(manifestId).toBeTruthy();

    // 2. Scan Phase
    await page.goto(`${BASE_URL}/scan?manifestId=${manifestId}`);

    const barcodeInput = page.locator('input[placeholder*="掃描或輸入條碼"]');
    await barcodeInput.fill('BC001');

    // 檢查匹配效果：卡片邊框變亮（匹配成功）
    await expect(page.locator('.border-\\[\\#00f2fe\\]').first()).toBeVisible({ timeout: 5000 });

    // 點擊「正確」按鈕觸發拍照
    await page.click('button:has-text("正確")');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("拍照確認")');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, 'test-photo.jpg'));

    // 完成後卡片應變為 completed（opacity-40 grayscale）
    await expect(page.locator('[data-drug-id]').first()).toHaveClass(/opacity-40 grayscale/, { timeout: 10000 });

    // 切換到第 2 頁驗證分頁導覽
    await page.click('button[title="下一頁"] span, button:has(svg.lucide-chevron-right)');
    // 使用輸入框確認在第 2 頁
    await expect(page.locator('input[title*="頁碼"]')).toHaveValue('2');

    // 3. Summary Phase
    await page.goto(`${BASE_URL}/summary/${manifestId}`);
    await expect(page.locator('text=清點總結報告')).toBeVisible();

    // 點擊封存
    await page.click('button:has-text("確認封存清單")');
    page.on('dialog', (dialog) => dialog.accept());
    await page.waitForURL(/.*manifests.*/);
  });

  test('Smart Jump functionality', async ({ page }) => {
    expect(manifestId).toBeTruthy();

    await page.goto(`${BASE_URL}/scan?manifestId=${manifestId}`);

    const barcodeInput = page.locator('input[placeholder*="掃描或輸入條碼"]');
    // BC045 在第 2 頁（item 45-88）
    await barcodeInput.fill('BC045');

    await expect(page.locator('text=發現藥品在其他分頁')).toBeVisible({ timeout: 5000 });
    await page.click('button:has-text("跳轉至該頁")');

    // 驗證已跳轉到第 2 頁
    await expect(page.locator('input[title*="頁碼"]')).toHaveValue('2');
  });
});