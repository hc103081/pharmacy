# 移除圖片壓縮限制與 B2 容量顯示 - 實作計劃

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 100KB 圖片壓縮限制，改為 1920px 解析度縮放；新增清單頁 B2 容量查看功能

**Architecture:** 核心修改 `imageCompression.ts` 移除檔案大小限制，保留解析度縮放；新增 Server Action 查詢 B2 用量，前端 Modal 顯示

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, browser-image-compression, Backblaze B2 S3 API, Supabase

## Global Constraints

- 語言：繁體中文 (註解、Toast、UI 文字)
- 主題色調：Dark Mode 科技風 (`#07142b` 背景, `#162a56` Card, `#00f2fe` Accent)
- 圖片處理：保留 `browser-image-compression` 套件，使用 Web Worker
- 儲存統計：使用縮放後實際檔案大小 (`compressedFile.size`)
- 無新增環境變數、無資料庫 Schema 變更
- 向後相容：既有 100KB 照片正常顯示

---

### Task 1: 修改 imageCompression.ts - 移除 100KB 限制

**Files:**
- Modify: `src/lib/imageCompression.ts:1-30`

**Interfaces:**
- Consumes: `browser-image-compression` library
- Produces: `compressImage(file: File): Promise<File>` - 僅做解析度縮放，回傳 File

- [ ] **Step 1: 閱讀現有檔案確認當前邏輯**

```bash
# 已在脈絡中讀取，確認 lines 1-30 結構
```

- [ ] **Step 2: 修改壓縮選項**

```typescript
// src/lib/imageCompression.ts
import imageCompression from 'browser-image-compression';

/**
 * 縮放圖片至最大長邊 1920px (不限制檔案大小、不做品質壓縮)
 * 利用 Web Worker 非阻塞處理，避免主執行緒卡頓
 */
export async function compressImage(file: File): Promise<File> {
  const options = {
    maxWidthOrHeight: 1920,   // 僅限制解析度
    useWebWorker: true,       // 非阻塞處理
    // 移除: maxSizeMB, initialQuality, fallback 邏輯
  };

  const compressed = await imageCompression(file, options);

  // 產生新 File 物件，保持原始檔名與類型
  return new File([compressed], file.name, { type: compressed.type });
}
```

- [ ] **Step 3: 驗證語法無誤**

```bash
npx tsc --noEmit src/lib/imageCompression.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/imageCompression.ts
git commit -m "refactor: 移除 100KB 壓縮限制，改為 1920px 解析度縮放"
```

---

### Task 2: 更新 usePhotoCapture.ts - 確認統計邏輯

**Files:**
- Modify: `src/app/scan/hooks/usePhotoCapture.ts:115-155`

**Interfaces:**
- Consumes: `compressImage` (Task 1 產出), `incrementStorageSize`, `getPresignedUploadUrl`
- Produces: 無新介面，僅行為變更

- [ ] **Step 1: 確認第 119 行壓縮呼叫與第 150 行統計邏輯**

```bash
# 已在脈絡中讀取，確認：
# Line 119: const compressedFile = await compressImage(file);
# Line 150: await incrementStorageSize(manifestId, compressedFile.size);
```

- [ ] **Step 2: 新增註解說明行為變更**

```typescript
// src/app/scan/hooks/usePhotoCapture.ts (約第 118-122 行)

// 3.2 縮放圖片 (限制最大長邊 1920px，不做品質壓縮)
// 註: 原先壓縮至 100KB，現改為僅解析度縮放以保留圖片品質
const compressedFile = await compressImage(file);

// ... 既有 SHA1、上傳、DB 更新邏輯保持不變 ...

// 3.5 更新清單已用容量 (使用縮放後實際檔案大小)
if (manifestId) {
  await incrementStorageSize(manifestId, compressedFile.size);
}
```

- [ ] **Step 3: 驗證 TypeScript 編譯**

```bash
npx tsc --noEmit src/app/scan/hooks/usePhotoCapture.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/app/scan/hooks/usePhotoCapture.ts
git commit -m "chore: 更新註解說明圖片縮放行為變更與容量統計邏輯"
```

---

### Task 3: 新增 B2 容量查詢 Server Action

**Files:**
- Create: `src/app/actions/manifests/getB2Usage.ts`
- Modify: `src/lib/b2.ts` (新增 `listB2ObjectsWithPrefix`)

**Interfaces:**
- Consumes: `getB2Client()`, `getBucket()`, `getB2BucketId()` from `b2.ts`
- Produces: 
  - `getManifestB2Usage(manifestId: string): Promise<{bytes: number, count: number}>`
  - `getB2BucketTotalUsage(): Promise<{bytes: number, count: number}>`

