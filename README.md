# PhamaCount - 藥局智能清點系統

數位化藥品清點與管理系統，將傳統紙本清點流程轉化為 Web 介面作業，支援條碼掃描比對、拍照留存、分頁對應、雲端備份與 OCR 智能辨識。

---

## 專案狀態 (2026-09-20)

| 階段 | 狀態 | 說明 |
|------|------|------|
| 核心清點流程 | ✅ 完成 | 匯入 → 清點 → 總結 → 匯出 |
| 雙條碼支援 | ✅ 完成 | 商品代碼 + 國際代碼雙欄位，掃描任一均可匹配 |
| OCR 智能辨識 | ✅ 完成 | Gemini OCR 提取補貨量/倉庫存量，非末頁 44 項自動驗證重試 |
| Google Drive 雲端備份 | 🔄 設計階段 (v2 規格完成) | 強制綁定、Cron 自動移轉、自動還原、空間釋放 |
| Google OAuth 登入 | 🔄 設計階段 (規格完成) | 取代 Magic Link，同步授權 Drive 權限 |
| 圖片加載優化 | 🔄 設計階段 (規格完成) | 兩級緩存、懶加載、佔位符、錯誤降級 |
| 程式碼重構 | 🔄 設計階段 (三階段規格完成) | 清理死碼 → 抽取共用模組 → 拆分超大檔案 |

---

## 功能特色

### 📥 紙本清單匯入
- 支援 PDF / 照片上傳，Gemini OCR 自動解析
- 固定每頁 44 項分頁對應，完全對齊實體紙本格式
- 預覽面板可人工修正 OCR 結果再匯入

### 📱 分頁清點模式 (手機優先 RWD)
- 依實體紙本每頁 44 項對應，卡片式列表佈局
- 條碼掃描/輸入即時匹配，支援跨頁搜尋
- 拍照留存證據，自動上傳至雲端儲存 (Supabase Storage / B2)
- 數量動態比對：預期 vs 實際 vs 倉庫存量三欄並排顯示

### 🏷️ 雙條碼支援
- **國際代碼** (`barcode`)：主要條碼，極光藍發光顯示
- **商品代碼** (`product_code`)：次要條碼，降低亮度區分主次
- 掃描任一條碼均可匹配到同一藥品 (分數制：完全匹配 3 分)

### 🤖 OCR 智能辨識增強
- **補貨量** (`expected_quantity`)：左欄，數字+中文單位 (如 `1 盒`、`12 包`)
- **總倉庫存量** (`warehouse_quantity`)：右欄，純整數 (如 `284`、`-12`)
- **漏品項自動偵測**：非末頁不足 44 項觸發自動重試 (最多 2 次)
- **完整性驗證**：匯入摘要顯示漏項警告與頁碼

### ☁️ Google Drive 雲端備份 (規劃中)
- **強制綁定**：首次登入必須授權 Google Drive (`drive.file` scope)
- **自動移轉**：Cron 每日將「已封存 > 1 個月」的 ZIP 移轉到用戶自有 Google Drive
- **自動還原**：用戶點還原時自動從 Google Drive 下載 ZIP 回 Supabase 再執行還原
- **空間釋放**：移轉成功後刪除 Supabase Storage 中的 ZIP，解決 1GB 免費額度限制
- **狀態機**：`active → archiving → archived → migrating → cloud_archived → restoring → active`

### 🔐 Google OAuth 登入 (規劃中)
- 完全替換 Magic Link，單一「使用 Google 登入」按鈕
- 登入同步授權 Google Drive 權限 (`openid email drive.file`)
- 二次 OAuth 流程確保取得 `refresh_token` (使用 `prompt=consent`)
- Middleware 強制綁定檢查 (含白名單死循環防禦)

### 🖼️ 圖片加載優化 (規劃中)
- **兩級緩存**：記憶體 Map (會話級) + localStorage (持久化，跨會話)
- **懶加載**：IntersectionObserver 提前 100px 載入可視區圖片
- **佔位符即時顯示**：Idle/Loading/Loaded/Error 四狀態視覺回饋
- **並發控制**：最大 6 連線，請求去重，指數退避重試
- **目標**：首屏 < 500ms (緩存命中) / < 1.5s (冷啟動)

---

## 技術棧

| 層級 | 技術 | 版本/說明 |
|------|------|-----------|
| **前端框架** | Next.js (App Router) | TypeScript, React 18 |
| **樣式** | Tailwind CSS | Dark Mode 科技風格 |
| **後端 BaaS** | Supabase | PostgreSQL + Auth + Storage + Edge Functions |
| **資料庫** | PostgreSQL | RLS、索引優化、RPC 交易 |
| **雲端儲存** | Supabase Storage / Backblaze B2 | 照片儲存、ZIP 封存 |
| **OCR AI** | Google Gemini | `gemini-3.1-flash-lite` |
| **雲端備份** | Google Drive API | Resumable Upload (256KB chunk) |
| **部署前端** | Vercel (Hobby Plan) | HTTPS 環境支援 Web Camera API |
| **部署後端** | Supabase (Free Tier) | 1GB Storage、Edge Functions (Deno) |
| **測試** | Playwright | E2E 測試覆蓋核心流程 |

