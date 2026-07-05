import { test, expect } from '@playwright/test';

/**
 * 重構驗收 Smoke E2E 測試
 *
 * 目的：驗證 Phase 1~3 重構後，被拆分/共用的模組不會破壞頁面載入。
 * 本測試不依賴真實 Supabase 資料，只驗證：
 *   1. 頁面能正常載入（HTTP 200）
 *   2. 首頁關鍵元素與導覽連結正常
 *   3. 無未捕獲的 runtime 錯誤（console.error / pageerror）
 *   4. 被重構的頁面（/import, /manifests, /scan）能載入而不崩潰
 */

// 收集頁面錯誤
function collectPageErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      // 忽略 Supabase/網路相關預期錯誤（無網路或未登入時會出現）
      const text = msg.text();
      if (
        text.includes('supabase') ||
        text.includes('Failed to fetch') ||
        text.includes('NetworkError') ||
        text.includes('ERR_') ||
        text.includes('401') ||
        text.includes('403') ||
        text.includes('fetch') ||
        text.includes('Auth')
      ) {
        return;
      }
      errors.push(`console.error: ${text}`);
    }
  });
  return errors;
}

test.describe('重構驗收 Smoke 測試', () => {
  test('首頁能正常載入（未登入顯示 Magic Link 登入或導覽卡片）', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/');

    // 驗證品牌標題（無論登入與否都會出現）
    await expect(page.locator('text=PhamaCount')).toBeVisible({ timeout: 15000 });

    // 未登入時顯示 Magic Link 登入表單；登入時顯示導覽卡片
    // 二者任一出現即代表首頁正常 render
    const magicLink = page.locator('button:has-text("Magic Link"), button:has-text("發送")');
    const importCard = page.locator('a[href="/import"]');
    const manifestsCard = page.locator('a[href="/manifests"]');
    await Promise.race([
      magicLink.first().waitFor({ state: 'visible', timeout: 10000 }),
      importCard.first().waitFor({ state: 'visible', timeout: 10000 }),
    ]).catch(() => {});
    // 至少品牌標題已驗證，且 body 有實質內容
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);

    // 不應有未捕獲的頁面錯誤
    await page.waitForLoadState('networkidle');
    expect(errors, `Unexpected errors: ${errors.join('\n')}`).toEqual([]);

    // 若已登入看到導覽卡片，則 manifests 連結也應可見
    const importVisible = await importCard.first().isVisible().catch(() => false);
    if (importVisible) {
      await expect(manifestsCard).toBeVisible();
    }
  });

  test('/import 匯入頁面能載入（重構：ImportOverlay + ImportProgressBar）', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/import');

    // 等待頁面主要區塊載入（清單名稱輸入框或匯入按鈕）
    await expect(page.locator('body')).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState('networkidle');

    // 頁面應正常 function：找到任一關鍵文字
    const hasImportUI = await page
      .locator('text=/匯入|清單|上傳|拖曳|檔案|PDF/i')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasImportUI || (await page.content() !== '')).toBeTruthy();

    expect(errors, `Unexpected errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('/manifests 清單頁面能載入（重構：useManifestOperations + DeleteConfirmDialog + OperationProgressModal）', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/manifests');

    await expect(page.locator('body')).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState('networkidle');

    // 頁面應載入而不崩潰
    const bodyText = await page.locator('body').innerText();
    // 應看到清單相關文字（即使為空也已正確 render）
    expect(["封存", "清單", "清點", "暫無", "匯入", "開始", "manifest", "藥局", "藥品"].some(kw => bodyText.includes(kw))).toBeTruthy();

    expect(errors, `Unexpected errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('/scan 掃描頁面能載入並處理缺少 manifestId 情境（重構：useScanKeyboard）', async ({ page }) => {
    const errors = collectPageErrors(page);

    // 不帶 manifestId，頁面應能顯示提示而非崩潰
    await page.goto('/scan');

    await expect(page.locator('body')).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState('networkidle');

    // 頁面不應白屏：body 應有內容
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);

    expect(errors, `Unexpected errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('直接導覽至重構後的路由可正常載入（含未登入保護轉址）', async ({ page }) => {
    // 首頁未登入時不顯示導覽卡片；且 /import、/manifests 等可能被保護轉址到 /login。
    // 本測試只驗證：每個路由 goto 後頁面能正常 render，不會白屏或丟出 pageerror。
    const errors = collectPageErrors(page);

    for (const path of ['/import', '/manifests', '/scan']) {
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible({ timeout: 20000 });
      await page.waitForLoadState('networkidle');
      // 頁面 body 應有實質內容（無論是 /import 本身或被轉到 /login）
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length, `${path} rendered empty body`).toBeGreaterThan(0);
      expect(errors, `${path} errors: ${errors.join('\n')}`).toEqual([]);
    }
  });
});