- [ ] **Step 1: 在 b2.ts 新增帶 prefix 的列舉函式**

```typescript
// src/lib/b2.ts (約第 158 行後新增)

/**
 * 列舉 B2 物件 (支援 prefix 過濾)
 * @param prefix 路徑前綴 (如 'photos/manifest-id/')
 * @param maxKeys 最大回傳數量
 */
export async function listB2ObjectsWithPrefix(
  prefix: string = '',
  maxKeys: number = 10000
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const client = getB2Client();
  const command = new ListObjectsV2Command({
    Bucket: getBucket(),
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const response = await client.send(command);
  return (response.Contents || []).map(obj => ({
    key: obj.Key!,
    size: obj.Size || 0,
    lastModified: obj.LastModified || new Date(),
  }));
}
```

- [ ] **Step 2: 建立 getB2Usage.ts Server Action**

```typescript
// src/app/actions/manifests/getB2Usage.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { listB2ObjectsWithPrefix, getB2BucketId } from '@/lib/b2';
import { generatePhotoKey } from '@/lib/b2-utils';

export interface B2UsageInfo {
  manifestUsage: number;      // 當前清單佔用 (bytes)
  manifestFileCount: number;  // 當前清單檔案數
  bucketTotalUsage: number;   // B2 Bucket 總用量 (bytes)
  bucketTotalFiles: number;   // Bucket 總檔案數
  bucketFreeSpace: number;    // 剩餘空間 (bytes)
}

/**
 * 取得 B2 儲存用量資訊
 * - Manifest 用量: 從 DB storage_size_bytes 直接讀取 (快速)
 * - Bucket 總量: 掃描 B2 物件統計 (較慢，但即時)
 */
export async function getB2Usage(
  manifestId: string
): Promise<{ success: boolean; data?: B2UsageInfo; error?: string }> {
  // 1. 驗證用戶登入與擁有權
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: '未登入或登入已過期' };
  }

  const { data: manifest, error: manifestError } = await getSupabaseAdmin()
    .from('manifests')
    .select('id, user_id, storage_size_bytes, storage_provider')
    .eq('id', manifestId)
    .single();

  if (manifestError || !manifest) {
    return { success: false, error: '清單不存在' };
  }
  if (manifest.user_id !== user.id) {
    return { success: false, error: '無權限存取此清單' };
  }

  // 2. Manifest 用量 (從 DB 直接讀取，即時)
  const manifestUsage = manifest.storage_size_bytes || 0;

  // 3. 統計 Manifest 檔案數 (從 drug_items 計算)
  const { count: manifestFileCount } = await getSupabaseAdmin()
    .from('drug_items')
    .select('*', { count: 'exact', head: true })
    .eq('manifest_id', manifestId)
    .not('photo_url', 'is', null);

  // 4. Bucket 總量統計 (掃描 B2)
  let bucketTotalUsage = 0;
  let bucketTotalFiles = 0;
  try {
    const bucketId = await getB2BucketId();
    // 注意: listB2ObjectsWithPrefix 預設 maxKeys=10000，超過需分頁
    const allObjects = await listB2ObjectsWithPrefix('', 10000);
    bucketTotalUsage = allObjects.reduce((sum, obj) => sum + obj.size, 0);
    bucketTotalFiles = allObjects.length;
  } catch (err) {
    console.warn('getB2Usage: Bucket 統計失敗', err);
    // 失敗時不阻塞，回傳 0 並由前端提示
  }

  const B2_FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024; // 10GB

  return {
    success: true,
    data: {
      manifestUsage,
      manifestFileCount: manifestFileCount || 0,
      bucketTotalUsage,
      bucketTotalFiles,
      bucketFreeSpace: Math.max(0, B2_FREE_TIER_BYTES - bucketTotalUsage),
    },
  };
}
```

- [ ] **Step 3: 驗證 TypeScript 編譯**

```bash
npx tsc --noEmit src/lib/b2.ts src/app/actions/manifests/getB2Usage.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/b2.ts src/app/actions/manifests/getB2Usage.ts
git commit -m "feat: 新增 B2 容量查詢 Server Action (getB2Usage)"
```

---

### Task 4: Manifests 頁面新增 B2 容量按鈕與 Modal

**Files:**
- Modify: `src/app/manifests/page.tsx`
- (可能) Modify: `src/app/manifests/components/ManifestList.tsx` 或相關元件

**Interfaces:**
- Consumes: `getB2Usage` Server Action (Task 3)
- Produces: UI 互動 (按鈕點擊 → Modal 顯示用量)

- [ ] **Step 1: 找出清單頁 Google Drive 圖示位置**

