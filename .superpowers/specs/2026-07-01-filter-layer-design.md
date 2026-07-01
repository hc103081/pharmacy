# 篩選層設計規格 - 條件渲染取代主清單

## 1. 背景與問題

### 現有行為
當使用者在 `/scan` 頁面輸入條碼時，不匹配的卡片以 `visibility: hidden` 隱藏。這保留了 DOM 空間，導致匹配的項目像「浮空」一樣散落在頁面上，視覺體驗不佳。

### 目標
將篩選時的顯示從「隱藏不匹配項」改為「完全用篩選結果取代主清單」。篩選層與主清單是互斥的兩種視圖。

## 2. 設計方案

**採用方案 B：條件渲染切換**

- `barcodeInput` 為空 → 渲染完整主清單（現有邏輯）
- `barcodeInput` 有值 → 只渲染匹配的卡片（`getMatchScore > 0`），完全取代主清單
- 清除時瞬間切回主清單，無動畫

## 3. UI 細節

### 3.1 篩選層結構

```
┌──────────────────────────┐
│ 🔍 篩選結果  [2項匹配] [清除] │  ← 標題列
├──────────────────────────┤
│ ┌────────────────────┐  │
│ │ 阿斯匹靈 (條碼完全匹配) │  │  ← 最佳匹配卡片，自動展開操作區
│ │ 條碼:1234 倉位:A01     │  │
│ │ [數量正確] [數量有誤]    │  │
│ └────────────────────┘  │
│ ┌────────────────────┐  │
│ │ 阿斯匹靈(腸溶) (名稱包含) │  │  ← 次級匹配卡片，較淡樣式
│ │ 條碼:9876 倉位:B03     │  │
│ └────────────────────┘  │
│ 共 2 項匹配               │
└──────────────────────────┘
```

### 3.2 匹配等級顯示

| 分數 | 條件 | 標籤文字 |
|------|------|----------|
| 3 | 條碼完全相等 | 「條碼完全匹配」- 極光藍 |
| 2 | 條碼包含輸入 | 「條碼部分匹配」- 灰色 |
| 1 | 名稱包含輸入 | 「名稱包含」- 灰色 |

### 3.3 排序規則

- 依 `getMatchScore` 降序排列
- 同分數依 `item_order` 排序
- 最高分的項目自動視為 `matchingItem`（展開操作區）

### 3.4 操作流程（保持現有）

1. 條碼輸入 → 切換到篩選層
2. 最高分卡片展開，顯示「數量正確」/「數量有誤」按鈕
3. 按「數量正確」→ 直接完成
4. 按「數量有誤」→ 顯示實際數量輸入 + 「拍照留存」/「跳過拍照」按鈕
5. 操作完成後刷新資料，根據新的清單狀態重新渲染篩選層

### 3.5 無匹配狀態

當 `barcodeInput` 有值但沒有任何匹配時，顯示空白提示：

```
┌──────────────────────────┐
│ 🔍 篩選結果  [0項匹配] [清除] │
├──────────────────────────┤
│                          │
│    無匹配項目             │
│    請嘗試其他條碼          │
│                          │
└──────────────────────────┘
```

### 3.6 跨頁匹配

如果在當前頁無匹配但全域搜尋找到，行為保持現有：彈出 `JumpDialog` 詢問是否跳轉到目標頁。

## 4. 程式碼變更

### 4.1 ScanContent.tsx - 渲染邏輯

目前兩個位置的渲染（手機端 `<main>` 與電腦端 `<main>`）都需要修改：

```tsx
// 現有：{.filter-active > [data-filter-match="0"] { visibility: hidden }}
// 改為：
{loading ? (
  // ... 載入中
) : drugs.length === 0 ? (
  // ... 無資料
) : barcodeInput ? (
  // === 新：篩選層 ===
  <FilteredListView
    drugs={drugs}
    barcodeInput={barcodeInput}
    getMatchScore={getMatchScore}
    matchingItem={matchingItem}
    // ... 所有 DrugCard 需要的 props
  />
) : (
  // === 現有：主清單 ===
  <div className="space-y-3 pt-2">
    {drugs.map((drug) => (
      // ... 原有的 DrugCard 渲染
    ))}
  </div>
)}
```

### 4.2 新增 FilteredListView 元件

可選擇內聯實作（直接寫在 ScanContent 中用 `.filter()`）或抽出獨立元件。考慮至本頁最多 44 項，內聯實作即可。

核心篩選邏輯：

```tsx
const matchedDrugs = drugs
  .filter(d => getMatchScore(d, barcodeInput) > 0)
  .sort((a, b) => {
    const scoreDiff = getMatchScore(b, barcodeInput) - getMatchScore(a, barcodeInput);
    if (scoreDiff !== 0) return scoreDiff;
    return a.item_order - b.item_order;
  });
```

### 4.3 globals.css - 移除舊篩選樣式

移除不再需要的 CSS：

```css
/* 刪除以下兩行 */
.filter-active > [data-filter-match="0"] {
  visibility: hidden;
}
```

`.filter-active` class 名稱也一併從 JSX 中移除。

### 4.4 BarcodeSearchBar - 新增手動清除按鈕（可選）

當前 BarcodeSearchBar 已有 X 按鈕清除輸入。篩選層標題列可再加一個「清除」按鈕但非必要（X 已可觸發清除）。

### 4.5 手動點選篩選按鈕

DrugCard 中放大鏡按鈕行為不變：`onFilterByBarcode(drug.barcode)` → 填入 `barcodeInput` → 自然觸發切換到篩選層。

`onCardClick`（手動選取卡片）行為不變：設定 `manuallySelectedDrugId`，仍只在主清單中有作用。篩選層中不顯示「手動選取」的概念。

## 5. 邊界情況

- **空輸入**：`barcodeInput === ''` → 主清單模式
- **無匹配**：顯示空狀態提示，保留搜尋欄和清除按鈕
- **已鎖定（唯讀）清單**：篩選層照常顯示，但所有操作按鈕 disabled
- **拍照後刷新**：`refreshStatsOnly` 更新單一卡片狀態後，篩選層應反映最新資料（因為 drug 陣列已更新，匹配列表自動重新計算）
- **Scroll 位置**：篩選層自身管理滾動，回到主清單時不保留篩選層的滾動位置

## 6. 不在範圍內

- 不新增動畫過渡效果
- 不更改 DrugCard 的操作按鈕邏輯
- 不更改 BarcodeSearchBar 元件
- 不更改全域搜尋/跨頁跳轉邏輯