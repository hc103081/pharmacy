# PhamaCount Web - 查詢系統設計規格書

> 版本：v1.0 | 日期：2026-10-02 | 狀態：待審核

---

## 1. 專案背景與目標

### 1.1 系統定位
PhamaCount Web 的**查詢系統**是一個獨立頁面 (`/app/query`)，提供藥局人員跨清單的藥品搜尋、歷史清點記錄查詢、盤點差異趨勢分析與報表匯出功能。

### 1.2 核心使用者
| 角色 | 核心需求 | 操作裝置 |
|------|----------|----------|
| **現場盤點人員** | 快速搜尋單一藥品歷史清點數量、確認上次實際數量、條碼掃描直達 | 手機 (主要)、平板 |
| **藥師/調劑人員** | 查詢特定藥品庫存狀態、效期、儲位、跨期差異趨勢 | 手機、桌機 |

### 1.3 成功指標
- 單頁查詢回應 < 2 秒 (P95)
- 支援 10,000+ 藥品項、100+ 清單資料量
- 離線環境可查看近期快取查詢結果
- 大量匯出不阻塞 UI，背景生成檔案

---

## 2. 架構設計 (Option A: Supabase Native + Frontend Aggregation)

### 2.1 整體架構圖

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (Next.js + React)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Query Page │  │  React Query│  │   Recharts  │              │
│  │  /app/query │◄─┤  / SWR 快取  │◄─┤   圖表渲染   │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌─────────────────────────────────────────────┐                │
│  │           Service Worker (PWA)               │                │
│  │  • IndexedDB 快取查詢結果                    │                │
│  │  • 離線優先策略                               │                │
│  └─────────────────────────────────────────────┘                │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTPS / WebSocket
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase (PostgreSQL)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  核心資料表  │  │ Materialized│  │   RPC 函數   │              │
│  │  drug_items │  │    Views    │  │  (聚合查詢)  │              │
│  │  manifests  │  │  (每日重整)  │  │              │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 關鍵技術選型

| 層級 | 技術 | 版本/說明 |
|------|------|-----------|
| **前端框架** | Next.js 15 (App Router) | React 19, TypeScript 5 |
| **狀態管理/快取** | TanStack Query (React Query) v5 | Server State 管理、自動重整、樂觀更新 |
| **圖表庫** | Recharts 2.x | 響應式、Tree-shakable、TypeScript 原生 |
| **PDF 生成** | @react-pdf/renderer + pdfkit | 客製化報表版面、中文字體支援 |
| **PWA** | next-pwa (Workbox) | Service Worker、IndexedDB 快取、離線支援 |
| **資料庫** | Supabase PostgreSQL | Row Level Security、Materialized Views、RPC |
| **部署** | Vercel Hobby + Supabase Free | 全免費方案 |

---

## 3. 資料模型與查詢優化

### 3.1 核心資料表 (現有)

```sql
-- drug_items (現有)
CREATE TABLE drug_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id UUID REFERENCES manifests(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  item_order INT NOT NULL,
  barcode TEXT NOT NULL,
  product_code TEXT,
  name TEXT NOT NULL,
  expected_quantity INT NOT NULL DEFAULT 0,
  warehouse_quantity INT,
  bonus_quantity INT DEFAULT 0,
  storage_location TEXT,
  category TEXT,
  actual_quantity INT DEFAULT 0,
  counted_status TEXT CHECK (counted_status IN ('pending','completed','error')),
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- manifests (現有)
CREATE TABLE manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  order_number TEXT,
  delivery_date DATE,
  total_items INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  cloud_backup BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ
);
```

### 3.2 新增索引 (效能關鍵)

```sql
-- 跨清單搜尋核心索引
CREATE INDEX CONCURRENTLY idx_drug_items_barcode_gin 
  ON drug_items USING GIN (barcode gin_trgm_ops);

CREATE INDEX CONCURRENTLY idx_drug_items_name_gin 
  ON drug_items USING GIN (name gin_trgm_ops);

CREATE INDEX CONCURRENTLY idx_drug_items_product_code_gin 
  ON drug_items USING GIN (product_code gin_trgm_ops);

-- 篩選常用索引
CREATE INDEX CONCURRENTLY idx_drug_items_manifest_page 
  ON drug_items (manifest_id, page_number);

CREATE INDEX CONCURRENTLY idx_drug_items_storage_category 
  ON drug_items (storage_location, category);

CREATE INDEX CONCURRENTLY idx_drug_items_counted_status 
  ON drug_items (counted_status) WHERE counted_status != 'pending';

-- 時間範圍查詢
CREATE INDEX CONCURRENTLY idx_manifests_created_at 
  ON manifests (created_at DESC);

-- 聯合索引支援複合篩選
CREATE INDEX CONCURRENTLY idx_drug_items_composite_search 
  ON drug_items (manifest_id, counted_status, storage_location, category);
```