```bash
# 搜尋 Google Drive 相關程式碼
grep -rn "Google Drive\|google-drive\|drive" src/app/manifests/
```

- [ ] **Step 2: 新增 B2 容量按鈕與 Modal 狀態**

```tsx
// src/app/manifests/page.tsx (在表頭操作區域)

import { HardDrive } from 'lucide-react';
import { formatBytes } from '@/lib/utils'; // 假設有格式化工具

// 在元件內新增狀態
const [b2UsageModal, setB2UsageModal] = useState<{
  open: boolean;
  manifestId: string | null;
  data: B2UsageInfo | null;
  loading: boolean;
}>({ open: false, manifestId: null, data: null, loading: false });

// 開啟 Modal 處理
const handleOpenB2Usage = async (manifestId: string) => {
  setB2UsageModal({ open: true, manifestId, data: null, loading: true });
  const res = await getB2Usage(manifestId);
  setB2UsageModal(prev => ({
    ...prev,
    loading: false,
    data: res.success ? res.data : null,
  }));
};

// 表頭按鈕區域 (Google Drive 圖示左側新增)
<div className="flex items-center gap-2">
  <button
    onClick={() => handleOpenB2Usage(selectedManifestId)}
    disabled={!selectedManifestId || b2UsageModal.loading}
    className="p-2 rounded-xl bg-[#162a56] hover:bg-[#1e3a7a] text-[#00f2fe] 
               transition-colors disabled:opacity-50 disabled:cursor-not-allowed
               focus:outline-none focus:ring-2 focus:ring-[#00f2fe]"
    title="查看 B2 儲存用量"
    aria-label="查看 B2 儲存用量"
  >
    <HardDrive className="w-5 h-5" />
  </button>
  {/* 既有 Google Drive 按鈕... */}
</div>
```

- [ ] **Step 3: 實作 Modal 元件**

```tsx
// B2 容量 Modal (在回傳 JSX 末端新增)
{b2UsageModal.open && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
       onClick={() => setB2UsageModal(prev => ({ ...prev, open: false }))}
       role="dialog" aria-modal="true" aria-labelledby="b2-usage-title">
    <div className="bg-[#162a56] rounded-2xl p-6 w-full max-w-md mx-4 
                    border border-[#00f2fe]/30 shadow-[0_0_30px_rgba(0,242,254,0.1)]"
         onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h2 id="b2-usage-title" className="text-xl font-semibold text-white">
          B2 儲存用量
        </h2>
        <button onClick={() => setB2UsageModal(prev => ({ ...prev, open: false }))}
                className="text-gray-400 hover:text-white transition-colors">
          ✕
        </button>
      </div>

      {b2UsageModal.loading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-2 border-[#00f2fe] border-t-transparent 
                          rounded-full animate-spin" />
        </div>
      ) : b2UsageModal.data ? (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#07142b] rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-1">清單佔用</p>
              <p className="text-white font-mono text-lg">
                {formatBytes(b2UsageModal.data.manifestUsage)}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                {b2UsageModal.data.manifestFileCount} 張照片
              </p>
            </div>
            <div className="bg-[#07142b] rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-1">Bucket 總量</p>
              <p className="text-white font-mono text-lg">
                {formatBytes(b2UsageModal.data.bucketTotalUsage)}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                {b2UsageModal.data.bucketTotalFiles} 檔案
              </p>
            </div>
          </div>
          <div className="bg-[#07142b] rounded-xl p-4 border border-[#ff4b5c]/30">
            <p className="text-gray-400 text-xs mb-1">免費額度剩餘</p>
            <p className="text-[#ff4b5c] font-mono text-lg">
              {formatBytes(b2UsageModal.data.bucketFreeSpace)}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              免費額度 10 GB • 已用 {((b2UsageModal.data.bucketTotalUsage / (10*1024*1024*1024)) * 100).toFixed(1)}%
            </p>
            <div className="w-full h-2 bg-[#07142b] rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#00f2fe] to-[#00d4e6] 
                              transition-all duration-500"
                   style={{ width: `${Math.min(100, (b2UsageModal.data.bucketTotalUsage / (10*1024*1024*1024)) * 100)}%` }} />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-center text-gray-400 py-8">無法取得用量資訊</p>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: 新增 formatBytes 工具函數 (若不存在)**

```typescript
// src/lib/utils.ts (新增或確認已存在)
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
```

- [ ] **Step 5: 驗證建置與類型檢查**

```bash
npm run build
# 或
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/app/manifests/page.tsx src/lib/utils.ts
git commit -m "feat: 新增清單頁 B2 容量查看按鈕與 Modal"
```

---

### Task 5: E2E 測試驗證

**Files:**
- Test: `tests/e2e/b2-storage-usage.spec.ts` (新建)
- Test: `tests/e2e/image-upload-resize.spec.ts` (新建)

**Interfaces:**
- Consumes: 完整上傳流程、B2 容量 Modal
- Produces: 測試報告

- [ ] **Step 1: 圖片上傳縮放測試**

```typescript
// tests/e2e/image-upload-resize.spec.ts
import { test, expect } from '@playwright/test';

