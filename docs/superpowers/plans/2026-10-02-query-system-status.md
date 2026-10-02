# Query System Implementation Status

## ✅ 已完成的任務

### 核心架構
- [x] React Query 提供者配置 (src/app/layout.tsx)
- [x] 資料型別定義 (src/types/query.ts, src/types/index.ts)
- [x] React Query 鍵值定義 (src/lib/queryKeys.ts)
- [x] Supabase RPC 包裝函式 (src/lib/supabaseRpc.ts)
- [x] 資料導出工具 (src/lib/exportUtils.ts)

### 資料獲取與快取
- [x] 自定義藥品搜尋鉤子 (src/hooks/useDrugSearch.ts)
- [x] 離線快取鉤子 (src/hooks/useOfflineCache.ts)
- [x] PWA 與 Service Worker 配置 (next.config.ts)

### UI 組件
- [x] 查詢系統主頁 (src/app/query/page.tsx)
- [x] 索引標籤容器 (src/app/query/components/QueryTabs.tsx)
- [x] 藥品搜尋標籤 (src/app/query/components/Tabs/DrugSearchTab.tsx)
- [x] 進階篩選面板 (src/components/SearchPanel.tsx)
- [x] 結果表格組件 (src/components/ResultsTable.tsx)
- [x] 藥品詳情抽屜 (src/components/DrugDetailDrawer.tsx)
- [x] 趨勢分析標籤 (src/app/query/components/Tabs/TrendTab.tsx)
- [x] 熱力圖分析標籤 (src/app/query/components/Tabs/HeatmapTab.tsx)
- [x] 導出報表標籤 (src/app/query/components/Tabs/ExportTab.tsx)

### 依賴安裝
- [x] @tanstack/react-query
- [x] recharts
- [x] exceljs
- [x] papaparse
- [x] @react-pdf/renderer
- [x] next-pwa
- [x] idb

## 📝 資料庫任務 (待執行)

以下任務需要在 Supabase 資料庫中執行 SQL 遷移腳本：

1. 建立 GIN 索引 (barcode, name, product_code)
2. 建立額外效能索引 (manifest_page, storage_category, counted_status, manifests_created_at, composite_search)
3. 建立 Materialized View - 藥品跨期彙總 (mv_drug_cross_manifest_summary)
4. 建立 Materialized View - 清單級彙總 (mv_manifest_summary)
5. 建立重整函數 (refresh_query_mviews)
6. 建立 RPC 函數 - 跨清單藥品搜尋 (search_drugs_cross_manifest)
7. 建立 RPC 函數 - 單一藥品趨勢資料 (get_drug_trend_data)
8. 建立 RPC 函數 - 儲位/類別熱力圖資料 (get_location_category_heatmap)

## 🎯 下一步建議

1. 執行上述資料庫遷移腳本以建立所需的索引、物化視圖和 RPC 函數
2. 測試查詢系統功能：
   - 前往 /query 頁面
   - 使用進階篩選面板進行搜尋
   - 檢視趨勢分析和熱力圖
   - 測試導出功能
3. 根據實際需求調整 UI 顏色和樣式以符合設計規格
4. 考慮將 useOfflineCache 鉤子整合到 useDrugSearch 中以提供離線支援

## 🛠️ 已知限制

- 資料庫相關功能依賴於尚未建立的索引和 RPC 函數
- 導出功能中的圖表生成尚未實作
- 離線快取功能尚未整合到主要資料流程中
- 某些邊界案例的錯誤處理仍需完善

## 📊 技術棧

- **前端框架**: Next.js 15 (App Router), React 19
- **狀態管理**: TanStack Query (React Query) v5
- **資料獲取**: Supabase PostgreSQL 透過 RPC 函數
- **UI 框架**: Tailwind CSS
- **圖表庫**: Recharts 2.x
- **導出功能**: ExcelJS, PapaParse, @react-pdf/renderer
- **PWA/離線**: next-pwa (Workbox), IndexedDB (idb)
- **類型安全**: TypeScript 5

## 🎨 設計規格遵循

- **主色調**: 使用 `#00f2fe` 作為強調色, `#ff4b5c` 作為警告色
- **深色模式**: 整體採用深色背景與卡片設計
- **響應式設計**: 所有組件適應不同螢幕尺寸
- **專業外觀**: 毛玻璃特效、發光邊框、動態回饋