# 藥局清單管理四大核心功能升級實作計劃 (Manifest Operations & Paper Alignment Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為藥局智能清點系統全面實作四大進階管理功能：即時單號檢索、盤點進度微型進度條、多選批次歸檔/移動、實體紙本 44 項對位頁碼指示。

**Architecture:** 前端採用 React 19 與 Next.js App Router，於 `src/app/manifests/page.tsx` 整合搜尋狀態、多選批次狀態機（Selection Mode）、關聯 `drug_items` 盤點完成度聚合計算；於 `src/lib/folderUtils.ts` 擴充紙本 44 項分頁換算工具函式；介面嚴格遵循科技深藍美學與無白底按鈕規範。

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, Supabase (PostgreSQL), Vitest, Lucide React, Sonner Toast.

## Global Constraints
- 唯一語言排版：台灣繁體中文，中英數半形空格，全形標點（， 。 ： ； ！）與直角引號（「 」 『 』）。
- 嚴禁 Emoji，禁止破折號作為語氣強化。
- 主題美學：深藍科技風格（Background: `#07142b`, Surface: `#162a56` / `#0d1d3a`, Accent: `#00f2fe`, Alert: `#ff4b5c`）。
- 按鈕全面宣告深色背景，杜絕瀏覽器原生白底（ButtonFace）。
- 實體紙本每頁項目數固定為 44 項。

---

### Task 1: 實體紙本 44 項對位換算工具函式與單元測試

**Files:**
- Modify: `src/lib/folderUtils.ts`
- Modify: `src/lib/__tests__/folderUtils.test.ts`

**Interfaces:**
- Produces: `calculatePaperPages(totalItems: number): { totalPages: number; pageRanges: Array<{ page: number; start: number; end: number }> }`

- [ ] **Step 1: 撰寫紙本分頁換算之失敗測試**
  於 `src/lib/__tests__/folderUtils.test.ts` 加入測試：
  - 0 項回傳 0 頁
  - 44 項回傳 1 頁（範圍 1-44）
  - 45 項回傳 2 頁（P1: 1-44, P2: 45-45）
  - 244 項回傳 6 頁（P1: 1-44, ..., P6: 221-244）
- [ ] **Step 2: 執行測試確認失敗**
  執行 `npx vitest run src/lib/__tests__/folderUtils.test.ts`
- [ ] **Step 3: 實作 `calculatePaperPages` 函式**
  於 `src/lib/folderUtils.ts` 匯出 `calculatePaperPages`
- [ ] **Step 4: 執行測試確認全數通過**
- [ ] **Step 5: Git 提交**

---

### Task 2: 藥品盤點進度微型視覺化（Progress Overview & Mini Bar）

**Files:**
- Modify: `src/app/manifests/page.tsx`
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: `drug_items(counted_status)` 關聯查詢
- Produces: 卡片內核對進度顯示 `已核對 X / Y 項 (Z%)` 與 3px 微光進度條

- [ ] **Step 1: 擴充 `Manifest` 型別加入進度統計輔助欄位**
  在 `src/types/index.ts` 的 `Manifest` 介面增加可選欄位 `completed_items?: number`
- [ ] **Step 2: 更新 `fetchManifests` 關聯查詢 `drug_items(counted_status)`**
  於 `src/app/manifests/page.tsx` 查詢時聚合取得各清單已完成項目數，並快取在 state 中
- [ ] **Step 3: 於清單卡片加入極細 3px 微光進度條與完成率文字**
  - 進行中：極光藍微光條 `bg-[#00f2fe]`，顯示 `已核對 X / Y (Z%)`
  - 100% 完成：翠綠色微光條 `bg-emerald-400`，標註「全部核對完成」
  - 0% 未開始：灰色背景軌道
- [ ] **Step 4: 驗證型別與畫面編譯**
  執行 `npx tsc --noEmit`
- [ ] **Step 5: Git 提交**

