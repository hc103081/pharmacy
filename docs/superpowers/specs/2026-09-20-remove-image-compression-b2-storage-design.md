# 移除圖片壓縮限制與 B2 容量顯示功能 - 設計規格

**日期**: 2026-09-20
**狀態**: 待審核
**相關議題**: B2 遷移完成後移除 100KB 壓縮限制、新增 B2 容量查看功能

---

## 1. 背景與動機

### 1.1 現況
- 目前使用 `browser-image-compression` 將所有上傳照片壓縮至 **100KB 以下** (`maxSizeMB: 0.1`)
- 照片儲存於 Supabase Storage (免費額度 1GB)
- 已完成照片遷移至 Backblaze B2 (免費額度 10GB)

### 1.2 問題
- 100KB 壓縮導致照片品質過低，不利清點核對與稽核留存
- 壓縮處理增加前端等待時間 (Web Worker 壓縮約 1-3 秒)
- B2 提供 10x 儲存空間，無需極度壓縮

### 1.3 目標
1. 移除 100KB 檔案大小限制，改為 **僅限制最大長邊 1920px** 的解析度縮放
2. 保留 `browser-image-compression` 套件 (利用 Web Worker 進行高效縮放)
3. 儲存大小統計改用 **縮放後實際檔案大小**
4. 新增「B2 容量查看」功能於清單頁面

---

## 2. 架構設計

### 2.1 核心變更流程圖

```mermaid
flowchart TD
    A[用戶拍照/選檔] --> B{檢查圖片尺寸}
    B -->|長邊 > 1920px| C[browser-image-compression 縮放至 1920px]
    B -->|長邊 ≤ 1920px| D[直接使用原圖]
    C --> E[計算 SHA1]
    D --> E
    E --> F[B2 原生上傳]
    F --> G[更新 DB: photo_url=B2 key]
    G --> H[incrementStorageSize(實際檔案大小)]
```

### 2.2 檔案變更清單

| 檔案 | 變更類型 | 說明 |
|------|----------|------|
| `src/lib/imageCompression.ts` | 修改 | 移除 maxSizeMB、fallback、initialQuality；保留 maxWidthOrHeight: 1920 |
| `src/app/scan/hooks/usePhotoCapture.ts` | 修改 | 註解說明壓縮邏輯變更；storageSize 使用 compressedFile.size |
| `src/app/manifests/page.tsx` | 新增 | B2 容量查看按鈕與 Modal |
| `src/app/actions/manifests/storage.ts` | 新增 | `getB2BucketUsage()` / `getManifestStorageUsage()` |
| `src/lib/b2.ts` | 可能新增 | `listB2ObjectsWithPrefix()` 供統計使用 |

---

## 3. 詳細規格

### 3.1 imageCompression.ts 重構

```typescript
// 修改前
const options = {
  maxSizeMB: 0.1,           // 移除
  maxWidthOrHeight: 1080,   // 改為 1920
  useWebWorker: true,
};

// 移除整個 fallback 區塊 (lines 18-26)

// 修改後
const options = {
  maxWidthOrHeight: 1920,   // 僅限制解析度
  useWebWorker: true,       // 保持非阻塞
  // 不設定 maxSizeMB、initialQuality
};
```

**行為變化**:
- 輸入: 4032x3024 (約 3.5MB) → 輸出: 1920x1440 (約 800KB-1.2MB)
- 輸入: 1920x1080 (約 800KB) → 輸出: 1920x1080 (約 800KB，不重複壓縮)
- 處理時間: 從 ~2-3秒 (雙重壓縮) 降至 ~500-800ms (單次縮放)

### 3.2 usePhotoCapture.ts 影響

```typescript
// 第 119 行：壓縮呼叫保持不變，但內部行為已改變
const compressedFile = await compressImage(file);

// 第 150 行：統計使用「縮放後」大小 (非原始、非 100KB)
await incrementStorageSize(manifestId, compressedFile.size);
```

### 3.3 B2 容量查看功能

#### UI 位置
- 清單頁 (`/manifests`) 表頭右側
- Google Drive 同步圖示 **左側** 新增按鈕
- 圖示: `HardDrive` 或 `Database` (lucide-react)

#### Modal 內容
```typescript
interface B2StorageInfo {
  manifestUsage: number;      // 當前清單佔用 (bytes)
  manifestFileCount: number;  // 當前清單檔案數
  bucketTotalUsage: number;   // B2 Bucket 總用量 (bytes)
  bucketTotalFiles: number;   // Bucket 總檔案數
  bucketFreeSpace: number;    // 剩餘空間 (10GB - bucketTotalUsage)
}
```