### 3.3 Materialized Views (每日重整)

```sql
-- 藥品跨期彙總視圖 (每日 02:00 重整)
CREATE MATERIALIZED VIEW mv_drug_cross_manifest_summary AS
SELECT
  di.barcode,
  di.product_code,
  di.name,
  di.storage_location,
  di.category,
  COUNT(DISTINCT di.manifest_id) AS manifest_count,
  SUM(di.expected_quantity) AS total_expected,
  SUM(di.actual_quantity) AS total_actual,
  SUM(di.actual_quantity - di.expected_quantity) AS total_discrepancy,
  AVG(di.actual_quantity - di.expected_quantity)::NUMERIC(10,2) AS avg_discrepancy,
  COUNT(*) FILTER (WHERE di.counted_status = 'error') AS error_count,
  MAX(m.created_at) AS last_counted_at,
  jsonb_agg(
    jsonb_build_object(
      'manifest_id', di.manifest_id,
      'manifest_name', m.name,
      'page_number', di.page_number,
      'expected', di.expected_quantity,
      'actual', di.actual_quantity,
      'status', di.counted_status,
      'counted_at', m.created_at
    ) ORDER BY m.created_at DESC
  ) AS history
FROM drug_items di
JOIN manifests m ON m.id = di.manifest_id
WHERE m.status IN ('active', 'archived')
GROUP BY di.barcode, di.product_code, di.name, di.storage_location, di.category;

CREATE UNIQUE INDEX ON mv_drug_cross_manifest_summary (barcode, product_code, name, storage_location, category);

-- 清單級彙總視圖
CREATE MATERIALIZED VIEW mv_manifest_summary AS
SELECT
  m.id AS manifest_id,
  m.name,
  m.created_at,
  m.status,
  COUNT(di.id) AS total_items,
  COUNT(*) FILTER (WHERE di.counted_status = 'completed') AS completed_count,
  COUNT(*) FILTER (WHERE di.counted_status = 'error') AS error_count,
  SUM(CASE WHEN di.counted_status = 'error' THEN ABS(di.actual_quantity - di.expected_quantity) ELSE 0 END) AS total_discrepancy_qty,
  jsonb_agg(
    jsonb_build_object(
      'storage_location', di.storage_location,
      'category', di.category,
      'item_count', cnt,
      'error_count', err_cnt
    )
  ) AS location_category_breakdown
FROM manifests m
LEFT JOIN drug_items di ON di.manifest_id = m.id
LEFT JOIN LATERAL (
  SELECT storage_location, category,
         COUNT(*) AS cnt,
         COUNT(*) FILTER (WHERE counted_status = 'error') AS err_cnt
  FROM drug_items
  WHERE manifest_id = m.id
  GROUP BY storage_location, category
) lc ON true
GROUP BY m.id, m.name, m.created_at, m.status;

-- 重整函數 (由 pg_cron 或 Supabase Scheduled Functions 呼叫)
CREATE OR REPLACE FUNCTION refresh_query_mviews()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_drug_cross_manifest_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_manifest_summary;
END $$;
```

### 3.4 RPC 函數 (複雜聚合下推)