---

### Task 3: 清單即時單號與條碼搜尋（Search & Filter Bar）

**Files:**
- Modify: `src/app/manifests/page.tsx`

**Interfaces:**
- Produces: `searchTerm` 搜尋狀態與即時過濾邏輯

- [ ] **Step 1: 宣告搜尋字串狀態與過濾邏輯**
  在 `src/app/manifests/page.tsx` 加入 `searchTerm` 狀態，`displayedManifests` 支援單號（`name`, `order_number`）與條碼關鍵字不分大小寫比對
- [ ] **Step 2: 於清單標題列加入科技感微光搜尋輸入框**
  - 輸入框帶有放大鏡圖示、清除按鈕（✕）
  - Focus 時帶有 `shadow-[0_0_15px_rgba(0,242,254,0.4)]` 科技外框
  - 支援即時響應（0 ms 前端過濾）
- [ ] **Step 3: 無搜尋結果時之友好 Empty State 提示**
  當有搜尋字串但無匹配項目時，呈現「找不到符合『關鍵字』的清單」並提供「清除搜尋」按鈕
- [ ] **Step 4: 驗證型別與畫面編譯**
  執行 `npx tsc --noEmit`
- [ ] **Step 5: Git 提交**

---

### Task 4: 多選批次歸檔與移動模式（Multi-select Batch Mode）

**Files:**
- Modify: `src/app/manifests/page.tsx`

**Interfaces:**
- Produces: `isBatchSelectMode`、`selectedManifestIds: Set<string>`、底部批次浮動動作列

- [ ] **Step 1: 實作批次模式狀態機**
  - `isBatchSelectMode: boolean`
  - `selectedManifestIds: Set<string>`
  - 提供切換全選、單選勾選、退出批次模式函式
- [ ] **Step 2: 於清單區塊頂部加入「批次選取」開關鈕**
  點擊即可展開勾選方塊，不佔用常規卡片空間
- [ ] **Step 3: 卡片左側加入圓形 Checkbox**
  進入批次模式時，點擊卡片任何區域即切換選取狀態，選中呈現極光藍邊框與打勾
- [ ] **Step 4: 實作底部浮動批次動作列（Floating Batch ActionBar）**
  螢幕底部固定浮現：
  - 標籤：`已選取 X 份`
  - 按鈕：`[全選 / 取消]`、`[📁 移動目錄]`、`[💾 批次封存/還原]`、`[退出]`
- [ ] **Step 5: 串接現有批次後端函式**
  - 移動：調用 `MoveToFolderModal`（傳入選取的 IDs）
  - 封存：批次調用 `handleArchive`
- [ ] **Step 6: 驗證型別與全體測試**
  執行 `npx tsc --noEmit` 與 `npx vitest run src/lib/__tests__/`
- [ ] **Step 7: Git 提交**

---

### Task 5: 實體紙本 44 項對位指示與快速跳轉選單（Paper Alignment & Quick Jump）

**Files:**
- Modify: `src/app/manifests/page.tsx`

**Interfaces:**
- Consumes: `calculatePaperPages` from `src/lib/folderUtils.ts`

- [ ] **Step 1: 於清單卡片次要資訊列標註紙本頁數**
  卡片次標題呈現：`共 6 頁紙本`（調用 `calculatePaperPages(m.total_items).totalPages`）
- [ ] **Step 2: 於卡片「3個點（⋮）」選單加入「紙本分頁跳轉」**
  選單中增加「📄 紙本頁次直達」子選單或選項，點選後可直達該頁掃描頁面（`/scan?manifestId=xxx&page=2`）
- [ ] **Step 3: 驗證型別與單元測試**
  執行 `npx tsc --noEmit` 與 `npx vitest run`
- [ ] **Step 4: 生產打包與部署驗證**
  執行 `npm run build`，提交並推送至 `feat/manifest-folders`
