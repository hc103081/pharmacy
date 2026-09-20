# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: refactor-smoke.spec.ts >> 重構驗收 Smoke 測試 >> /scan 掃描頁面能載入並處理缺少 manifestId 情境（重構：useScanKeyboard）
- Location: tests\e2e\refactor-smoke.spec.ts:106:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('body')
Expected: visible
Received: hidden
Timeout:  20000ms

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for locator('body')
    43 × locator resolved to <body></body>
       - unexpected value "hidden"

```

# Test source

```ts
  12  |  */
  13  | 
  14  | // 收集頁面錯誤
  15  | function collectPageErrors(page: import('@playwright/test').Page) {
  16  |   const errors: string[] = [];
  17  |   page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  18  |   page.on('console', (msg) => {
  19  |     if (msg.type() === 'error') {
  20  |       // 忽略 Supabase/網路相關預期錯誤（無網路或未登入時會出現）
  21  |       const text = msg.text();
  22  |       if (
  23  |         text.includes('supabase') ||
  24  |         text.includes('Failed to fetch') ||
  25  |         text.includes('NetworkError') ||
  26  |         text.includes('ERR_') ||
  27  |         text.includes('401') ||
  28  |         text.includes('403') ||
  29  |         text.includes('fetch') ||
  30  |         text.includes('Auth')
  31  |       ) {
  32  |         return;
  33  |       }
  34  |       errors.push(`console.error: ${text}`);
  35  |     }
  36  |   });
  37  |   return errors;
  38  | }
  39  | 
  40  | test.describe('重構驗收 Smoke 測試', () => {
  41  |   test('首頁能正常載入（未登入顯示 Magic Link 登入或導覽卡片）', async ({ page }) => {
  42  |     const errors = collectPageErrors(page);
  43  |     await page.goto('/');
  44  | 
  45  |     // 驗證品牌標題（無論登入與否都會出現）
  46  |     await expect(page.locator('text=PhamaCount')).toBeVisible({ timeout: 15000 });
  47  | 
  48  |     // 未登入時顯示 Magic Link 登入表單；登入時顯示導覽卡片
  49  |     // 二者任一出現即代表首頁正常 render
  50  |     const magicLink = page.locator('button:has-text("Magic Link"), button:has-text("發送")');
  51  |     const importCard = page.locator('a[href="/import"]');
  52  |     const manifestsCard = page.locator('a[href="/manifests"]');
  53  |     await Promise.race([
  54  |       magicLink.first().waitFor({ state: 'visible', timeout: 10000 }),
  55  |       importCard.first().waitFor({ state: 'visible', timeout: 10000 }),
  56  |     ]).catch(() => {});
  57  |     // 至少品牌標題已驗證，且 body 有實質內容
  58  |     const bodyText = await page.locator('body').innerText();
  59  |     expect(bodyText.length).toBeGreaterThan(0);
  60  | 
  61  |     // 不應有未捕獲的頁面錯誤
  62  |     await page.waitForLoadState('networkidle');
  63  |     expect(errors, `Unexpected errors: ${errors.join('\n')}`).toEqual([]);
  64  | 
  65  |     // 若已登入看到導覽卡片，則 manifests 連結也應可見
  66  |     const importVisible = await importCard.first().isVisible().catch(() => false);
  67  |     if (importVisible) {
  68  |       await expect(manifestsCard).toBeVisible();
  69  |     }
  70  |   });
  71  | 
  72  |   test('/import 匯入頁面能載入（重構：ImportOverlay + ImportProgressBar）', async ({ page }) => {
  73  |     const errors = collectPageErrors(page);
  74  |     await page.goto('/import');
  75  | 
  76  |     // 等待頁面主要區塊載入（清單名稱輸入框或匯入按鈕）
  77  |     await expect(page.locator('body')).toBeVisible({ timeout: 20000 });
  78  |     await page.waitForLoadState('networkidle');
  79  | 
  80  |     // 頁面應正常 function：找到任一關鍵文字
  81  |     const hasImportUI = await page
  82  |       .locator('text=/匯入|清單|上傳|拖曳|檔案|PDF/i')
  83  |       .first()
  84  |       .isVisible()
  85  |       .catch(() => false);
  86  |     expect(hasImportUI || (await page.content() !== '')).toBeTruthy();
  87  | 
  88  |     expect(errors, `Unexpected errors: ${errors.join('\n')}`).toEqual([]);
  89  |   });
  90  | 
  91  |   test('/manifests 清單頁面能載入（重構：useManifestOperations + DeleteConfirmDialog + OperationProgressModal）', async ({ page }) => {
  92  |     const errors = collectPageErrors(page);
  93  |     await page.goto('/manifests');
  94  | 
  95  |     await expect(page.locator('body')).toBeVisible({ timeout: 20000 });
  96  |     await page.waitForLoadState('networkidle');
  97  | 
  98  |     // 頁面應載入而不崩潰
  99  |     const bodyText = await page.locator('body').innerText();
  100 |     // 應看到清單相關文字（即使為空也已正確 render）
  101 |     expect(["封存", "清單", "清點", "暫無", "匯入", "開始", "manifest", "藥局", "藥品"].some(kw => bodyText.includes(kw))).toBeTruthy();
  102 | 
  103 |     expect(errors, `Unexpected errors: ${errors.join('\n')}`).toEqual([]);
  104 |   });
  105 | 
  106 |   test('/scan 掃描頁面能載入並處理缺少 manifestId 情境（重構：useScanKeyboard）', async ({ page }) => {
  107 |     const errors = collectPageErrors(page);
  108 | 
  109 |     // 不帶 manifestId，頁面應能顯示提示而非崩潰
  110 |     await page.goto('/scan');
  111 | 
> 112 |     await expect(page.locator('body')).toBeVisible({ timeout: 20000 });
      |                                        ^ Error: expect(locator).toBeVisible() failed
  113 |     await page.waitForLoadState('networkidle');
  114 | 
  115 |     // 頁面不應白屏：body 應有內容
  116 |     const bodyText = await page.locator('body').innerText();
  117 |     expect(bodyText.length).toBeGreaterThan(0);
  118 | 
  119 |     expect(errors, `Unexpected errors: ${errors.join('\n')}`).toEqual([]);
  120 |   });
  121 | 
  122 |   test('直接導覽至重構後的路由可正常載入（含未登入保護轉址）', async ({ page }) => {
  123 |     // 首頁未登入時不顯示導覽卡片；且 /import、/manifests 等可能被保護轉址到 /login。
  124 |     // 本測試只驗證：每個路由 goto 後頁面能正常 render，不會白屏或丟出 pageerror。
  125 |     const errors = collectPageErrors(page);
  126 | 
  127 |     for (const path of ['/import', '/manifests', '/scan']) {
  128 |       await page.goto(path);
  129 |       await expect(page.locator('body')).toBeVisible({ timeout: 20000 });
  130 |       await page.waitForLoadState('networkidle');
  131 |       // 頁面 body 應有實質內容（無論是 /import 本身或被轉到 /login）
  132 |       const bodyText = await page.locator('body').innerText();
  133 |       expect(bodyText.length, `${path} rendered empty body`).toBeGreaterThan(0);
  134 |       expect(errors, `${path} errors: ${errors.join('\n')}`).toEqual([]);
  135 |     }
  136 |   });
  137 | });
  138 | 
```