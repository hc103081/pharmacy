# 藥局智能清點系統 - 測試架構與最佳實踐

## 📋 概述

本文檔詳細說明了藥局智能清點系統 (PhamaCount Web) 的完整測試架構、設計原則和最佳實踐。測試架構採用現代化的 E2E (End-to-End) 測試策略，確保系統的各個層面都得到充分驗證。

## 🏗️ 測試架構總覽

### 測試層次結構
```
📁 tests/
├── 📁 e2e/                          # E2E 測試
│   ├── auth.setup.ts               # 認證設置（測試前置條件）
│   ├── fixtures/                    # 測試夾具
│   │   └── auth-fixture.ts         # 認證夾具
│   ├── simple-query-test.spec.ts    # 簡化查詢測試
│   ├── query-ui-comprehensive.spec.ts # 綜合 UI 測試
│   ├── query-rpc-fixed-test.spec.ts  # RPC 功能測試
│   ├── query-real-test.spec.ts      # 真實數據測試
│   ├── query-final-verification.spec.ts # 最終驗證測試
│   └── debug-tabs.spec.ts          # 調試測試
├── 📁 unit/                        # 單元測試（待實現）
└── 📁 integration/                 # 整合測試（待實現）
```

### 核心測試技術棧
- **Playwright** - E2E 測試框架
- **Supabase** - 資料庫測試數據
- **Next.js** - 測試環境設置
- **TypeScript** - 測試類型安全

## 🔧 測試環境配置

### 1. 開發環境設置
```bash
# 安裝依賴
npm install

# 啟動開發服務器
npm run dev

# 運行測試
npm test
```

### 2. 測試環境變數
```env
# 測試環境變數 (.env.local)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
TEST_USER_EMAIL=test-user@pharmacy.local
TEST_USER_PASSWORD=TestPassword123!
NODE_ENV=test
```

### 3. 測試數據庫
```sql
-- 測試數據腳本
-- scripts/seed-test-data.ts
-- 包含 3 個清單、12 筆藥品項目、跨清單歷史數據
```

## 🎯 測試策略

### 1. 認證測試策略
```typescript
// auth.setup.ts - 認證設置
setup('authenticate via test API and save storage state', async ({ page }) => {
  const response = await page.request.post('/api/test-auth/login', { data: TEST_USER });
  expect(response.ok()).toBe(true);
  await page.goto('/query');
  await page.waitForLoadState('networkidle');
  const bodyText = await page.locator('body').textContent();
  expect(bodyText).not.toContain('請先登入');
  await page.context().storageState({ path: 'tests/e2e/auth-state.json' });
});
```

**設計原則：**
- 使用 API 登入而非手動構造 JWT
- 設置正確的 SSR cookies
- 驗證認證後頁面正常載入

### 2. UI 測試策略
```typescript
// query-ui-comprehensive.spec.ts - 綜合 UI 測試
test('Basic UI elements visible', async ({ page }) => {
  await expect(page.locator('button[role="tab"]:has-text("藥品搜尋")')).toBeVisible();
  await expect(page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first()).toBeVisible();
  await checkResultsVisible(page);
});
```

**設計原則：**
- 測試真實用戶交互流程
- 驗證 UI 元素的可見性和功能性
- 覆蓋多種螢幕尺寸和設備

### 3. 功能測試策略
```typescript
// query-rpc-fixed-test.spec.ts - RPC 功能測試
test('跨清單查詢功能', async ({ page }) => {
  const response = await page.request.post('/api/query/search', {
    data: { searchText: '阿司匹林' }
  });
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect(data.length).toBeGreaterThan(0);
});
```

**設計原則：**
- 測試 API 端點的完整功能
- 驗證數據聚合和排序邏輯
- 測試各種篩選組合

## 📊 測試覆蓋率

### 當前覆蓋率
- **E2E 測試**: 25/25 測試通過 (100%)
- **功能覆蓋**: 查詢、篩選、排序、匯出、響應式設計
- **設備覆蓋**: 桌面、平板、手機
- **環境覆蓋**: 開發、測試、認證環境

### 測試分類
| 測試類別 | 測試數量 | 通過率 | 說明 |
|---------|---------|--------|------|
| 基本功能測試 | 6 | 100% | UI 元素、搜尋、Tab 切換 |
| 響應式設計測試 | 3 | 100% | 多設備尺寸測試 |
| 左側面板篩測試 | 3 | 100% | 篩選功能測試 |
| 認證測試 | 1 | 100% | 登入流程測試 |
| 綜合功能測試 | 12 | 100% | 完整功能流程測試 |