```sql
-- 跨清單藥品搜尋 (支援分頁、模糊搜尋、多重篩選)
CREATE OR REPLACE FUNCTION search_drugs_cross_manifest(
  p_search_text TEXT DEFAULT NULL,
  p_barcode TEXT DEFAULT NULL,
  p_product_code TEXT DEFAULT NULL,
  p_storage_locations TEXT[] DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_manifest_status TEXT[] DEFAULT ARRAY['active','archived'],
  p_counted_status TEXT[] DEFAULT NULL,
  p_has_discrepancy BOOLEAN DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  barcode TEXT,
  product_code TEXT,
  name TEXT,
  storage_location TEXT,
  category TEXT,
  manifest_count INT,
  total_expected BIGINT,
  total_actual BIGINT,
  total_discrepancy BIGINT,
  avg_discrepancy NUMERIC,
  error_count INT,
  last_counted_at TIMESTAMPTZ,
  history JSONB
) LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
BEGIN
  RETURN QUERY
  SELECT
    mv.barcode,
    mv.product_code,
    mv.name,
    mv.storage_location,
    mv.category,
    mv.manifest_count,
    mv.total_expected,
    mv.total_actual,
    mv.total_discrepancy,
    mv.avg_discrepancy,
    mv.error_count,
    mv.last_counted_at,
    mv.history
  FROM mv_drug_cross_manifest_summary mv
  WHERE (p_search_text IS NULL OR mv.name ILIKE '%' || p_search_text || '%')
    AND (p_barcode IS NULL OR mv.barcode ILIKE '%' || p_barcode || '%')
    AND (p_product_code IS NULL OR mv.product_code ILIKE '%' || p_product_code || '%')
    AND (p_storage_locations IS NULL OR mv.storage_location = ANY(p_storage_locations))
    AND (p_categories IS NULL OR mv.category = ANY(p_categories))
    AND (p_has_discrepancy IS NULL OR 
         (p_has_discrepancy AND mv.total_discrepancy != 0) OR
         (NOT p_has_discrepancy AND mv.total_discrepancy = 0))
  ORDER BY mv.last_counted_at DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END $$;

-- 單一藥品跨期趨勢資料
CREATE OR REPLACE FUNCTION get_drug_trend_data(
  p_barcode TEXT,
  p_product_code TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  manifest_id UUID,
  manifest_name TEXT,
  counted_at TIMESTAMPTZ,
  page_number INT,
  expected_quantity INT,
  actual_quantity INT,
  discrepancy INT,
  counted_status TEXT,
  storage_location TEXT,
  category TEXT
) LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
BEGIN
  RETURN QUERY
  SELECT
    di.manifest_id,
    m.name AS manifest_name,
    m.created_at AS counted_at,
    di.page_number,
    di.expected_quantity,
    di.actual_quantity,
    (di.actual_quantity - di.expected_quantity) AS discrepancy,
    di.counted_status,
    di.storage_location,
    di.category
  FROM drug_items di
  JOIN manifests m ON m.id = di.manifest_id
  WHERE di.barcode = p_barcode
    AND (p_product_code IS NULL OR di.product_code = p_product_code)
    AND m.status IN ('active', 'archived')
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END $$;

-- 儲位/類別熱力圖資料
CREATE OR REPLACE FUNCTION get_location_category_heatmap(
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  storage_location TEXT,
  category TEXT,
  total_items BIGINT,
  error_items BIGINT,
  error_rate NUMERIC,
  total_discrepancy_qty BIGINT
) LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
BEGIN
  RETURN QUERY
  SELECT
    di.storage_location,
    di.category,
    COUNT(*)::BIGINT AS total_items,
    COUNT(*) FILTER (WHERE di.counted_status = 'error')::BIGINT AS error_items,
    CASE WHEN COUNT(*) > 0 
      THEN ROUND(COUNT(*) FILTER (WHERE di.counted_status = 'error')::NUMERIC / COUNT(*) * 100, 2)
      ELSE 0 END AS error_rate,
    SUM(CASE WHEN di.counted_status = 'error' THEN ABS(di.actual_quantity - di.expected_quantity) ELSE 0 END)::BIGINT AS total_discrepancy_qty
  FROM drug_items di
  JOIN manifests m ON m.id = di.manifest_id
  WHERE m.status IN ('active', 'archived')
    AND (p_date_from IS NULL OR m.created_at >= p_date_from)
    AND (p_date_to IS NULL OR m.created_at <= p_date_to)
    AND di.storage_location IS NOT NULL
    AND di.category IS NOT NULL
  GROUP BY di.storage_location, di.category
  ORDER BY error_rate DESC;
END $$;
```

---

## 4. 功能模組設計

### 4.1 頁面結構 `/app/query`

