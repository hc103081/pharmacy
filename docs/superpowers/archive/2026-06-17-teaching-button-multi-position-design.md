# TeachingButton 多位置重構設計

## 概述

將原先所有頁面統一的 fixed 右下角 Info 按鈕，改為每個頁面可獨立配置位置（fixed / inline）與教學模組。

## 最終配置

| 頁面 | Module | 位置 | 依附元素 |
|------|--------|------|----------|
| 主頁 `/` | `system-overview` | fixed-bottom-right | — |
| 匯入頁 `/import` | `import-function` | inline | 標題「匯入藥品清單」右旁 |
| 匯入頁 PDF 預覽 `PreviewPanel` | `pdf-preview`（新建） | inline | 篩選列「僅錯誤(N)」右旁 |
| 掃描頁 `/scan` | `barcode-scan` | inline | badge「本頁 N/M」右旁 |
| 清單列表 `/manifests` | `manifest-management`（新建） | inline | 標題「選擇清點清單」右旁 |
| 總結頁 `/summary/[id]` | `report-export` | inline | 標題「清點總結報告」右旁 |

## 技術設計

### 1. TeachingButton 重構

新增 `variant` prop：

```ts
type TeachingButtonVariant = 'fixed-bottom-right' | 'inline';

interface TeachingButtonProps {
  module: TeachingModuleType;
  variant?: TeachingButtonVariant; // 預設 'fixed-bottom-right'
  className?: string;
}
```

- `fixed-bottom-right`：保留原有 `fixed bottom-4 right-4 z-50` 圓形按鈕
- `inline`：移除所有 fixed/absolute 定位，改為 `inline-flex` 配合 `ml-2` 等間距

### 2. 新增教學模組

**manifest-management**（清單列表頁）：
- 步驟 1：清單管理概覽
- 步驟 2：檢視與選擇清單
- 步驟 3：刪除與管理清單

**pdf-preview**（PDF 預覽校驗頁）：
- 步驟 1：解析結果校驗說明
- 步驟 2：快速篩選與修正
- 步驟 3：確認匯入

### 3. 影響檔案

| 檔案 | 變動 |
|------|------|
| `src/components/teaching/TeachingButton.tsx` | 新增 variant prop |
| `src/components/teaching/TeachingContext.tsx` | 新增兩個 module 型別 |
| `src/components/teaching/teaching-content-loader.ts` | 新增模組映射和標題 |
| `src/components/teaching/manifest-management.json` | 新建 |
| `src/components/teaching/pdf-preview.json` | 新建 |
| `src/app/page.tsx` | 顯式 variant |
| `src/app/import/page.tsx` | 移動到標題右旁 + variant |
| `src/app/import/components/PreviewPanel.tsx` | 在篩選列新增 inline TeachingButton |
| `src/app/scan/page.tsx` | 移除 TeachingButton |
| `src/app/scan/ScanContent.tsx` | 在 badge「本頁 N/M」右旁新增 inline TeachingButton |
| `src/app/manifests/page.tsx` | 移動到標題右旁 + 換模組 |
| `src/app/summary/[manifestId]/page.tsx` | 移動到標題右旁 + variant |

## 驗收條件

- 主頁：fixed 右下角 Info 按鈕可正常開啟 system-overview 教學
- 匯入頁：標題右旁 inline Info 按鈕可正常開啟 import-function 教學
- PDF 預覽：篩選列「僅錯誤」右旁 inline Info 按鈕可正常開啟 pdf-preview 教學
- 掃描頁：badge「本頁 N/M」右旁 inline Info 按鈕可正常開啟 barcode-scan 教學
- 清單列表頁：標題右旁 inline Info 按鈕可正常開啟 manifest-management 教學
- 總結頁：標題右旁 inline Info 按鈕可正常開啟 report-export 教學
- TypeScript 型別檢查通過
- ESLint 檢查通過