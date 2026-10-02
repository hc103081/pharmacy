# Query System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone query system page (`/app/query`) for PhamaCount Web that enables cross-manifest drug search, historical inventory queries, discrepancy trend analysis, and export functionality.

**Architecture:** Supabase-native backend with Materialized Views and RPC functions for optimized queries; Next.js frontend with React Query for state management; Recharts for visualization; PWA/IndexedDB for offline support.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5, TanStack Query v5, Recharts 2.x, @react-pdf/renderer, next-pwa (Workbox), Supabase PostgreSQL, Vercel Hobby deployment.

## Global Constraints

- Language: All code comments and documentation in Traditional Chinese
- Frontend Framework: Next.js 15 with App Router, React 19, TypeScript 5
- State Management: TanStack Query (React Query) v5
- UI Framework: Tailwind CSS with dark theme (`#07142b` background, `#162a56` card surface, `#00f2fe` accent, `#ff4b5c` alert)
- Charting Library: Recharts 2.x
- PDF Generation: @react-pdf/renderer + pdfkit
- PWA/Offline: next-pwa (Workbox) with Service Worker and IndexedDB caching
- Backend: Supabase PostgreSQL with Row Level Security
- Database Optimization: GIN indexes with `gin_trgm_ops`, Materialized Views refreshed daily
- Export Formats: Excel (exceljs), CSV (PapaParse), PDF (@react-pdf/renderer)
- Access Control: RBAC matrix with permissions `query:read`, `query:export`, `query:trend`, `query:heatmap`, `query:admin`
- Performance Target: <2s query response (P95), support 10k+ drug items, 100+ manifests
- Deployment: Vercel (frontend) + Supabase (backend) - both free tiers

---

## Phase 1: 基礎建設 (Foundation)

### Task 1: 建立資料庫 GIN 索引

**Interfaces:**
- Consumes: Supabase connection
- Produces: Indexes on drug_items table for barcode, name, product_code

- [ ] **Step 1: 建立索引腳本驗證**
  ```sql
  -- 驗證索引不存在 (應返回錯誤或空結果)
  SELECT indexname FROM pg_indexes WHERE indexname = 'idx_drug_items_barcode_gin';
  ```

- [ ] **Step 2: 執行驗證並確認失敗**
  Run: `psql $SUPABASE_URL -c "SELECT indexname FROM pg_indexes WHERE indexname = 'idx_drug_items_barcode_gin';"`
  Expected: 無結果或錯誤 (索引尚未建立)

- [ ] **Step 3: 建立三個 GIN 索引**
  ```sql
  CREATE INDEX CONCURRENTLY idx_drug_items_barcode_gin 
    ON drug_items USING GIN (barcode gin_trgm_ops);
  
  CREATE INDEX CONCURRENTLY idx_drug_items_name_gin 
    ON drug_items USING GIN (name gin_trgm_ops);
  
  CREATE INDEX CONCURRENTLY idx_drug_items_product_code_gin 
    ON drug_items USING GIN (product_code gin_trgm_ops);
  ```

- [ ] **Step 4: 驗證索引建立成功**
  Run: `psql $SUPABASE_URL -c "\d drug_items"` and check for GIN indexes
  Expected: 看到三個 GIN 索引在欄位上

- [ ] **Step 5: Commit 變更**
  ```bash
  git add migrations/2026-10-02-01-create-gin-indexes.sql
  git commit -m "feat: add GIN indexes for cross-manifest search"
  ```

### Task 2: 建立其他效能索引

**Interfaces:**
- Consumes: Supabase connection
- Produces: Additional indexes for filtering and performance

- [ ] **Step 1: 建立索引腳本驗證**
  ```sql
  SELECT indexname FROM pg_indexes WHERE indexname = 'idx_drug_items_manifest_page';
  ```

- [ ] **Step 2: 執行驗證並確認失敗**
  Run: `psql $SUPABASE_URL -c "SELECT indexname FROM pg_indexes WHERE indexname = 'idx_drug_items_manifest_page';"`
  Expected: 無結果