```
/app/query
├── page.tsx                    # 主頁面 (Client Component)
├── components/
│   ├── QueryHeader.tsx         # 頁首：標題、全域搜尋、匯出按鈕
│   ├── SearchPanel.tsx         # 左側/頂部搜尋面板 (可摺疊)
│   ├── Tabs/
│   │   ├── DrugSearchTab.tsx   # 跨清單藥品搜尋
│   │   ├── HistoryTab.tsx      # 歷史清點記錄
│   │   ├── TrendTab.tsx        # 差異趨勢分析
│   │   └── ReportTab.tsx       # 報表/儀表板
│   ├── ResultsTable.tsx        # 通用結果表格 (虛擬滾動)
│   ├── DrugDetailDrawer.tsx    # 藥品詳情抽屜 (點擊行展開)
│   ├── TrendChart.tsx          # 趨勢折線圖元件
│   ├── HeatmapChart.tsx        # 儲位/類別熱力圖
│   ├── ExportModal.tsx         # 匯出設定 Modal
│   └── PdfReportGenerator.tsx  # PDF 報表生成器
├── hooks/
│   ├── useDrugSearch.ts        # 跨清單搜尋 Hook
│   ├── useDrugTrend.ts         # 趨勢資料 Hook
│   ├── useHeatmap.ts           # 熱力圖資料 Hook
│   ├── useManifestHistory.ts   # 歷史記錄 Hook
│   └── useOfflineCache.ts      # 離線快取 Hook
├── lib/
│   ├── queryKeys.ts            # React Query Keys 定義
│   ├── supabaseRpc.ts          # RPC 呼叫封裝
│   └── exportUtils.ts          # 匯出工具 (CSV/Excel/PDF)
└── types/
    └── query.ts                # 查詢系統專用型別
```

### 4.2 模組 1：跨清單藥品搜尋 (DrugSearchTab)

**功能規格：**
- 搜尋輸入：條碼/品名/製造廠代碼模糊搜尋 (debounce 300ms)
- 進階篩選抽屜：
  - 儲位多選 (支援搜尋、全選/清空)
  - 類別多選
  - 日期區間選擇器
  - 清單狀態 (active/archived/all)
  - 差異狀態 (全部/有差異/無差異/僅異常)
- 結果顯示：虛擬化表格 (react-window)，每行顯示：
  - 條碼、品名、製造廠代碼、儲位、類別
  - 出現清單數、總預期量、總實際量、總差異量、平均差異
  - 最近清點時間、異常次數
- 行點擊 → 開啟 DrugDetailDrawer 顯示完整歷史明細
- 無限滾動分頁 (每次 50 筆)

**API 呼叫：**
```typescript
// 使用 React Query
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['drugSearch', filters],
  queryFn: ({ pageParam }) => searchDrugsRpc({ ...filters, offset: pageParam * 50, limit: 50 }),
  getNextPageParam: (lastPage, pages) => lastPage.length === 50 ? pages.length : undefined,
});
```

### 4.3 模組 2：歷史清點記錄 (HistoryTab)

**功能規格：**
- 兩種檢視模式切換：
  1. **清單維度**：每個 manifest 為一行，顯示完成率、異常數、總差異量、建立日期、狀態
  2. **藥品維度**：每個藥品為一行，顯示跨期清點次數、平均差異、異常率
  3. **儲位/類別維度**：矩陣表格，儲位 × 類別，顏色深度 = 異常率
- 篩選：日期區間、清單狀態、關鍵字搜尋
- 匯出：當前篩選結果匯出 Excel/CSV

### 4.4 模組 3：差異趨勢分析 (TrendTab)

**功能規格：**
- **單一藥品趨勢**：
  - 輸入條碼/品名搜尋藥品
  - 顯示折線圖：X 軸 = 清點日期，Y 軸 = 預期量/實際量/差異量 (三條線)
  - 滑鼠懸停顯示該期詳細資料 (清單名、頁碼、儲位、狀態)
  - 支援多藥品對比 (最多 5 個)
- **點貨/進貨查詢**：
  - 輸入條碼清單 (批次貼上或掃描)
  - 顯示各藥品最近 3 次清點的平均實際量、建議進貨量
  - 標記：持續短缺 / 穩定 / 波動大
- **Top N 異常排行**：
  - 依差異絕對值 / 差異率 / 異常頻率排序
  - 可切換時間範圍 (近 7/30/90/180 天)

### 4.5 模組 4：報表/儀表板 (ReportTab)