---

## 系統架構

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vercel (Frontend)                        │
│  Next.js App Router + Tailwind CSS                              │
│  • /import        匯入頁 (PDF/照片 → OCR → 預覽 → 匯入)          │
│  • /manifests     清單列表 (封存/還原/刪除/雲端備份狀態)          │
│  • /scan          分頁清點面板 (條碼搜尋/拍照/數量比對)           │
│  • /summary       清點總結報告 (進度/異常/CSV匯出)                │
│  • /login         Google OAuth 登入                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / Supabase Client
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase (Backend)                         │
│  PostgreSQL + Auth + Storage + Edge Functions (Deno)            │
│                                                                 │
│  Tables:                                                        │
│  • manifests          清單主表 (狀態、封存時間、雲端備份旗標)      │
│  • drug_items         藥品明細 (雙條碼、數量三欄、照片、狀態)      │
│  • user_gdrive_connections  Google Drive 連線 (token、資料夾ID)   │
│  • gdrive_migration_jobs  移轉佇列 (狀態、重試、Storage清理旗標)  │
│  • nhi_drug_lookup    健保藥品查詢表 (product_code/barcode→中文名) │
│                                                                 │
│  RPC: create_manifest_with_items (原子化建立清單+明細)            │
│  Edge Functions:                                                │
│  • archive-manifest   封存 → ZIP → Supabase Storage              │
│  • restore-manifest   還原 → 解壓縮 → 寫回 DB                    │
│  • gdrive-migrate-cron      Cron 分派移轉任務                    │
│  • gdrive-queue-worker      佇列處理 (每5分鐘)                   │
│  • gdrive-migrate           單一清單移轉到 Google Drive          │
│  • gdrive-pull              從 Google Drive 拉 ZIP 回 Supabase   │
│  • gdrive-storage-cleanup   每週清理殘留 ZIP                     │
│  • nhi-lookup / refresh     健保藥品資料同步                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## UI/UX 視覺設計規範

| 元素 | 規格 |
|------|------|
| **背景色** | `#07142b` (深藍) |
| **卡片表面** | `#162a56` + `backdrop-blur-md` (毛玻璃) |
| **品牌色/成功** | `#00f2fe` (極光藍發光) |
| **警示/缺項** | `#ff4b5c` (霓虹紅) |
| **倉庫存量** | `#ff9f0a` (橘色) |
| **輸入框 Focus** | `shadow-[0_0_15px_rgba(0,242,254,0.5)]` 發光外框 |
| **按鈕** | `rounded-xl` / `rounded-full` + `active:scale-95` 微縮回饋 |
| **佈局** | 手機優化 Card List，放棄傳統 Table |
| **動畫** | 條碼篩選平滑隱藏/高亮、拍照 Loading 呼吸燈、圖片淡入 `animate-in fade-in duration-300` |

---

## 專案結構

```
pharmacy-sec/
├── .superpowers/              # 工具內部目錄
├── .trae/documents/           # 專案文件
├── docs/superpowers/
│   ├── archive/               # 歷史設計文件歸檔
│   ├── plans/                 # 實施計畫
│   └── specs/                 # 設計規格書 (11 份)
├── public/                    # 靜態資源
├── scripts/                   # 遷移/維護腳本
├── src/
│   ├── app/
│   │   ├── actions/
│   │   │   ├── import/        # 匯入相關 Server Actions (拆分後)
│   │   │   │   ├── types.ts   # ImportDrugItem, PageItem 等型別
│   │   │   │   ├── ocr.ts     # Gemini OCR 解析邏輯
│   │   │   │   ├── storage.ts # 圖片上傳/刪除
│   │   │   │   └── importDrugs.ts # 匯入入口 (NHI查詢+RPC)
│   │   │   ├── manifests/     # 封存/還原操作
│   │   │   └── scan/          # 清點操作 (拍照/重置/上傳)
│   │   ├── api/               # API Routes (GDrive、Cron、掃描等)
│   │   ├── auth/              # 登入/OAuth 回調
│   │   ├── import/            # 匯入頁面 (hooks + components)
│   │   ├── manifests/         # 清單列表頁 (hooks + components)
│   │   ├── scan/              # 清點面板
│   │   │   ├── components/    # DrugCard, BarcodeSearchBar, CameraModal...
│   │   │   └── hooks/         # useBarcodeMatch, useImageCache, usePhotoCapture...
│   │   └── summary/           # 總結報告
│   ├── components/
│   │   └── teaching/          # 教學引導系統
│   ├── lib/
│   │   ├── supabase/          # Supabase 客戶端 (client/server/middleware)
│   │   ├── gemini.ts          # Gemini API 共用工具
│   │   ├── nhi.ts             # 健保藥品查詢
│   │   ├── barcodeMerge.ts    # 條碼合併邏輯
│   │   ├── base64.ts          # Base64 轉換工具
│   │   ├── b2.ts              # Backblaze B2 操作
│   │   ├── imageUpload.ts     # 圖片上傳壓縮
│   │   ├── pdfParser.ts       # PDF 解析
│   │   └── ...                # 其他共用工具
│   ├── supabase/
│   │   ├── functions/         # Edge Functions (8 個正式函數)
│   │   └── migrations/        # 29 個 Migration (001-029)
│   ├── types/                 # 共用型別定義
│   └── middleware.ts          # Auth + GDrive 強制綁定
├── supabase/                  # Supabase CLI 專案設定
├── tests/e2e/                 # Playwright E2E 測試 (7 份)
├── AGENTS.md                  # Agent 角色設定
├── CLAUDE.md                  # Claude 指令
├── package.json
├── next.config.ts
├── tsconfig.json
└── vercel.json
```

