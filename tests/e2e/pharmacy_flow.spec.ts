
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('PhamaCount Web Full Flow', () => {
  const BASE_URL = 'http://localhost:3000';
  let manifestId = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/import`);
    await page.fill('input[placeholder*="例如:"]', 'E2E Setup Manifest');
    
    const mockDrugs = Array.from({ length: 50 }, (_, i) => ({
      barcode: `BC${i + 1}`,
      name: `Drug ${i + 1}`,
      expected_quantity: 10
    }));
    await page.fill('textarea', JSON.stringify(mockDrugs, null, 2));
    await page.click('button:has-text("立即匯入並分頁")');
    
    await expect(page.locator('text=匯入成功')).toBeVisible();
    const successMessage = await page.locator('text=匯入成功').textContent();
    const idMatch = successMessage?.match(/清單 ID: ([a-z0-9-]+)/);
    manifestId = idMatch ? idMatch[1] : '';
    await page.close();
  });

  test('Complete flow: Import -> Scan -> Summary -> Archive', async ({ page }) => {
    // 2. Scan Phase
    await page.goto(`${BASE_URL}/scan?manifestId=${manifestId}`);
    
    const barcodeInput = page.locator('input[placeholder*="掃描或輸入條碼"]');
    await barcodeInput.fill('BC1'); 
    await expect(page.locator('text=匹配成功!')).toBeVisible();
    
    const qtyInput = page.locator('input[type="number"]');
    await qtyInput.fill('10'); 
    
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("拍照確認")');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.join(__dirname, 'test-photo.jpg'));
    
    // Verify it becomes completed by checking opacity or the checkmark icon
    await expect(page.locator('.tech-card').first()).toHaveClass(/opacity-40 grayscale/);

    // 3. Summary Phase
    await page.goto(`${BASE_URL}/summary/${manifestId}`);
    await expect(page.locator('text=清點總結報告')).toBeVisible();
    
    await page.click('button:has-text("確認封存清單")');
    page.on('dialog', dialog => dialog.accept());
    await page.waitForURL(/.*manifests.*/);
  });

  test('Smart Jump functionality', async ({ page }) => {
    await page.goto(`${BASE_URL}/scan?manifestId=${manifestId}`);
    
    const barcodeInput = page.locator('input[placeholder*="掃描或輸入條碼"]');
    await barcodeInput.fill('BC45'); // Page 2
    
    await expect(page.locator('text=發現藥品在其他分頁')).toBeVisible();
    await page.click('button:has-text("跳轉至該頁")');
    await expect(page.locator('text=第 2 頁')).toBeVisible();
  });
});