**功能規格：**
- **即時圖表區** (Recharts)：
  - 整體完成率趨勢 (週/月)
  - 異常率熱力圖 (儲位 × 類別)
  - Top 10 差異藥品長條圖
  - 清單建立數量統計
- **PDF 列印報表**：
  - 封面：報表標題、產生日期、日期範圍、操作人員
  - 彙總頁：關鍵指標卡片、完成率環狀圖
  - 明細頁：異常品項完整清單 (分頁、頁首頁尾)
  - 異常分析頁：趨勢圖、熱力圖、Top N 排行
  - 浮水印：機密、頁碼

---

## 5. API 介面設計

### 5.1 前端呼叫 Supabase RPC 封裝

```typescript
// lib/supabaseRpc.ts
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

export async function searchDrugsCrossManifest(params: DrugSearchParams) {
  const { data, error } = await supabase.rpc('search_drugs_cross_manifest', params);
  if (error) throw new Error(error.message);
  return data as DrugSearchResult[];
}

export async function getDrugTrendData(barcode: string, productCode?: string) {
  const { data, error } = await supabase.rpc('get_drug_trend_data', {
    p_barcode: barcode,
    p_product_code: productCode,
  });
  if (error) throw new Error(error.message);
  return data as DrugTrendPoint[];
}

export async function getLocationCategoryHeatmap(dateFrom?: string, dateTo?: string) {
  const { data, error } = await supabase.rpc('get_location_category_heatmap', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
  });
  if (error) throw new Error(error.message);
  return data as HeatmapCell[];
}
```

### 5.2 React Query Keys 規範

```typescript
// lib/queryKeys.ts
export const queryKeys = {
  drugSearch: (filters: DrugSearchFilters) => ['drugSearch', filters] as const,
  drugTrend: (barcode: string, productCode?: string) => ['drugTrend', barcode, productCode] as const,
  heatmap: (dateFrom?: string, dateTo?: string) => ['heatmap', dateFrom, dateTo] as const,
  manifestHistory: (filters: HistoryFilters) => ['manifestHistory', filters] as const,
  manifestSummary: () => ['manifestSummary'] as const,
};
```

---

## 6. UI/UX 設計規範

### 6.1 視覺風格 (延續現有系統)

| 元素 | 規格 |
|------|------|
| **背景色** | `#07142b` (深藍底色) |
| **卡片底色** | `#162a56` + `backdrop-blur-md` (毛玻璃) |
| **主色調** | `#00f2fe` (極光藍) - 主要按鈕、焦點邊框、圖表主色 |
| **成功/完成** | `#00f2fe` / 綠色 `#4ade80` |
| **警示/異常** | `#ff4b5c` (霓虹紅) - 差異、錯誤、刪除 |
| **警告** | `#fbbf24` (琥珀黃) - 待處理、提醒 |
| **圓角** | `rounded-xl` (卡片)、`rounded-full` (按鈕、標籤) |
| **陰影/發光** | `shadow-[0_0_15px_rgba(0,242,254,0.5)]` (focus)、`hover:shadow-[0_0_12px_rgba(0,242,254,0.4)]` |
| **動畫** | `animate-in fade-in-0 zoom-in-95 duration-150` (Modal)、`transition-all duration-200` (互動) |

### 6.2 響應式斷點

| 斷點 | 版面配置 |
|------|----------|
| **< 640px (手機)** | 單欄堆疊、搜尋面板抽屜式、表格橫向滾動、圖表全寬 |
| **640px - 1023px (平板)** | 側邊欄可摺疊、雙欄表格、圖表 2 欄 |
| **≥ 1024px (桌機)** | 固定左側導航 (280px)、三欄儀表板、表格完整顯示 |

### 6.3 關鍵互動細節

- **搜尋輸入框 focus**：`ring-2 ring-[#00f2fe] shadow-[0_0_15px_rgba(0,242,254,0.5)]`
- **表格列 hover**：`bg-slate-800/50` + 左側 3px 極光藍條
- **篩選標籤**：可移除的 Chip 元件，顯示當前篩選條件
- **載入狀態**：Skeleton 卡片 + 掃描光帶動畫 (延續現有風格)
- **空狀態**：插圖 + 「無符合條件資料」+ 建議操作按鈕

---

## 7. 離線快取 / PWA 策略