---

## 開發指南

### 環境需求
- Node.js 18+
- npm 9+
- Supabase 專案 (免費方案即可)
- Google Cloud Console 專案 (OAuth + Drive API)
- Vercel 帳號 (免費方案即可)

### 環境變數 (`.env.local`)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Google OAuth (Supabase Dashboard 同步設定)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_REDIRECT_URI=https://your-domain.com/auth/gdrive/callback

# Google Gemini API
GOOGLE_API_KEY=xxx

# Backblaze B2 (可選，照片儲存)
B2_KEY_ID=xxx
B2_APPLICATION_KEY=xxx
B2_BUCKET_NAME=xxx
B2_ENDPOINT=https://s3.xxx.backblazeb2.com
```

### 本地開發

```bash
# 1. 安裝依賴
npm install

# 2. 啟動 Supabase 本地 (可選，或直接用雲端)
supabase start

# 3. 執行 Migration (雲端專案在 SQL Editor 執行)
# supabase/migrations/001_initial_schema.sql 到 029_add_storage_provider.sql

# 4. 啟動開發伺服器
npm run dev
# 開啟 http://localhost:3000
```

### 部署流程

1. **Vercel**：連結 GitHub Repository，自動偵測 Next.js，環境變數在 Vercel Dashboard 設定
2. **Supabase**：
   - Dashboard 設定 Google Provider (Authentication → Providers)
   - SQL Editor 執行所有 migrations
   - Edge Functions 部署：`supabase functions deploy <function-name>`
   - Cron 排程：`supabase_cron.yaml` 自動部署
3. **Google Cloud Console**：
   - OAuth 同意畫面切換為 **Production**
   - 加入生產域名 Redirect URI (`https://your-domain.vercel.app/auth/callback`、`/auth/gdrive/callback`)

---

## 關鍵設計文件

| 文件 | 日期 | 狀態 | 說明 |
|------|------|------|------|
| `2026-09-20-image-loading-optimization-design.md` | 2026-09-20 | 待審核 | 圖片加載優化 (緩存/懶加載/佔位符) |
| `2026-07-21-ocr-quantity-warehouse-fix-design.md` | 2026-07-21 | 已實作 | OCR 數量修正 + 倉庫存量 + 漏項驗證 |
| `2026-07-05-gdrive-cloud-backup-design-v2.md` | 2026-07-05 | 設計完成 | Google Drive 雲端備份 v2 (含佇列/狀態機) |
| `2026-07-06-google-oauth-login-replace-magic-link-design.md` | 2026-07-06 | 設計完成 | Google OAuth 登入取代 Magic Link |
| `2026-07-05-codebase-refactor-design.md` | 2026-07-05 | 設計完成 | 三階段程式碼重構規格 |
| `2026-07-02-dual-barcode-display-design.md` | 2026-07-02 | 已實作 | 雙條碼顯示與匹配 |
| `2026-07-04-dual-barcode-ocr-design.md` | 2026-07-04 | 已實作 | OCR 雙條碼提取 |

---

## 測試

```bash
# 執行 E2E 測試
npm run test:e2e

# 單獨執行特定測試
npx playwright test tests/e2e/pharmacy_flow.spec.ts
npx playwright test tests/e2e/dual-barcode.spec.ts
npx playwright test tests/e2e/gdrive-oauth.spec.ts
```

---

## 授權

本專案為內部專用系統，不對外開源授權。

---

## 更新日誌

### 2026-09-20
- 新增圖片加載優化設計規格 (兩級緩存、懶加載、四狀態佔位符)

### 2026-07-21
- 完成 OCR 數量混淆修正 (補貨量 vs 倉庫存量)
- 新增總倉庫存量顯示 (DrugCard、PreviewPanel)
- 實作 OCR 漏品項自動偵測與重試機制

### 2026-07-05
- 完成 Google Drive 雲端備份 v2 設計 (佇列機制、狀態機、Cron 排程)
- 完成三階段程式碼重構設計 (清理死碼 → 共用模組 → 拆分大檔案)

### 2026-07-06
- 完成 Google OAuth 登入設計 (取代 Magic Link，同步授權 Drive)

### 2026-07-02
- 完成雙條碼支援設計與實作 (product_code 欄位、UI 亮度區分、匹配分數制)

### 2026-06-17 起
- 核心清點流程開發 (匯入/清點/總結/封存/還原)
- Supabase 架構建立、RLS 設定、RPC 交易
- 教學引導系統、異常處理、報表匯出