- [ ] **Step 3: 建立其餘索引**
  ```sql
  CREATE INDEX CONCURRENTLY idx_drug_items_manifest_page 
    ON drug_items (manifest_id, page_number);
  
  CREATE INDEX CONCURRENTLY idx_drug_items_storage_category 
    ON drug_items (storage_location, category);
  
  CREATE INDEX CONCURRENTLY idx_drug_items_counted_status 
    ON drug_items (counted_status) WHERE counted_status != 'pending';
  
  CREATE INDEX CONCURRENTLY idx_manifests_created_at 
    ON manifests (created_at DESC);
  
  CREATE INDEX CONCURRENTLY idx_drug_items_composite_search 
    ON drug_items (manifest_id, counted_status, storage_location, category);
  ```

- [ ] **Step 4: 驗證所有索引建立成功**
  Run: `psql $SUPABASE_URL -c "\d drug_items"` and check for all indexes
  Expected: 看到所有新增的索引

- [ ] **Step 5: Commit 變更**
  ```bash
  git add migrations/2026-10-02-02-additional-indexes.sql
  git commit -m "feat: add additional indexes for filtering and performance"
  ```

### Task 3: 建立 Materialized View - 藥品跨期彙總

**Interfaces:**
- Consumes: drug_items, manifests tables
- Produces: mv_drug_cross_manifest_summary

- [ ] **Step 1: 建立 MV 驗證腳本**
  ```sql
  SELECT matviewname FROM pg_matviews WHERE matviewname = 'mv_drug_cross_manifest_summary';
  ```

- [ ] **Step 2: 執行驗證並確認失敗**
  Run: `psql $SUPABASE_URL -c "SELECT matviewname FROM pg_matviews WHERE matviewname = 'mv_drug_cross_manifest_summary';"`
  Expected: 無結果

- [ ] **Step 3: 建立 Materialized View**
  ```sql
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
  ```

- [ ] **Step 4: 建立唯一索引並驗證 MV**
  ```sql
  CREATE UNIQUE INDEX ON mv_drug_cross_manifest_summary (barcode, product_code, name, storage_location, category);
  ```
  Then run: `psql $SUPABASE_URL -c "\dmv"` to check MV exists
  Expected: 看到 mv_drug_cross_manifest_summary 列出

- [ ] **Step 5: Commit 變更**
  ```bash
  git add migrations/2026-10-02-03-create-mv-drug-summary.sql
  git commit -m "feat: create drug cross-manifest summary materialized view"
  ```

### Task 4: 建立 Materialized View - 清單級彙總

**Interfaces:**
- Consumes: manifests, drug_items tables
- Produces: mv_manifest_summary

- [ ] **Step 1: 建立 MV 驗證腳本**
  ```sql
  SELECT matviewname FROM pg_matviews WHERE matviewname = 'mv_manifest_summary';
  ```

- [ ] **Step 2: 執行驗證並確認失敗**
  Run: `psql $SUPABASE_URL -c "SELECT matviewname FROM pg_matviews WHERE matviewname = 'mv_manifest_summary';"`
  Expected: 無結果

- [ ] **Step 3: 建立 Materialized View**
  ```sql
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
  ```

- [ ] **Step 4: 驗證 MV 建立成功**
  Run: `psql $SUPABASE_URL -c "\dmv"` to check MV exists
  Expected: 看到兩個 Materialized Views

- [ ] **Step 5: Commit 變更**
  ```bash
  git add migrations/2026-10-02-04-create-mv-manifest-summary.sql
  git commit -m "feat: create manifest summary materialized view"
  ```

### Task 5: 建立重整函數

**Interfaces:**
- Consumes: pg_cron or scheduled functions
- Produces: Refresh mechanism for MVs

- [ ] **Step 1: 建立函數驗證腳本**
  ```sql
  SELECT proname FROM pg_proc WHERE proname = 'refresh_query_mviews';
  ```