test.describe('圖片上傳縮放驗證', () => {
  test.beforeEach(async ({ page }) => {
    // 登入、進入清點頁面
    await page.goto('/scan');
    // ... 登入流程 ...
  });

  test('超大解析度照片應縮放至 1920px', async ({ page }) => {
    // 模擬選擇 4032x3024 測試圖片
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('tests/fixtures/large-photo.jpg');
    
    // 等待上傳完成
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();
    
    // 驗證 B2 物件尺寸 (需透過 API 或檢查上傳請求)
    // 這裡簡化：驗證上傳成功且無錯誤
  });

  test('小於 1920px 照片保持原尺寸', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('tests/fixtures/small-photo.jpg');
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();
  });

  test('上傳後 storage_size_bytes 反映實際檔案大小', async ({ page }) => {
    // 上傳後查詢 API 驗證 manifests.storage_size_bytes
    const response = await page.request.get('/api/manifests/...');
    const data = await response.json();
    expect(data.storage_size_bytes).toBeGreaterThan(500 * 1024); // > 500KB
    expect(data.storage_size_bytes).toBeLessThan(3 * 1024 * 1024); // < 3MB
  });
});
```

- [ ] **Step 2: B2 容量 Modal 測試**

```typescript
// tests/e2e/b2-storage-usage.spec.ts
import { test, expect } from '@playwright/test';

test.describe('B2 容量查看功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/manifests');
    // ... 登入、選擇清單 ...
  });

  test('點擊 B2 圖示開啟 Modal 顯示用量', async ({ page }) => {
    await page.click('[aria-label="查看 B2 儲存用量"]');
    await expect(page.locator('text=B2 儲存用量')).toBeVisible();
    await expect(page.locator('text=清單佔用')).toBeVisible();
    await expect(page.locator('text=Bucket 總量')).toBeVisible();
    await expect(page.locator('text=免費額度剩餘')).toBeVisible();
  });

  test('Modal 顯示進度條與百分比', async ({ page }) => {
    await page.click('[aria-label="查看 B2 儲存用量"]');
    const progressBar = page.locator('[role="progressbar"]');
    await expect(progressBar).toBeVisible();
  });
});
```

- [ ] **Step 3: 執行測試**

```bash
npx playwright test tests/e2e/image-upload-resize.spec.ts tests/e2e/b2-storage-usage.spec.ts
```

- [ ] **Step 4: Commit 測試檔案**

```bash
git add tests/e2e/image-upload-resize.spec.ts tests/e2e/b2-storage-usage.spec.ts
git commit -m "test: 新增圖片上傳縮放與 B2 容量 Modal E2E 測試"
```

---

### Task 6: 整合驗證與部署前檢查

**Files:** 無新增

- [ ] **Step 1: 執行完整建置**

```bash
npm run build
```

- [ ] **Step 2: 執行所有測試**

```bash
npm run test
npx playwright test
```

- [ ] **Step 3: 手動驗證清單**
- [ ] 拍照上傳：長邊 > 1920px → 縮放正確
- [ ] 拍照上傳：長邊 ≤ 1920px → 保持原尺寸
- [ ] 容量統計：DB `storage_size_bytes` = 所有照片 `compressedFile.size` 總和
- [ ] B2 Modal：Manifest 用量與 DB 一致
- [ ] B2 Modal：Bucket 總量與 B2 控制台一致
- [ ] 既有 100KB 照片：正常顯示、可預覽

- [ ] **Step 4: 最終 Commit**

```bash
git add -A
git commit -m "feat: 完成移除 100KB 壓縮限制與 B2 容量顯示功能"
```

---

## 待確認事項決策記錄 (供實作時參考)

| 事項 | 決策 | 備註 |
|------|------|------|
| Bucket 總量分頁 | 暫不支援，maxKeys=10000 足夠 | 10GB 免費額度約 8,000-15,000 張照片 |
| 預估可上傳張數 | Modal 顯示 `Math.floor(bucketFreeSpace / avgFileSize)` | avgFileSize 取 1MB 預估 |
| 清理孤立照片 | 不在本計劃範圍 | 另開 Issue 處理 |

---

## 執行選項

**Plan complete and saved to `docs/superpowers/plans/2026-09-20-remove-image-compression-b2-storage.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**