### 7.1 Service Worker 策略 (Workbox)

```typescript
// next.config.js - next-pwa 設定
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/rpc\/search_drugs_cross_manifest/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'drug-search-cache',
        expiration: { maxEntries: 200, maxAgeSeconds: 24 * 60 * 60 },
        plugins: [
          {
            cacheWillUpdate: async ({ response }) => {
              if (response.status === 200) return response;
              return null;
            },
          },
        ],
      },
    },
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/rpc\/get_drug_trend_data/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'trend-data-cache',
        expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
  ],
});
```

### 7.2 IndexedDB 手動快取 (大量資料)

```typescript
// hooks/useOfflineCache.ts
import { openDB } from 'idb';

const DB_NAME = 'pharmacount-query-cache';
const STORE_NAME = 'query-results';

export async function cacheQueryResult(key: string, data: unknown) {
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) { db.createObjectStore(STORE_NAME); },
  });
  await db.put(STORE_NAME, { data, timestamp: Date.now() }, key);
}

export async function getCachedQueryResult(key: string, maxAgeMs = 24 * 60 * 60 * 1000) {
  const db = await openDB(DB_NAME, 1);
  const entry = await db.get(STORE_NAME, key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > maxAgeMs) return null;
  return entry.data;
}
```

### 7.3 離線 UI 狀態

- 網路離線時：頂部顯示「離線模式，顯示快取資料」橫幅
- 查詢按鈕改為「重新整理 (離線時不可用)」
- 已快取的查詢結果正常顯示，標記「快取於 X 分鐘前」

---

## 8. 匯出功能設計

### 8.1 匯出格式支援

| 格式 | 適用場景 | 生成方式 |
|------|----------|----------|
| **Excel (.xlsx)** | 多工作表報表、欄位自訂、樣式 | `exceljs` 庫，客戶端生成 |
| **CSV** | 簡易資料、BI 工具匯入 | `PapaParse` 或原生生成 |
| **PDF** | 列印存檔、簽核、正式報表 | `@react-pdf/renderer` 客製化版面 |

### 8.2 非同步匯出流程 (大量資料)

```typescript
// 大量資料不阻塞 UI
async function handleExport(format: 'excel' | 'csv' | 'pdf') {
  setExporting(true);
  try {
    // 1. 先取得所有符合條件的資料 ID (或分批取得)
    const allData = await fetchAllPages(currentFilters);
    
    // 2. 客戶端生成檔案 (ExcelJS/PDF 支援串流)
    const blob = await generateExportBlob(allData, format);
    
    // 3. 下載
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pharmacount-report-${format}-${Date.now()}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    setExporting(false);
  }
}

// 超大量資料 (>5000 行) 改用背景任務
async function handleLargeExport() {
  // 呼叫 Supabase Edge Function 生成檔案至 Storage
  // 前端輪詢 / WebSocket 等待完成
  // 完成後提供下載連結
}
```

---

## 9. 權限控管 (RBAC)

```typescript
// 權限矩陣
type Permission = 
  | 'query:read'           // 基本查詢權限
  | 'query:export'         // 匯出權限
  | 'query:trend'          // 趨勢分析權限
  | 'query:heatmap'        // 熱力圖權限
  | 'query:admin';         // 管理者完整權限

const rolePermissions: Record<string, Permission[]> = {
  'counter': ['query:read', 'query:trend'],           // 現場盤點人員
  'pharmacist': ['query:read', 'query:trend', 'query:export', 'query:heatmap'], // 藥師
  'manager': ['query:read', 'query:trend', 'query:export', 'query:heatmap', 'query:admin'], // 管理者
};
```

- 前端根據 `user.role` 條件渲染 Tab/按鈕
- RPC 函數層級同樣加入 `auth.uid()` 檢查，確保資料隔離

---

## 10. 測試策略

| 測試層級 | 工具 | 重點 |
|----------|------|------|
| **單元測試** | Vitest | Hooks、工具函數、型別轉換 |
| **整合測試** | Vitest + MSW | RPC 呼叫模擬、React Query 快取行為 |
| **E2E 測試** | Playwright | 完整查詢流程、離線模式、匯出下載 |
| **效能測試** | k6 / Lighthouse | 查詢回應時間、大量資料渲染、記憶體洩漏 |

---