#### 實作方式
- **方案 A (Client 端統計)**: 呼叫 `listB2Objects(prefix: photos/${manifestId}/)` 累加 size
  - 適合單一清單查詢，但 Bucket 總量需掃描所有物件
- **方案 B (Server Action + RPC)**: 新增 `get_b2_usage(manifest_id)` RPC
  - 可快速查詢單清單用量
  - Bucket 總量仍需 B2 API 或定期同步
- **方案 C (混合)**: Manifest 用量用 RPC，Bucket 總量用 `b2_list_file_names` API

**推薦方案 C**: 
- Manifest 用量: 現有 `storage_size_bytes` 欄位即可 (已由 incrementStorageSize 維護)
- Bucket 總量: 新增 Server Action 呼叫 B2 `listB2Objects('', 10000)` 統計

---

## 4. 資料流與錯誤處理

### 4.1 上傳流程錯誤處理 (現有保留)
- 壓縮失敗 → Toast 提示、保留樂觀 UI
- B2 上傳失敗 → 顯示錯誤、可重試
- DB 更新失敗 → 回滾樂觀 UI、Toast 提示

### 4.2 新增：B2 容量查詢錯誤處理
- B2 API 失敗 → Modal 顯示「無法取得 Bucket 總量」，仍顯示 Manifest 用量
- 權限不足 → 顯示「無權限查看」

---

## 5. 測試驗證標準

### 5.1 功能測試

| 測試案例 | 預期結果 |
|----------|----------|
| 拍照 4032x3024 (3.5MB) | 上傳成功，B2 存檔 1920x1440 (~1MB) |
| 拍照 1920x1080 (800KB) | 上傳成功，保持原尺寸 (~800KB) |
| 選擇 500KB 小圖 | 上傳成功，無縮放 |
| 連續拍照 10 張 | 佇列正常處理，無阻塞 |
| 斷網重傳 | 重試機制正常 |

### 5.2 容量統計驗證

| 檢查項目 | 驗證方式 |
|----------|----------|
| `manifests.storage_size_bytes` | 等於所有該清單照片 `compressedFile.size` 總和 |
| B2 Modal Manifest 用量 | 與 DB `storage_size_bytes` 一致 |
| B2 Modal Bucket 總量 | 與 B2 控制台顯示一致 (允許 <5% 誤差) |

### 5.3 效能基準

| 指標 | 目標 |
|------|------|
| 單張壓縮/縮放時間 | < 1 秒 (原 ~2-3 秒) |
| 上傳啟動延遲 | < 200ms (移除壓縮等待) |
| B2 Modal 開啟回應 | < 2 秒 |

---

## 6. 部署與相容性

### 6.1 向後相容
- **現有資料**: 已遷移至 B2 的照片 (100KB 壓縮版) 保持不變
- **新上傳**: 依新規則縮放至 1920px
- **混存**: 同一清單可能同時存在 100KB 與 ~1MB 照片，皆可正常顯示

### 6.2 環境變數
無新增環境變數需求

### 6.3 資料庫遷移
無需 Schema 變更 (現有 `storage_size_bytes`、`storage_provider` 足夠)

---

## 7. 實施順序

1. **Phase 1**: 修改 `imageCompression.ts` (核心邏輯)
2. **Phase 2**: 更新 `usePhotoCapture.ts` 註解與驗證上傳流程
3. **Phase 3**: 實作 B2 容量 Server Action (`getB2Usage`)
4. **Phase 4**: 實作 Manifests 頁面 B2 容量按鈕與 Modal
5. **Phase 5**: E2E 測試驗證 (Playwright)

---

## 8. 風險評估

| 風險 | 等級 | 緩解措施 |
|------|------|----------|
| 手機相機拍攝超大解析度導致 OOM | 低 | `browser-image-compression` 內建 Web Worker + 串流處理 |
| B2 費用超出免費額度 | 低 | 10GB 免費額度約可存 8,000-15,000 張照片；Modal 顯示剩餘空間預警 |
| 舊照片 (100KB) 與新照片 (1MB) 混雜顯示不一致 | 低 | UI 統一使用 `getPresignedViewUrl` 獲取預覽，無視原始大小 |

---

## 9. 待確認事項

- [ ] B2 Bucket 總量統計是否需支援分頁 (超過 10,000 物件)？
- [ ] 是否需在 Modal 顯示「預估可再上傳張數」？
- [ ] 是否需加入「清理孤立照片」功能 (DB 無記錄但 B2 有檔案)？

---

## 10. 簽核

- [ ] 設計審核通過
- [ ] 實作計劃確認
- [ ] 測試案例確認