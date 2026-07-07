# Google Drive 狀態指示器重設計規範

## 概述
將「選擇清點清單」頁面頂部標題列右側的 Google Drive 連線狀態，從完整橫幅改為**圓形狀態按鈕**，佔用空間更小、視覺更簡潔，並保持點擊授權功能。

---

## 設計規範

### 1. 位置與佈局
- **位置**：標題列 `<div className="flex items-center gap-3">` 內，`TeachingButton` 之後、最右側
- **佈局**：使用 `ml-auto` 靠右對齊
- **尺寸**：`w-8 h-8` (32px × 32px)，圓形 `rounded-full`，與標題文字基準線對齊

### 2. 視覺樣式

| 狀態 | 背景色 | 圖標色 | 邊框/陰影 |
|------|--------|--------|-----------|
| **已連線** | `bg-[#00f2fe]` (極光藍) | `text-[#07142b]` (深藍底色) | `hover:shadow-[0_0_12px_rgba(0,242,254,0.6)]` |
| **未連線** | `bg-[#ff4b5c]` (霓虹紅) | `text-white` | `hover:shadow-[0_0_12px_rgba(255,75,92,0.6)]` |

- **圖標**：`lucide-react` 的 `Cloud`，大小 `w-4 h-4` (16px)
- **圓形**：`rounded-full` + `flex items-center justify-center`

### 3. 互動動畫
```css
/* 基礎過渡 */
transition-all duration-200 ease-out

/* 懸停 */
hover:scale-105
hover:shadow-[0_0_12px_rgba(0,242,254,0.6)]  /* 連線時 */
hover:shadow-[0_0_12px_rgba(255,75,92,0.6)]   /* 未連線時 */

/* 點擊 */
active:scale-95
```

### 4. 行為邏輯
- **已連線**：點擊無動作（或可考慮未來擴展為顯示 tooltip）
- **未連線**：點擊觸發 `handleGdriveConnect()` → `window.location.href = '/auth/gdrive/connect?prompt=consent'`
- **載入中**：顯示 `gdriveConnected === null` 時，按鈕禁用並顯示 `Loader2` 旋轉圖標，背景 `bg-slate-600`

### 5. 無障礙
- `aria-label`：`Google Drive 已連線` / `Google Drive 未連線，點擊授權`
- `role="button"` + `tabIndex={0}`
- 鍵盤 `Enter`/`Space` 觸發點擊

---

## 實作變更點

### 檔案：`src/app/manifests/page.tsx`

**移除**（第 167-199 行）：完整的 Google Drive 連線狀態橫幅區塊

**新增**：在標題列區域（第 134-140 行附近）加入圓形狀態按鈕組件

```tsx
{/* 標題列右側：Google Drive 狀態圓形按鈕 */}
{gdriveConnected !== null && (
  <button
    onClick={gdriveConnected ? undefined : handleGdriveConnect}
    disabled={gdriveConnected}
    aria-label={gdriveConnected ? 'Google Drive 已連線' : 'Google Drive 未連線，點擊授權'}
    className={`
      ml-auto flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
      transition-all duration-200 ease-out
      active:scale-95
      ${gdriveConnected
        ? 'bg-[#00f2fe] text-[#07142b] hover:scale-105 hover:shadow-[0_0_12px_rgba(0,242,254,0.6)] cursor-default'
        : 'bg-[#ff4b5c] text-white hover:scale-105 hover:shadow-[0_0_12px_rgba(255,75,92,0.6)] cursor-pointer'
      }
    `}
  >
    <Cloud className="w-4 h-4" />
  </button>
)}

{/* 載入中狀態 */}
{gdriveConnected === null && (
  <button
    disabled
    aria-label="Google Drive 連線狀態檢查中"
    className="ml-auto flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-slate-600 text-slate-400 cursor-wait"
  >
    <Loader2 className="w-4 h-4 animate-spin" />
  </button>
)}
```

---

## 驗收標準

1. ✅ 按鈕位於標題列最右側，與返回鍵、標題、TeachingButton 同一水平線
2. ✅ 已連線：極光藍背景 + 深色雲朵圖標；未連線：霓虹紅背景 + 白色雲朵圖標
3. ✅ 懸停放大 1.05 倍 + 同色系發光陰影；點擊縮小 0.95 倍
4. ✅ 未連線時點擊跳轉 `/auth/gdrive/connect?prompt=consent`
5. ✅ 載入中顏色灰色 + 旋轉 Loader，不可點擊
6. ✅ 符合專案 Dark Mode 科技風格（`#07142b` 底色、`backdrop-blur` 卡片）

---

## 相關檔案
- `src/app/manifests/page.tsx` - 主頁面組件
- `src/app/auth/gdrive/connect/route.ts` - 授權導向端點