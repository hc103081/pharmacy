# PhamaCount - 藥局智能清點系統

數位化藥品清點與管理系統，將傳統紙本清點流程轉化為 Web 介面作業，支援條碼掃描比對、拍照留存與分頁對應。

## 功能特色

- **紙本清單匯入** - 上傳特定格式的 CSV 清單，自動轉化為數位化分頁
- **分頁清點模式** - 依實體紙本每頁 44 項對應，手機端友善操作
- **條碼智能比對** - 掃描或輸入條碼即時匹配藥品，支援跨頁搜尋
- **拍照留存證據** - 調用手機相機拍照，自動上傳至雲端儲存
- **異常數量追蹤** - 即時標記數量不符項目，集中管理異常清單
- **清點總結報告** - 視覺化進度概覽、異常覆核面板、CSV 匯出

## 技術棧

- **前端**: Next.js (App Router) + TypeScript + Tailwind CSS
- **後端**: Supabase (PostgreSQL + Auth + Storage)
- **部署**: Vercel (前端) + Supabase (後端)

## 開始使用

1. 安裝依賴

```bash
npm install
```

2. 設定環境變數

建立 `.env.local`，填入 Supabase 專案金鑰：

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

3. 執行資料庫 Migration

在 Supabase SQL Editor 中執行 `supabase/migrations/` 下的 migration 檔案。

4. 啟動開發伺服器

```bash
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000) 即可使用。

## 專案結構

```
src/
├── app/
│   ├── actions/       # Server Actions (匯入、封存、拍照上傳)
│   ├── import/        # 清單匯入頁面
│   ├── manifests/     # 清單列表頁面
│   ├── scan/          # 分頁清點面板
│   │   ├── components/ # 拆分元件 (DrugCard, ErrorDrawer 等)
│   │   └── hooks/     # 自訂 hooks (useBarcodeMatch, usePhotoCapture 等)
│   └── summary/       # 清點總結報告
├── lib/               # Supabase 客戶端
└── types/             # 共用型別定義
```