## 🛠️ 最佳實踐

### 1. 測試命名規範
```typescript
// ✅ 好的測試命名
test('Keyword search works', async ({ page }) => {
  // 測試邏輯
});

// ❌ 避免的測試命名
test('test search', async ({ page }) => {
  // 測試邏輯
});
```

### 2. 選擇器使用規範
```typescript
// ✅ 使用明確的選擇器
await expect(page.locator('button[role="tab"]:has-text("藥品搜尋")')).toBeVisible();

// ❌ 避免模糊的選擇器
await expect(page.locator('button').first()).toBeVisible();
```

### 3. 錯誤處理
```typescript
// ✅ 正確的錯誤收集
const errors = collectPageErrors(page);
expect(errors, `Unexpected errors: ${errors.join('\n')}`).toEqual([]);

// ❌ 避免直接忽略錯誤
// await page.click('button'); // 沒有錯誤處理
```

### 4. 等待策略
```typescript
// ✅ 使用適當的等待策略
await expect(page.locator('button')).toBeVisible({ timeout: 10000 });
await page.waitForLoadState('networkidle');

// ❌ 避免硬編碼等待
// await page.waitForTimeout(5000);
```

### 5. 測試數據管理
```typescript
// ✅ 使用測試數據腳本
// scripts/seed-test-data.ts
// 包含完整的測試數據集

// ❌ 避免在測試中硬編碼數據
// await page.fill('input', '阿司匹林'); // 應該從測試數據中讀取
```

## 🔍 調試技巧

### 1. 測試失敗調試
```typescript
// ✅ 使用 headed 模式進行調試
npx playwright test tests/e2e/query-ui-comprehensive.spec.ts --headed

// ✅ 使用 grep 過濾特定測試
npx playwright test --grep "Export button"

// ✅ 查看測試失敗截圖
// test-results/.../test-failed-1.png
```

### 2. 頁面元素檢查
```typescript
// ✅ 使用瀏覽器開發者工具檢查元素
// 開啟瀏覽器控制台查看頁面結構
// 使用 Playwright 的 inspect 功能
```

### 3. 網路請求監控
```typescript
// ✅ 監控網路請求
page.on('request', request => {
  console.log('Request:', request.url());
});

page.on('response', response => {
  console.log('Response:', response.url(), response.status());
});
```

## 🚀 性能優化

### 1. 測試並行化
```bash
# ✅ 使用多 worker 並行運行測試
npx playwright test --workers=4

# ✅ 運行特定測試文件
npx playwright test tests/e2e/query-ui-comprehensive.spec.ts
```

### 2. 測試快取
```typescript
// ✅ 使用 storageState 減少重複登入
await page.context().storageState({ path: 'auth-state.json' });

// ✅ 使用 fixtures 共享測試狀態
export const authenticated = fixtures.setupAuth();
```

### 3. 測試數據重用
```typescript
// ✅ 使用測試數據腳本生成數據
// scripts/seed-test-data.ts
// 避免在每個測試中重複創建數據
```

## 📈 持續改進

### 1. 測試監控
- 定期檢查測試通過率
- 監控測試執行時間
- 跟踪測試覆蓋率變化

### 2. 測試維護
- 定期更新測試以適應 UI 變更
- 添加新功能的測試
- 移除過時的測試

### 3. 文檔更新
- 更新測試文檔以反映架構變更
- 添加新的最佳實踐
- 記錄測試決策的背後原因

## 🎯 未來改進方向

### 短期改進
1. **增加單元測試** - 為核心函數添加單元測試
2. **整合測試** - 添加 API 整合測試
3. **性能測試** - 添加頁面載入性能測試

### 長期改進
1. **自動化測試報告** - 集成測試報告生成
2. **CI/CD 集成** - 自動化測試執行
3. **測試數據管理** - 建立測試數據版本控制

## 🔗 相關資源

- [Playwright 官方文檔](https://playwright.dev/)
- [Supabase 測試指南](https://supabase.com/docs/guides/testing)
- [Next.js 測試最佳實踐](https://nextjs.org/docs/app/building-your-application/testing)
- [TypeScript 測試模式](https://www.typescriptlang.org/docs/handbook/testing.html)

---

*最後更新: 2026-10-25*  
*版本: 1.0*  
**維護者: PhamaCount Web 開發團隊**