- [ ] **Step 2: 執行驗證並確認失敗**
  Run: `psql $SUPABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'refresh_query_mviews';"`
  Expected: 無結果

- [ ] **Step 3: 建立重整函數**
  ```sql
  CREATE OR REPLACE FUNCTION refresh_query_mviews()
  RETURNS VOID LANGUAGE plpgsql AS $$
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_drug_cross_manifest_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_manifest_summary;
  END $$;
  ```

- [ ] **Step 4: 驗證函數建立成功**
  Run: `psql $SUPABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'refresh_query_mviews';"`
  Expected: 看到 refresh_query_mviews 在列表中

- [ ] **Step 5: Commit 變更**
  ```bash
  git add migrations/2026-10-02-05-create-refresh-function.sql
  git commit -m "feat: create refresh function for materialized views"
  ```

### Task 6: 建立 RPC 函數 - 跨清單藥品搜尋

**Interfaces:**
- Consumes: mv_drug_cross_manifest_summary
- Produces: Search results with pagination and filtering

- [ ] **Step 1: 建立 RPC 函數驗證腳本**
  ```sql
  SELECT proname FROM pg_proc WHERE proname = 'search_drugs_cross_manifest';
  ```

- [ ] **Step 2: 執行驗證並確認失敗**
  Run: `psql $SUPABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'search_drugs_cross_manifest';"`
  Expected: 無結果

- [ ] **Step 3: 建立 RPC 函數**
  ```sql
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
  ```

- [ ] **Step 4: 驗證 RPC 函數建立成功**
  Run: `psql $SUPABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'search_drugs_cross_manifest';"`
  Expected: 看到函數存在

- [ ] **Step 5: Commit 變更**
  ```bash
  git add migrations/2026-10-02-06-create-search-rpc.sql
  git commit -m "feat: create search drugs cross manifest RPC function"
  ```

### Task 7: 建立 RPC 函數 - 單一藥品趨勢資料

**Interfaces:**
- Consumes: drug_items, manifests
- Produces: Trend data for a specific drug

- [ ] **Step 1: 建立 RPC 函數驗證腳本**
  ```sql
  SELECT proname FROM pg_proc WHERE proname = 'get_drug_trend_data';
  ```

- [ ] **Step 2: 執行驗證並確認失敗**
  Run: `psql $SUPABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'get_drug_trend_data';"`
  Expected: 無結果

- [ ] **Step 3: 建立 RPC 函數**
  ```sql
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
  ```

- [ ] **Step 4: 驗證 RPC 函數建立成功**
  Run: `psql $SUPABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'get_drug_trend_data';"`
  Expected: 看到函數存在

- [ ] **Step 5: Commit 變更**
  ```bash
  git add migrations/2026-10-02-07-create-trend-rpc.sql
  git commit -m "feat: get drug trend data RPC function"
  ```

### Task 8: 建立 RPC 函數 - 儲位/類別熱力圖資料

**Interfaces:**
- Consumes: drug_items, manifests
- Produces: Heatmap data for storage location and category

- [ ] **Step 1: 建立 RPC 函數驗證腳本**
  ```sql
  SELECT proname FROM pg_proc WHERE proname = 'get_location_category_heatmap';
  ```

- [ ] **Step 2: 執行驗證並確認失敗**
  Run: `psql $SUPABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'get_location_category_heatmap';"`
  Expected: 無結果

- [ ] **Step 3: 建立 RPC 函數**
  ```sql
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

- [ ] **Step 4: 驗證 RPC 函數建立成功**
  Run: `psql $SUPABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'get_location_category_heatmap';"`
  Expected: 看到函數存在

- [ ] **Step 5: Commit 變更**
  ```bash
  git add migrations/2026-10-02-08-create-heatmap-rpc.sql
  git commit -m "feat: create location category heatmap RPC function"
  ```

### Task 9: 設定 PWA 和 Service Worker

**Interfaces:**
- Consumes: next-pwa configuration
- Produces: PWA support with offline caching

