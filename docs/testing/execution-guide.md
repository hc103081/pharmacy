# 測試執行指南

## 🚀 快速開始

### 1. 環境準備
```bash
# 確保所有依賴已安裝
npm install

# 啟動開發服務器
npm run dev
```

### 2. 運行所有測試
```bash
# 運行所有 E2E 測試
npm test

# 或使用 Playwright 直接運行
npx playwright test
```

### 3. 運行特定測試
```bash
# 運行綜合 UI 測試
npx playwright test tests/e2e/query-ui-comprehensive.spec.ts

# 運行簡化查詢測試
npx playwright test tests/e2e/simple-query-test.spec.ts

# 運行 RPC 功能測試
npx playwright test tests/e2e/query-rpc-fixed-test.spec.ts
```

## 📋 測試類型說明

### 1. 認證測試 (`auth.setup.ts`)
```bash
# 僅運行認證設置
npx playwright test tests/e2e/auth.setup.ts
```
**說明**: 設置測試認證狀態，為其他測試提供前置條件。

### 2. 綜合 UI 測試 (`query-ui-comprehensive.spec.ts`)
```bash
# 運行綜合 UI 測試
npx playwright test tests/e2e/query-ui-comprehensive.spec.ts
```
**說明**: 測試完整的 UI 功能，包括基本元素、搜尋、Tab 切換、篩選、匯出等。

### 3. 簡化查詢測試 (`simple-query-test.spec.ts`)
```bash
# 運行簡化查詢測試
npx playwright test tests/e2e/simple-query-test.spec.ts
```
**說明**: 基本的頁面結構和元素測試，用於快速驗證。

### 4. RPC 功能測試 (`query-rpc-fixed-test.spec.ts`)
```bash
# 運行 RPC 功能測試
npx playwright test tests/e2e/query-rpc-fixed-test.spec.ts
```
**說明**: 測試後端 RPC 函數的功能和數據處理。

### 5. 最終驗證測試 (`query-final-verification.spec.ts`)
```bash
# 運行最終驗證測試
npx playwright test tests/e2e/query-final-verification.spec.ts
```
**說明**: 資料庫層的最終驗證，確保數據完整性。

## 🔧 測試選項

### 1. 調試模式
```bash
# 使用 headed 模式（可見瀏覽器）
npx playwright test --headed

# 運行特定測試並顯示瀏覽器
npx playwright test tests/e2e/query-ui-comprehensive.spec.ts --headed
```

### 2. 測試過濾
```bash
# 按測試名稱過濾
npx playwright test --grep "Export button"

# 按文件過濾
npx playwright test tests/e2e/query-ui-comprehensive.spec.ts

# 按標籤過濾
npx playwright test --grep "Responsive Design"
```

### 3. 並行執行
```bash
# 使用多 worker 並行運行
npx playwright test --workers=4

# 限制 worker 數量
npx playwright test --workers=2
```

### 4. 重試失敗測試
```bash
# 自動重試失敗的測試
npx playwright test --retries=2
```

## 📊 測試結果

### 1. 查看測試報告
```bash
# 打開測試報告
npx playwright show-report

# 或在瀏覽器中打開
# test-results/index.html
```

### 2. 查看詳細錯誤
```bash
# 查看特定測試的錯誤詳情
# test-results/測試文件名/測試名稱/error-context.md
```

### 3. 截圖分析
```bash
# 查看測試失敗截圖
# test-results/測試文件名/測試名稱/test-failed-1.png
```

## 🔍 常見問題排除

### 1. 測試失敗 - 認證問題
```bash
# 重新運行認證設置
npx playwright test tests/e2e/auth.setup.ts

# 檢查認證狀態文件
cat tests/e2e/auth-state.json
```

### 2. 測試失敗 - 元素找不到
```bash
# 使用 headed 模式檢查頁面
npx playwright test --headed

# 檢查頁面結構
# 打開瀏覽器開發者工具檢查元素
```

### 3. 測試失敗 - 網路請求失敗
```bash
# 檢查開發服務器是否運行
npm run dev

# 檢查網路請求日誌
# 在測試中添加網路監控
```

### 4. 測試失敗 - 數據問題
```bash
# 重新生成測試數據
npm run seed-test-data

# 檢查測試數據腳本
cat scripts/seed-test-data.ts
```

## 🛠️ 自動化腳本

### 1. 完整測試流程
```bash
#!/bin/bash
# scripts/run-full-test.sh

echo "🚀 開始完整測試流程..."

# 1. 啟動開發服務器
npm run dev &
DEV_SERVER_PID=$!

# 等待服務器啟動
sleep 10

# 2. 運行測試
echo "🧪 運行測試..."
npx playwright test

# 3. 停止開發服務器
kill $DEV_SERVER_PID

echo "✅ 測試完成"
```

### 2. 快速驗證
```bash
#!/bin/bash
# scripts/quick-check.sh

echo "⚡ 快速驗證..."

# 運行關鍵測試
npx playwright test tests/e2e/auth.setup.ts
npx playwright test tests/e2e/simple-query-test.spec.ts

echo "✅ 快速驗證完成"
```

### 3. 測試報告生成
```bash
#!/bin/bash
# scripts/generate-report.sh

echo "📊 生成測試報告..."

# 運行測試並生成報告
npx playwright test --reporter=list

echo "📋 測試報告已生成"
```

## 📈 測試監控

### 1. 測試執行時間監控
```bash
# 監控測試執行時間
npx playwright test --reporter=list | grep -E "(Time|seconds)"

# 或使用詳細模式
npx playwright test --reporter=dot
```

### 2. 測試通過率監控
```bash
# 計算測試通過率
TOTAL_TESTS=$(npx playwright test --reporter=list | grep "passed" | wc -l)
echo "通過的測試數量: $TOTAL_TESTS"
```

### 3. 測試失敗分析
```bash
# 分析失敗測試
npx playwright test --reporter=list | grep "failed"

# 查看失敗詳情
ls test-results/*/test-failed-*.png
```

## 🎯 測試最佳實踐

### 1. 測試執行順序
```bash
# 建議的測試執行順序
1. auth.setup.ts (認證設置)
2. simple-query-test.spec.ts (基本功能)
3. query-ui-comprehensive.spec.ts (綜合功能)
4. query-rpc-fixed-test.spec.ts (後端功能)
5. query-final-verification.spec.ts (最終驗證)
```

### 2. 測試環境管理
```bash
# 清理測試環境
rm -rf test-results/
rm -f tests/e2e/auth-state.json

# 重新生成測試數據
npm run seed-test-data
```

### 3. 測試數據管理
```bash
# 檢查測試數據
cat scripts/seed-test-data.ts

# 重新生成測試數據
npm run seed-test-data
```

## 🔗 相關資源

- [測試架構文檔](./architecture.md)
- [測試數據腳本](../../scripts/seed-test-data.ts)
- [環境配置指南](../../README.md)

---

*最後更新: 2026-10-25*  
*版本: 1.0*  
**維護者: PhamaCount Web 開發團隊**