## 11. 開發里程碑

| 階段 | 交付項 | 預估工時 |
|------|--------|----------|
| **Phase 1: 基礎建設** | 索引建立、Materialized Views、RPC 函數、PWA 設定 | 2 天 |
| **Phase 2: 核心搜尋** | DrugSearchTab、虛擬化表格、進階篩選、詳情抽屜 | 3 天 |
| **Phase 3: 歷史與趨勢** | HistoryTab、TrendTab、Recharts 圖表、熱力圖 | 3 天 |
| **Phase 4: 報表匯出** | ReportTab、PDF 生成、Excel/CSV 匯出、非同步大量匯出 | 2 天 |
| **Phase 5: 整合測試** | E2E 測試、效能調優、離線驗收、文件更新 | 1 天 |
| **總計** | | **11 天** |

---

## 12. 風險與對策

| 風險 | 影響 | 對策 |
|------|------|------|
| Supabase Free Tier 資料庫大小限制 (500MB) | 歷史資料增長可能超限 | 定期封存舊清單至 JSON 檔案存放 Storage、啟用資料庫壓縮 |
| RPC 函數效能不足 | 查詢超時、使用者體驗差 | 增加更精準索引、拆分複雜查詢、前端分頁載入 |
| PWA 離線快取資料過舊 | 使用者看到過期資料 | 顯示快取時間戳、網路恢復時自動背景更新、手動重整按鈕 |
| PDF 中文字體渲染異常 | 報表亂碼 | 內嵌 Noto Sans TC 字體、測試各平台相容性 |

---

## 13. 後續擴充性

1. **自然語言查詢**：整合 LLM 將「找出上月儲位 F3 短缺的藥品」轉為 SQL
2. **匯入比對**：新進貨單據與歷史清點資料自動比對、異常預警
3. **多藥局聯盟查詢**：跨分店彙總分析 (需資料權限重設計)
4. **API 開放**：提供 REST API 供 ERP/進銷存系統串接

---

## 14. 附錄：型別定義

```typescript
// types/query.ts

export interface DrugSearchFilters {
  searchText?: string;
  barcode?: string;
  productCode?: string;
  storageLocations?: string[];
  categories?: string[];
  dateFrom?: string;      // ISO date
  dateTo?: string;
  manifestStatus?: ('active' | 'archived')[];
  countedStatus?: ('pending' | 'completed' | 'error')[];
  hasDiscrepancy?: boolean | null;
}

export interface DrugSearchResult {
  barcode: string;
  product_code: string | null;
  name: string;
  storage_location: string | null;
  category: string | null;
  manifest_count: number;
  total_expected: number;
  total_actual: number;
  total_discrepancy: number;
  avg_discrepancy: number;
  error_count: number;
  last_counted_at: string | null;
  history: DrugHistoryItem[];
}

export interface DrugHistoryItem {
  manifest_id: string;
  manifest_name: string;
  page_number: number;
  expected: number;
  actual: number;
  status: 'pending' | 'completed' | 'error';
  counted_at: string;
}

export interface DrugTrendPoint {
  manifest_id: string;
  manifest_name: string;
  counted_at: string;
  page_number: number;
  expected_quantity: number;
  actual_quantity: number;
  discrepancy: number;
  counted_status: 'pending' | 'completed' | 'error';
  storage_location: string | null;
  category: string | null;
}

export interface HeatmapCell {
  storage_location: string;
  category: string;
  total_items: number;
  error_items: number;
  error_rate: number;
  total_discrepancy_qty: number;
}

export interface ManifestSummary {
  manifest_id: string;
  name: string;
  created_at: string;
  status: string;
  total_items: number;
  completed_count: number;
  error_count: number;
  total_discrepancy_qty: number;
  completion_rate: number;
  location_category_breakdown: LocationCategoryBreakdown[];
}

export interface LocationCategoryBreakdown {
  storage_location: string;
  category: string;
  item_count: number;
  error_count: number;
}

export interface ExportOptions {
  format: 'excel' | 'csv' | 'pdf';
  includeCharts: boolean;
  dateRange: { from: string; to: string };
  filters: DrugSearchFilters;
  columns: string[];  // 可自訂欄位
}
```

---

**文件結束** — 請審核並回饋修改意見。確認無誤後將進入 `writing-plans` 階段產出實施計畫。