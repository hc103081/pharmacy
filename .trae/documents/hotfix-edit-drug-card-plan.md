# Hotfix: DrugCard 編輯功能計劃

## 目標

從 `main` 分支建立 `hotfix/edit-drug-card` 分支，於清單中的 DrugCard 加入編輯按鈕，點擊後彈出 Modal 可編輯藥品項目內容。

***

## 現狀分析

### 相關檔案

| 檔案                                     | 用途                             |
| -------------------------------------- | ------------------------------ |
| `src/app/scan/components/DrugCard.tsx` | 藥品卡片元件，顯示藥品資訊、條碼、數量、照片、操作按鈕    |
| `src/app/scan/ScanContent.tsx`         | 掃描頁主邏輯，管理藥品列表、狀態、API 呼叫        |
| `src/app/actions/scan/updatePhoto.ts`  | 更新藥品狀態的 Server Action (使用 RPC) |
| `src/app/actions/scan/resetDrug.ts`    | 重置藥品狀態的 Server Action          |
| `src/types/index.ts`                   | DrugItem 型別定義                  |

### DrugItem 可編輯欄位

```typescript
interface DrugItem {
  product_code: string | null;
  barcode: string;
  name: string;
  expected_quantity: number;
  warehouse_quantity: number | null;
  bonus_quantity: number; // 固定 0
  storage_location: string;
  category: string;
  // 以下不直接編輯：actual_quantity, counted_status, photo_url
}
```

### 設計規範 (依 AGENTS.md)

***

## 實作計劃

### 1. 建立 hotfix 分支

```bash
git checkout main
git pull origin main
git checkout -b hotfix/edit-drug-card
```

### 2. 新增 Server Action：編輯藥品基本資料

**檔案**：`src/app/actions/scan/editDrug.ts` (新建)

功能：

### 3. 擴充 DrugCard 元件

**檔案**：`src/app/scan/components/DrugCard.tsx`

新增：

### 4. 新增 EditDrugModal 元件

**檔案**：`src/app/scan/components/EditDrugModal.tsx` (新建)

設計：

### 5. 整合至 ScanContent

**檔案**：`src/app/scan/ScanContent.tsx`

新增：

### 6. 更新 DrugCard 呼叫處

**檔案**：`src/app/scan/ScanContent.tsx` (三處 map 區塊)

***

## 驗證步驟

***

## 假設與決策

| 項目          | 決策                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------- |
| 編輯按鈕位置      | 卡片右上角 (靠近照片縮圖)，使用 `Edit` 圖示                                                                        |
| 可編輯欄位       | name, barcode, product\_code, expected\_quantity, warehouse\_quantity, storage\_location, category |
| 是否允許編輯已完成項目 | **否** - 僅 `counted_status === 'pending'` 可編輯                                                       |
| 驗證規則        | 前端基本驗證 (必填、數字) + 後端權限驗證                                                                            |
| 更新後行為       | 呼叫 `refreshStatsOnly()` 只刷新統計與單筆資料，不重載整頁                                                           |

***

## 風險與緩解

| 風險     | 緩解                                      |
| ------ | --------------------------------------- |
| 並發編輯衝突 | 使用 Supabase RLS + 伺服端權限檢查，最後寫入者勝出       |
| 誤刪重要資料 | 編輯 Modal 需確認儲存，不提供刪除功能                  |
| 型別不匹配  | 共用 `DrugItem` 型別，Server Action 回傳完整更新物件 |