- [ ] **Step 1: 安裝 next-pwa 依賴**
  Run: `npm install next-pwa`

- [ ] **Step 2: 建立 next-pwa 配置驗證**
  檢查: `next.config.js` 是否存在與 next-pwa 配置
  Expected: 配置尚不存在或不完整

- [ ] **Step 3: 配置 next-pwa 與 Service Worker**
  ```javascript
  // next.config.js
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
  
  module.exports = withPWA({
    // 既有的 Next.js 配置
    reactStrictMode: true,
  });
  ```

- [ ] **Step 4: 驗證 PWA 配置成功**
  Run: `npm run build` and check for service worker generation
  Expected: 建置成功並生成 service worker 檔案

- [ ] **Step 5: Commit 變更**
  ```bash
  git add next.config.js package.json
  git commit -m "feat: configure PWA with next-pwa for offline support"
  ```

### Task 10: 建立 IndexedDB 手動快取層

**Interfaces:**
- Consumes: IndexedDB API
- Produces: useOfflineCache hook for manual caching

- [ ] **Step 1: 建立 hooks 目錄和檔案**
  檔案: `src/hooks/useOfflineCache.ts`
  Expected: 檔案尚不存在

- [ ] **Step 2: 安裝 idb 依賴**
  Run: `npm install idb`

- [ ] **Step 3: 實作 useOfflineCache hook**
  ```typescript
  // src/hooks/useOfflineCache.ts
  import { openDB, IDBPDatabase } from 'idb';
  
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
  
  // Optional: React hook wrapper
  import { useState, useEffect } from 'react';
  
  export function useOfflineCache<T>(key: string, maxAgeMs = 24 * 60 * 60 * 1000) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
      async function loadCache() {
        setLoading(true);
        const cached = await getCachedQueryResult<T>(key, maxAgeMs);
        setData(cached);
        setLoading(false);
      }
      loadCache();
    }, [key, maxAgeMs]);
    
    return { data, loading };
  }
  ```

- [ ] **Step 4: 驗證 hook 建立成功**
  Run: `npm run dev` and check for TypeScript errors
  Expected: 編譯通過，無型別錯誤

- [ ] **Step 5: Commit 變更**
  ```bash
  git add src/hooks/useOfflineCache.ts
  git commit -m "feat: create IndexedDB offline cache hook"
  ```

## Phase 2: 核心搜尋 (Core Search)

### Task 11: 建立型別定義

**Interfaces:**
- Consumes: None
- Produces: TypeScript interfaces for query system

- [ ] **Step 1: 建立 types 目錄和檔案驗證**
  檔案: `src/types/query.ts`
  Expected: 檔案尚不存在

