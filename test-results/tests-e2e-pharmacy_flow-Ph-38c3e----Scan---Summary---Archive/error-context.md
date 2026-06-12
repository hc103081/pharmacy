# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\e2e\pharmacy_flow.spec.ts >> PhamaCount Web Full Flow >> Complete flow: Import -> Scan -> Summary -> Archive
- Location: tests\e2e\pharmacy_flow.spec.ts:29:7

# Error details

```
Error: expect(locator).toHaveClass(expected) failed

Locator: locator('.tech-card').first()
Expected pattern: /opacity-40 grayscale/
Received string:  "tech-card p-4 transition-all flex flex-col gap-4 border-[#00f2fe] shadow-[0_0_20px_rgba(0,242,254,0.2)] scale-[1.02] z-10  "
Timeout: 5000ms

Call log:
  - Expect "toHaveClass" with timeout 5000ms
  - waiting for locator('.tech-card').first()
    14 × locator resolved to <div class="tech-card p-4 transition-all flex flex-col gap-4 border-[#00f2fe] shadow-[0_0_20px_rgba(0,242,254,0.2)] scale-[1.02] z-10  ">…</div>
       - unexpected value "tech-card p-4 transition-all flex flex-col gap-4 border-[#00f2fe] shadow-[0_0_20px_rgba(0,242,254,0.2)] scale-[1.02] z-10  "

```

```yaml
- text: "1 Drug 1 BC1 | 預期: 10 數量:"
- spinbutton: "10"
- button "拍照確認"
```

# Test source

```ts
  1  | 
  2  | import { test, expect } from '@playwright/test';
  3  | import path from 'path';
  4  | 
  5  | test.describe('PhamaCount Web Full Flow', () => {
  6  |   const BASE_URL = 'http://localhost:3000';
  7  |   let manifestId = '';
  8  | 
  9  |   test.beforeAll(async ({ browser }) => {
  10 |     const page = await browser.newPage();
  11 |     await page.goto(`${BASE_URL}/import`);
  12 |     await page.fill('input[placeholder*="例如:"]', 'E2E Setup Manifest');
  13 |     
  14 |     const mockDrugs = Array.from({ length: 50 }, (_, i) => ({
  15 |       barcode: `BC${i + 1}`,
  16 |       name: `Drug ${i + 1}`,
  17 |       expected_quantity: 10
  18 |     }));
  19 |     await page.fill('textarea', JSON.stringify(mockDrugs, null, 2));
  20 |     await page.click('button:has-text("立即匯入並分頁")');
  21 |     
  22 |     await expect(page.locator('text=匯入成功')).toBeVisible();
  23 |     const successMessage = await page.locator('text=匯入成功').textContent();
  24 |     const idMatch = successMessage?.match(/清單 ID: ([a-z0-9-]+)/);
  25 |     manifestId = idMatch ? idMatch[1] : '';
  26 |     await page.close();
  27 |   });
  28 | 
  29 |   test('Complete flow: Import -> Scan -> Summary -> Archive', async ({ page }) => {
  30 |     // 2. Scan Phase
  31 |     await page.goto(`${BASE_URL}/scan?manifestId=${manifestId}`);
  32 |     
  33 |     const barcodeInput = page.locator('input[placeholder*="掃描或輸入條碼"]');
  34 |     await barcodeInput.fill('BC1'); 
  35 |     await expect(page.locator('text=匹配成功!')).toBeVisible();
  36 |     
  37 |     const qtyInput = page.locator('input[type="number"]');
  38 |     await qtyInput.fill('10'); 
  39 |     
  40 |     const fileChooserPromise = page.waitForEvent('filechooser');
  41 |     await page.click('button:has-text("拍照確認")');
  42 |     const fileChooser = await fileChooserPromise;
  43 |     await fileChooser.setFiles(path.join(__dirname, 'test-photo.jpg'));
  44 |     
  45 |     // Verify it becomes completed by checking opacity or the checkmark icon
> 46 |     await expect(page.locator('.tech-card').first()).toHaveClass(/opacity-40 grayscale/);
     |                                                      ^ Error: expect(locator).toHaveClass(expected) failed
  47 | 
  48 |     // 3. Summary Phase
  49 |     await page.goto(`${BASE_URL}/summary/${manifestId}`);
  50 |     await expect(page.locator('text=清點總結報告')).toBeVisible();
  51 |     
  52 |     await page.click('button:has-text("確認封存清單")');
  53 |     page.on('dialog', dialog => dialog.accept());
  54 |     await page.waitForURL(/.*manifests.*/);
  55 |   });
  56 | 
  57 |   test('Smart Jump functionality', async ({ page }) => {
  58 |     await page.goto(`${BASE_URL}/scan?manifestId=${manifestId}`);
  59 |     
  60 |     const barcodeInput = page.locator('input[placeholder*="掃描或輸入條碼"]');
  61 |     await barcodeInput.fill('BC45'); // Page 2
  62 |     
  63 |     await expect(page.locator('text=發現藥品在其他分頁')).toBeVisible();
  64 |     await page.click('button:has-text("跳轉至該頁")');
  65 |     await expect(page.locator('text=第 2 頁')).toBeVisible();
  66 |   });
  67 | });
  68 | 
```