- [ ] **Step 2: 實作型別定義**
  ```typescript
  // src/types/query.ts
  
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

- [ ] **Step 3: 驗證型別定義編譯成功**
  Run: `npm run dev` and check for TypeScript errors in the types file
  Expected: 編譯通過

- [ ] **Step 4: Commit 變更**
  ```bash
  git add src/types/query.ts
  git commit -m "feat: define TypeScript interfaces for query system"
  ```

### Task 12: 建立 React Query Keys

**Interfaces:**
- Consumes: None
- Produces: Query key constants for React Query

- [ ] **Step 1: 建立 lib 目錄和檔案驗證**
  檔案: `src/lib/queryKeys.ts`
  Expected: 檔案尚不存在

- [ ] **Step 2: 實作 Query Keys**
  ```typescript
  // src/lib/queryKeys.ts
  
  export const queryKeys = {
    drugSearch: (filters: DrugSearchFilters) => ['drugSearch', filters] as const,
    drugTrend: (barcode: string, productCode?: string) => ['drugTrend', barcode, productCode] as const,
    heatmap: (dateFrom?: string, dateTo?: string) => ['heatmap', dateFrom, dateTo] as const,
    manifestHistory: (filters: any) => ['manifestHistory', filters] as const,
    manifestSummary: () => ['manifestSummary'] as const,
  };
  ```

- [ ] **Step 3: 驗證編譯成功**
  Run: `npm run dev` and check for TypeScript errors
  Expected: 編譯通過

- [ ] **Step 4: Commit 變更**
  ```bash
  git add src/lib/queryKeys.ts
  git commit -m "feat: define React Query keys for query system"
  ```

### Task 13: 建立 RPC 呼叫封裝

**Interfaces:**
- Consumes: Supabase client
- Produces: Wrapper functions for RPC calls

- [ ] **Step 1: 建立 lib 目錄和檔案驗證**
  檔案: `src/lib/supabaseRpc.ts`
  Expected: 檔案尚不存在

- [ ] **Step 2: 實作 RPC 呼叫封裝**
  ```typescript
  // src/lib/supabaseRpc.ts
  import { createClient } from '@/lib/supabase/client';
  import type { 
    DrugSearchResult, 
    DrugSearchFilters,
    DrugTrendPoint,
    HeatmapCell
  } from '@/types/query';
  
  const supabase = createClient();
  
  export async function searchDrugsCrossManifest(params: DrugSearchFilters) {
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

- [ ] **Step 3: 驗證編譯成功**
  Run: `npm run dev` and check for TypeScript errors
  Expected: 編譯通過

- [ ] **Step 4: Commit 變更**
  ```bash
  git add src/lib/supabaseRpc.ts
  git commit -m "feat: create Supabase RPC wrapper functions"
  ```

### Task 14: 建立 DrugSearchTab 容器組件

**Interfaces:**
- Consumes: useDrugSearch hook, SearchPanel component, ResultsTable component
- Produces: Main search tab UI

- [ ] **Step 1: 建立 components/Tabs 目錄和檔案驗證**
  檔案: `src/app/query/components/Tabs/DrugSearchTab.tsx`
  Expected: 檔案尚不存在

- [ ] **Step 2: 建立基本容器組件結構**
  ```typescript
  // src/app/query/components/Tabs/DrugSearchTab.tsx
  'use client';
  
  import { useDrugSearch } from '@/hooks/useDrugSearch';
  import { SearchPanel } from '@/components/SearchPanel';
  import { ResultsTable } from '@/components/ResultsTable';
  import { DrugDetailDrawer } from '@/components/DrugDetailDrawer';
  
  export default function DrugSearchTab() {
    const { 
      data, 
      isLoading, 
      isError, 
      fetchNextPage, 
      hasNextPage,
      refetch
    } = useDrugSearch();
    
    return (
      <div className="flex h-full">
        {/* 側邊搜尋面板 */}
        <SearchPanel />
        
        {/* 主要結果區域 */}
        <div className="flex-1 overflow-hidden">
          {/* 結果表格 */}
          <ResultsTable 
            data={data || []}
            isLoading={isLoading}
            isError={isError}
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage}
            refetch={refetch}
          />
          
          /* 藥品詳情抽屜 (由 ResultsTable 控制顯示) */
          {/* DrugDetailDrawer 會透過 prop 或 context 控制 */}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: 驗證編譯成功**
  Run: `npm run dev` and check for TypeScript errors
  Expected: 編譯通過

- [ ] **Step 4: Commit 變更**
  ```bash
  git add src/app/query/components/Tabs/DrugSearchTab.tsx
  git commit -m "feat: create DrugSearchTab container component"
  ```

### Task 15: 建立進階篩選抽屜組件

**Interfaces:**
- Consumes: None (will be connected to state management)
- Produces: Collapsible filter panel with various filter controls

- [ ] **Step 1: 建立 components 目錄和檔案驗證**
  檔案: `src/components/SearchPanel.tsx`
  Expected: 檔案尚不存在

- [ ] **Step 2: 實作進階篩選抽屜**
  ```typescript
  // src/components/SearchPanel.tsx
  'use client';
  
  import { useState } from 'react';
  import { 
    Search, 
    Sliders, 
    CalendarDays, 
    Filter, 
    X 
  } from 'lucide-react';
  
  export function SearchPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [filters, setFilters] = useState({
      searchText: '',
      barcode: '',
      productCode: '',
      storageLocations: [] as string[],
      categories: [] as string[],
      dateFrom: '',
      dateTo: '',
      manifestStatus: ['active', 'archived'] as ('active' | 'archived')[],
      countedStatus: [] as ('pending' | 'completed' | 'error')[],
      hasDiscrepancy: null as boolean | null,
    });
    
    // 處理表單提交和篩選變更的函數會在後續任務中實作
    
    return (
      <div className={`fixed left-0 top-0 h-full w-64 bg-slate-900/50 backdrop-blur-md 
                         transition-transform duration-300 ease-in-out 
                         ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                         z-50`}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <h2 className="text-lg font-semibold text-white">進階篩選</h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-white hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto h-full">
          {/* 搜尋輸入 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-1">關鍵字搜尋</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                         text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                         focus:ring-[#00f2fe] focus:border-[#00f2fe]"
              placeholder="條碼/品名/製造廠代碼"
            />
          </div>
          
          {/* 進階篩選切換 */}
          <div className="space-y-3">
            <button 
              className="flex w-full items-center justify-between px-3 py-2 text-left 
                         text-sm font-medium text-slate-300 bg-slate-800/50 rounded-md 
                         hover:bg-slate-800"
              onClick={() => {/* 切換儲位選擇器 */}
            >
              <div className="flex items-center">
                <Sliders className="h-4 w-4 mr-2" />
                <span>儲位</span>
              </div>
              <span className="text-xs text-slate-400">{filters.storageLocations.length} 個已選擇</span>
            </button>
            
            <button 
              className="flex w-full items-center justify-between px-3 py-2 text-left 
                         text-sm font-medium text-slate-300 bg-slate-800/50 rounded-md 
                         hover:bg-slate-800"
              onClick={() => {/* 切換類別選擇器 */}
            >
              <div className="flex items-center">
                <Sliders className="h-4 w-4 mr-2" />
                <span>類別</span>
              </div>
              <span className="text-xs text-slate-400">{filters.categories.length} 個已選擇</span>
            </button>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">日期範圍</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className="w-full px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                             text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                             focus:ring-[#00f2fe] focus:border-[#00f2fe]"
                />
                <input
                  type="date"
                  className="w-full px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                             text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                             focus:ring-[#00f2fe] focus:border-[#00f2fe]"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">清單狀態</label>
              {/* 這裡會有多選 checkboxes */}
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">差異狀態</label>
              {/* 這裡會有單選 radio buttons */}
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-slate-700/50">
            <button 
              onClick={() => {/* 提交篩選 */}
              className="w-full bg-[#00f2fe]/20 hover:bg-[#00f2fe]/30 text-[#00f2fe] 
                         py-2 px-4 rounded-md font-medium transition-colors
                         active:scale-95"
            >
              應用篩選
            </button>
            <button 
              onClick={() => {/* 重置篩選 */}
              className="mt-2 w-full text-slate-400 hover:text-slate-300 
                         py-2 px-4 rounded-md border border-slate-600/50"
            >
              重置
            </button>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: 驗證編譯成功**
  Run: `npm run dev` and check for TypeScript errors
  Expected: 編譯通過

- [ ] **Step 4: Commit 變更**
  ```bash
  git add src/components/SearchPanel.tsx
  git commit -m "feat: create collapsible search panel component"
  ```

### Task 16: 建立虛擬化結果表格組件

**Interfaces:**
- Consumes: Data array, loading/error states, pagination functions
- Produces: Virtualized table for efficient rendering of large datasets

- [ ] **Step 1: 建立 components 目錄和檔案驗證**
  檔案: `src/components/ResultsTable.tsx`
  Expected: 檔案尚不存在

- [ ] **Step 2: 安裝 react-window 依賴**
  Run: `npm install react-window`

- [ ] **Step 3: 實作虛擬化結果表格**
  ```typescript
  // src/components/ResultsTable.tsx
  'use client';
  
  import { FixedSizeList as List, FixedSizeColumn as Column } from 'react-window';
  import { 
    DrugSearchResult, 
    DrugHistoryItem 
  } from '@/types/query';
  import { DrugDetailDrawer } from '@/components/DrugDetailDrawer';
  
  const ROW_HEIGHT = 60;
  
  function Row({ data, index, style }: { data: DrugSearchResult[]; index: number; style: React.CSSProperties }) {
    const item = data[index];
    if (!item) return null;
    
    return (
      <div 
        style={style} 
        className="flex items-center px-4 py-2 border-b border-slate-700/50 
                   hover:bg-slate-800/50 cursor-pointer"
        onClick={() => {/* 觸發詳情抽屜顯示 */}
      >
        <div className="w-20">{item.barcode}</div>
        <div className="flex-1 min-w-0">{item.name}</div>
        <div className="w-16 text-center">{item.product_code || '-'}</div>
        <div className="w-16 text-center">{item.storage_location || '-'}</div>
        <div className="w-16 text-center">{item.category || '-'}</div>
        <div className="w-16 text-center">{item.manifest_count}</div>
        <div className="w-16 text-center">{item.total_expected}</div>
        <div className="w-16 text-center">{item.total_actual}</div>
        <div className="w-16 text-center">{item.total_discrepancy}</div>
        <div className="w-16 text-center">{item.avg_discrepancy.toFixed(2)}</div>
        <div className="w-14 text-center">{item.error_count}</div>
        <div className="w-20 text-center text-xs">
          {item.last_counted_at ? new Date(item.last_counted_at).toLocaleDateString() : '-'}
        </div>
      </div>
    );
  }
  
  export function ResultsTable({ 
    data, 
    isLoading, 
    isError, 
    fetchNextPage, 
    hasNextPage,
    refetch
  }: {
    data: DrugSearchResult[];
    isLoading: boolean;
    isError: boolean;
    fetchNextPage: () => Promise<void>;
    hasNextPage: boolean;
    refetch: () => Promise<void>;
  }) {
    const [selectedItem, setSelectedItem] = useState<DrugSearchResult | null>(null);
    
    // 這裡會處理行點擊事件來顯示詳情抽屜
    
    if (isError) {
      return <div className="p-6 text-center text-red-400">載入錯誤，請重試</div>;
    }
    
    if (isLoading && (!data || data.length === 0)) {
      return <div className="p-6 text-center text-slate-400">載入中...</div>;
    }
    
    return (
      <div className="flex-1 overflow-hidden">
        <List
          height="100%"
          itemCount={data.length}
          itemSize={ROW_HEIGHT}
          width="100%"
        >
          {/* 標題行 */}
          <Column>
            {() => (
              <div className="flex items-center px-4 py-2 bg-slate-900/50 border-b border-slate-700">
                <div className="w-20 font-medium text-slate-300">條碼</div>
                <div className="flex-1 min-w-0 font-medium text-slate-300">品名</div>
                <div className="w-16 font-medium text-slate-300">製造廠代碼</div>
                <div className="w-16 font-medium text-slate-300">儲位</div>
                <div className="w-16 font-medium text-slate-300">類別</div>
                <div className="w-16 font-medium text-slate-300">出現清單數</div>
                <div className="w-16 font-medium text-slate-300">總預期量</div>
                <div className="w-16 font-medium text-slate-300">總實際量</div>
                <div className="w-16 font-medium text-slate-300">總差異量</div>
                <div className="w-16 font-medium text-slate-300">平均差異</div>
                <div className="w-14 font-medium text-slate-300">異常次數</div>
                <div className="w-20 font-medium text-slate-300">最後清點</div>
              </div>
            )}
          </Column>
          
          {/* 資料行 */}
          <Column>
            {Row}
          </Column>
        </List>
        
        {/* 無限滾動載入更多 */}
        {hasNextPage && (
          <div className="p-4 text-center text-slate-400">
            <button 
              onClick={fetchNextPage}
              className="bg-[#00f2fe]/20 hover:bg-[#00f2fe]/30 text-[#00f2fe] 
                         py-2 px-4 rounded-md font-medium transition-colors
                         active:scale-95"
            >
              載入更多...
            </button>
          </div>
        )}
        
        {/* 空狀態 */}
        {!isLoading && (!data || data.length === 0) && (
          <div className="p-12 text-center text-slate-400">
            <p>無符合條件的藥品記錄</p>
            <button 
              onClick={refetch}
              className="mt-4 bg-[#00f2fe]/20 hover:bg-[#00f2fe]/30 text-[#00f2fe] 
                         py-2 px-4 rounded-md font-medium transition-colors
                         active:scale-95"
            >
              重新整理
            </button>
          </div>
        )}
        
        {/* 藥品詳情抽屜 */}
        {selectedItem && (
          <DrugDetailDrawer 
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </div>
    );
  }
  ```

- [ ] **Step 4: 驗證編譯成功**
  Run: `npm run dev` and check for TypeScript errors
  Expected: 編譯通過

- [ ] **Step 5: Commit 變更**
  ```bash
  git add src/components/ResultsTable.tsx
  git commit -m "feat: create virtualized results table with react-window"
  ```

### Task 17: 建立藥品詳情抽屜組件

**Interfaces:**
- Consumes: DrugSearchResult or DrugHistoryItem data
- Produces: Slide-out drawer showing detailed history for a drug

- [ ] **Step 1: 建立 components 目錄和檔案驗證**
  檔案: `src/components/DrugDetailDrawer.tsx`
  Expected: 檔案尚不存在

- [ ] **Step 2: 實作藥品詳情抽屜**
  ```typescript
  // src/components/DrugDetailDrawer.tsx
  'use client';
  
  import { 
    DrugSearchResult, 
    DrugHistoryItem 
  } from '@/types/query';
  import { 
    X, 
    Clock, 
    MapPin, 
    Folder, 
    AlertTriangle,
    CheckCircle
  } from 'lucide-react';
  
  interface DrugDetailDrawerProps {
    item: DrugSearchResult; // 或 DrugHistoryItem 取決於來源
    onClose: () => void;
  }
  
  export function DrugDetailDrawer({ item, onClose }: DrugDetailDrawerProps) {
    // 假設 item 是 DrugSearchResult 並包含 history 欄位
    const historyItems: DrugHistoryItem[] = item.history || [];
    
    return (
      <div 
        className="fixed right-0 top-0 h-full w-80 bg-slate-900/80 backdrop-blur-md 
                   translate-x-full transition-transform duration-300 ease-in-out 
                   z-50"
        // 當要顯示時會移除 translate-x-full
      >
        <div className="flex h-14 items-center justify-between px-4 bg-slate-900">
          <h2 className="text-lg font-semibold text-white">{item.name}</h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto h-full">
          {/* 基本資訊 */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-slate-300 mb-2">基本資訊</h3>
            <div className="space-y-2 text-slate-400">
              <div className="flex">
                <span className="w-20">條碼:</span>
                <span>{item.barcode}</span>
              </div>
              <div className="flex">
                <span className="w-20">製造廠代碼:</span>
                <span>{item.product_code || '-'}</span>
              </div>
              <div className="flex">
                <span className="w-20">儲位:</span>
                <span>{item.storage_location || '-'}</span>
              </div>
              <div className="flex">
                <span className="w-20">類別:</span>
                <span>{item.category || '-'}</span>
              </div>
            </div>
          </div>
          
          {/* 統計資訊 */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-slate-300 mb-2">統計資訊</h3>
            <div className="grid grid-cols-2 gap-4 text-slate-400">
              <div>
                <span className="block">出現清單數:</span>
                <span className="font-medium">{item.manifest_count}</span>
              </div>
              <div>
                <span className="block">總預期量:</span>
                <span className="font-medium">{item.total_expected}</span>
              </div>
              <div>
                <span className="block">總實際量:</span>
                <span className="font-medium">{item.total_actual}</span>
              </div