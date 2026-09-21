# 修復導航中斷上傳 + 圖片載入進度顯示 - 實作計劃

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復「點擊返回清單按鈕導致上傳中斷」Bug，並優化圖片載入轉圈動畫為進度顯示

**Architecture:** 
1. 導航攔截：站內導航用自定 Modal，關閉分頁用 beforeunload
2. 上傳狀態持久化：localStorage 記錄待上傳任務，頁面恢復續傳
3. 圖片載入進度：使用 fetch + ReadableStream 追蹤下載進度，環形進度條顯示

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, localStorage, ReadableStream API

---

## Global Constraints

- 語言：繁體中文
- 主題色調：Dark Mode 科技風 (`#07142b` 背景, `#162a56` Card, `#00f2fe` Accent, `#ff4b5c` Alert)
- 向後相容：既有上傳邏輯不變，只加防護層
- 無新增環境變數

---

### Task 1: 擴展 usePhotoCapture - 暴露上傳狀態與持久化

**Files:**
- Modify: `src/app/scan/hooks/usePhotoCapture.ts`

**Interfaces:**
- Consumes: 現有介面
- Produces: 新增 `hasPendingUploads: boolean`, `getPendingUploads(): UploadTask[]`, `restorePendingUploads(): void`

- [ ] **Step 1: 定義 UploadTask 型別與 localStorage Key**

```typescript
// 新增在檔案頂部
interface UploadTask {
  id: string;                    // drugId
  file: File;                    // 原始檔案 (需序列化為 base64 或 blob)
  barcode: string;
  pageNumber: number;
  finalQuantity: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  createdAt: number;
  retryCount: number;
  error?: string;
}

const UPLOAD_QUEUE_KEY = 'pharmacount_upload_queue_v1';
const MAX_RETRY = 3;
```

- [ ] **Step 2: 新增上傳佇列狀態與持久化函數**

```typescript
// 在 hook 內部新增
const [pendingUploads, setPendingUploads] = useState<UploadTask[]>([]);

// 從 localStorage 恢復
useEffect(() => {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(UPLOAD_QUEUE_KEY);
    if (stored) {
      const parsed: UploadTask[] = JSON.parse(stored);
      // 過濾掉已完成/失敗超過重試次數的
      const valid = parsed.filter(t => t.status !== 'completed' && t.retryCount < MAX_RETRY);
      setPendingUploads(valid);
      if (valid.length > 0) {
        console.log(`[UploadQueue] Restored ${valid.length} pending uploads`);
      }
    }
  } catch (err) {
    console.warn('[UploadQueue] Failed to restore:', err);
    localStorage.removeItem(UPLOAD_QUEUE_KEY);
  }
}, []);

// 持久化到 localStorage
const persistQueue = useCallback(() => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(pendingUploads));
  } catch (err) {
    console.warn('[UploadQueue] Persist failed:', err);
  }
}, [pendingUploads]);

// 當 pendingUploads 變更時持久化
useEffect(() => {
  persistQueue();
}, [persistQueue]);
```

- [ ] **Step 3: 修改 uploadToB2 - 加入佇列管理**

```typescript
// 在 uploadToB2 開頭加入任務到佇列
const taskId = `${drugId}_${Date.now()}`;
const newTask: UploadTask = {
  id: drugId,
  file,  // 注意: File 需特殊處理，見下方
  barcode,
  pageNumber,
  finalQuantity,
  status: 'pending',
  createdAt: Date.now(),
  retryCount: 0,
};

// 將 File 轉為 base64 以便存儲
const fileBase64 = await new Promise<string>((resolve) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result as string);
  reader.readAsDataURL(file);
});
newTask.file = fileBase64 as any; // 暫存 base64

setPendingUploads(prev => [...prev, newTask]);
setUploadingQueue(prev => new Set(prev).add(drugId));
```

- [ ] **Step 4: 上傳完成/失敗時更新佇列**

```typescript
// 成功時
setPendingUploads(prev => prev.map(t => t.id === drugId ? { ...t, status: 'completed' } : t));
// 或直接移除
setPendingUploads(prev => prev.filter(t => t.id !== drugId));

// 失敗時
setPendingUploads(prev => prev.map(t => 
  t.id === drugId ? { ...t, status: 'failed', retryCount: t.retryCount + 1, error: error.message } : t
));
```

- [ ] **Step 5: 新增 restorePendingUploads 函數供頁面載入時呼叫**

```typescript
const restorePendingUploads = useCallback(async () => {
  const tasks = pendingUploads.filter(t => t.status === 'pending' || t.status === 'failed');
  for (const task of tasks) {
    // 將 base64 轉回 File
    const file = await fetch(task.file as unknown as string).then(r => r.blob()).then(b => new File([b], `photo_${task.id}.jpg`));
    // 重新上傳
    uploadToB2(file, task.id, task.barcode, task.pageNumber);
  }
}, [pendingUploads, uploadToB2]);
```

- [ ] **Step 6: 回傳介面新增欄位**

```typescript
interface UsePhotoCaptureReturn {
  // ... 既有欄位
  uploadingQueue: Set<string>;
  hasPendingUploads: boolean;          // 新增：uploadingQueue.size > 0 || pendingUploads.length > 0
  pendingUploadsCount: number;         // 新增：總待上傳數
  restorePendingUploads: () => Promise<void>; // 新增：恢復上傳
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/scan/hooks/usePhotoCapture.ts
git commit -m "feat(upload): 新增上傳佇列持久化與恢復功能"
```

---

### Task 2: ScanContent 加入導航攔截與恢復邏輯

**Files:**
- Modify: `src/app/scan/ScanContent.tsx`

**Interfaces:**
- Consumes: `usePhotoCapture` 新增的 `hasPendingUploads`, `pendingUploadsCount`, `restorePendingUploads`
- Produces: 導航攔截邏輯、確認 Modal、頁面載入時自動恢復

- [ ] **Step 1: 接收新回傳值**

```typescript
const { 
  // ... 既有
  uploadingQueue,
  hasPendingUploads,          // 新增
  pendingUploadsCount,        // 新增
  restorePendingUploads,      // 新增
} = usePhotoCapture({ ... });
```

- [ ] **Step 2: 新增導航確認 Modal 元件 (內部或獨立檔案)**

```tsx
// 在 ScanContent.tsx 內部或新檔案 src/app/scan/components/NavigationConfirmModal.tsx
interface NavigationConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  pendingCount: number;
  message?: string;
}

function NavigationConfirmModal({ isOpen, onConfirm, onCancel, pendingCount, message }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-[#162a56] rounded-2xl p-6 w-full max-w-md mx-4 border border-[#00f2fe]/30 shadow-[0_0_30px_rgba(0,242,254,0.1)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="w-6 h-6 text-[#ff4b5c]" />
          <h2 className="text-xl font-semibold text-white">確定要離開？</h2>
        </div>
        <p className="text-slate-300 mb-4">
          目前有 <span className="font-bold text-[#00f2fe]">{pendingCount}</span> 張照片正在上傳中。
          {message && <span className="block mt-2 text-sm text-slate-400">{message}</span>}
        </p>
        <p className="text-slate-400 text-sm mb-6">離開將取消上傳，照片可能遺失，請確認是否繼續。</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors">繼續上傳</button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2 rounded-xl bg-[#ff4b5c] text-white hover:bg-[#e04050] transition-colors">確定離開</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 站內導航攔截 (返回按鈕、Link 等)**

```typescript
// 新增狀態
const [showNavConfirm, setShowNavConfirm] = useState(false);
const [pendingNavAction, setPendingNavAction] = useState<(() => void) | null>(null);

// 統一導航函數
const safeNavigate = useCallback((action: () => void) => {
  if (hasPendingUploads) {
    setPendingNavAction(() => action);
    setShowNavConfirm(true);
  } else {
    action();
  }
}, [hasPendingUploads]);

// 返回按鈕改為
<button onClick={() => safeNavigate(() => router.push('/manifests'))} ... >
  <ArrowLeft className="w-5 h-5" />
</button>

// Summary Link 改為 onClick 攔截
<Link ... > 改為 <button onClick={() => safeNavigate(() => router.push(`/summary/${manifestId}`))} ... >
```

- [ ] **Step 4: beforeunload 事件監聽 (關閉分頁/重新整理)**

```typescript
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (hasPendingUploads) {
      e.preventDefault();
      e.returnValue = `有 ${pendingUploadsCount} 張照片正在上傳中，確定要離開嗎？`;
      return e.returnValue;
    }
  };
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [hasPendingUploads, pendingUploadsCount]);
```

- [ ] **Step 5: 頁面載入時自動恢復上傳**

```typescript
useEffect(() => {
  if (manifestId && pendingUploadsCount > 0) {
    // 稍微延遲讓 UI 先渲染
    setTimeout(() => {
      restorePendingUploads();
      showToast(`正在恢復 ${pendingUploadsCount} 張照片上傳...`);
    }, 500);
  }
}, [manifestId, pendingUploadsCount, restorePendingUploads, showToast]);
```

- [ ] **Step 6: 渲染 NavigationConfirmModal**

```tsx
{/* 在 JSX 末端加入 */}
<NavigationConfirmModal
  isOpen={showNavConfirm}
  onConfirm={() => {
    pendingNavAction?.();
    setShowNavConfirm(false);
    setPendingNavAction(null);
  }}
  onCancel={() => {
    setShowNavConfirm(false);
    setPendingNavAction(null);
  }}
  pendingCount={pendingUploadsCount}
  message="照片上傳需要幾秒鐘，建議等待完成後再離開。"
/>
```

- [ ] **Step 7: Commit**

```bash
git add src/app/scan/ScanContent.tsx
git commit -m "feat(nav): 新增導航攔截確認 Modal 與上傳恢復邏輯"
```

---

### Task 3: 圖片載入進度顯示 - useImageCache 擴展

**Files:**
- Modify: `src/app/scan/hooks/useImageCache.ts`

**Interfaces:**
- Consumes: 現有 `getUrl`, `getLoadStatus`
- Produces: 新增 `getImageLoadProgress(key): number` (0-100), `ImageLoadProgress` 狀態

- [ ] **Step 1: 新增進度狀態型別**

```typescript
type ImageLoadProgress = {
  status: 'idle' | 'fetching_url' | 'downloading' | 'loaded' | 'error';
  progress: number;  // 0-100
  loadedBytes?: number;
  totalBytes?: number;
};

const [loadProgress, setLoadProgressState] = useState<Map<string, ImageLoadProgress>>(new Map());
```

- [ ] **Step 2: 修改 getUrl - 使用 fetch + ReadableStream 追蹤下載進度**

```typescript
// 新增輔助函數：帶進度的 fetch
async function fetchWithProgress(url: string, onProgress: (loaded: number, total: number) => void): Promise<Response> {
  const response = await fetch(url);
  const reader = response.body?.getReader();
  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  let loaded = 0;
  
  if (!reader || !total) {
    return response; // 無法追蹤進度
  }
  
  const stream = new ReadableStream({
    async start(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.length;
        onProgress(loaded, total);
        controller.enqueue(value);
      }
      controller.close();
    }
  });
  
  return new Response(stream, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}
```

- [ ] **Step 3: 修改圖片下載邏輯 (在 getImageUrl 或新增函數)**

```typescript
// 關鍵點：getUrl 只是拿 presigned URL，真正下載圖片是在 <img> 元素
// 我們需要新增一個函數：downloadImageWithProgress(key: string)
// 或在 DrugCard 中使用 <img onLoad onProgress> (但 img 無 progress 事件)

// 方案：使用 fetch + blob + ObjectURL 的方式下載圖片
const downloadImageWithProgress = useCallback(async (key: string): Promise<string | null> => {
  const presignedUrl = await getUrl(key);
  if (!presignedUrl) return null;
  
  setLoadProgressState(prev => {
    const next = new Map(prev);
    next.set(key, { status: 'downloading', progress: 0 });
    return next;
  });
  
  try {
    const response = await fetch(presignedUrl);
    const reader = response.body?.getReader();
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    let loaded = 0;
    const chunks: Uint8Array[] = [];
    
    if (!reader) throw new Error('No reader');
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.length;
        if (total > 0) {
          setLoadProgressState(prev => {
            const next = new Map(prev);
            next.set(key, { status: 'downloading', progress: Math.round((loaded / total) * 100), loadedBytes: loaded, totalBytes: total });
            return next;
          });
        }
      }
    }
    
    const blob = new Blob(chunks);
    const objectUrl = URL.createObjectURL(blob);
    
    setLoadProgressState(prev => {
      const next = new Map(prev);
      next.set(key, { status: 'loaded', progress: 100, loadedBytes: total, totalBytes: total });
      return next;
    });
    
    return objectUrl;
  } catch (err) {
    setLoadProgressState(prev => {
      const next = new Map(prev);
      next.set(key, { status: 'error', progress: 0 });
      return next;
    });
    return null;
  }
}, [getUrl]);
```

- [ ] **Step 4: 新增 getImageLoadProgress 回傳介面**

```typescript
return {
  // ... 既有
  getImageLoadProgress: (key: string) => loadProgress.get(key) || { status: 'idle', progress: 0 },
  downloadImageWithProgress,
};
```

- [ ] **Step 5: Commit**

```bash
git add src/app/scan/hooks/useImageCache.ts
git commit -m "feat(image): 新增圖片下載進度追蹤 (ReadableStream)"
```

---

### Task 4: DrugCard 圖片載入環形進度條

**Files:**
- Modify: `src/app/scan/components/DrugCard.tsx`

**Interfaces:**
- Consumes: `getImageLoadProgress`, `downloadImageWithProgress`
- Produces: 視覺化環形進度條

- [ ] **Step 1: 接收新 props**

```typescript
getImageLoadProgress?: (key: string) => { status: string; progress: number; loadedBytes?: number; totalBytes?: number };
downloadImageWithProgress?: (key: string) => Promise<string | null>;
```

- [ ] **Step 2: 使用進度狀態替換簡單 loading**

```tsx
// 替換第 83 行
const loadProgress = photoKey ? getImageLoadProgress?.(photoKey) : { status: 'idle', progress: 0 };
const { status: loadStatus, progress } = loadProgress;
```

- [ ] **Step 3: 觸發改用 downloadImageWithProgress**

```tsx
// 修改 triggerImageLoad
const triggerImageLoad = useCallback(async () => {
  if (!hasPhoto || !downloadImageWithProgress || !photoKey) return;
  if (loadStatus !== 'idle' || resolvedImageUrl) return;
  
  try {
    const url = await downloadImageWithProgress(photoKey);
    if (url) {
      setResolvedImageUrl(url);
    }
  } catch {
    // 錯誤已在 hook 內處理
  }
}, [hasPhoto, downloadImageWithProgress, photoKey, loadStatus, resolvedImageUrl]);
```

- [ ] **Step 4: 環形進度條 SVG 元件 (內部或獨立)**

```tsx
// 在 DrugCard.tsx 內部或新檔案
function CircularProgress({ progress, size = 28, strokeWidth = 3 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress / 100);
  
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#00f2fe30"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#00f2fe"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-300 ease-out"
        style={{ filter: 'drop-shadow(0 0 4px rgba(0,242,254,0.6))' }}
      />
      {progress > 0 && progress < 100 && (
        <text
          x={size / 2}
          y={size / 2 + 3}
          textAnchor="middle"
          fontSize={size * 0.35}
          fill="#00f2fe"
          fontWeight="bold"
          dominantBaseline="central"
        >
          {progress}%
        </text>
      )}
    </svg>
  );
}
```

- [ ] **Step 5: 替換 Loading 狀態渲染 (約第 292-296 行)**

```tsx
{/* Loading 狀態：環形進度條 */}
{!isUploading && loadStatus === 'loading' && (
  <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
    <CircularProgress progress={progress} size={28} strokeWidth={3} />
  </div>
)}

/* Fetching URL 狀態：簡單轉圈 (URL 獲取通常很快) */}
{!isUploading && loadStatus === 'fetching_url' && (
  <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
    <Loader2 className="w-5 h-5 text-[#00f2fe] animate-spin" />
  </div>
)}

/* Downloading 狀態：環形進度條 + 字節顯示 */}
{!isUploading && loadStatus === 'downloading' && (
  <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
    <CircularProgress progress={progress} size={32} strokeWidth={4} />
  </div>
)}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/scan/components/DrugCard.tsx
git commit -m "feat(ui): 圖片載入轉圈改為環形進度條顯示下載進度"
```

---

### Task 5: 整合測試與驗證

**Files:** 無新增

- [ ] **Step 1: 完整建置驗證**

```bash
npm run build
```

- [ ] **Step 2: 功能測試清單**

| 測試案例 | 預期結果 |
|----------|----------|
| 拍照上傳中點擊返回按鈕 | 顯示自定 Modal，點「繼續上傳」留在頁面，點「確定離開」導航 |
| 拍照上傳中關閉分頁/重新整理 | 瀏覽器原生 beforeunload 對話框 |
| 關閉分頁後重新開啟清點頁 | 自動恢復上傳，Toast 提示「正在恢復 N 張照片上傳」 |
| 圖片載入時 | 環形進度條從 0% 填滿到 100%，顯示百分比文字 |
| 圖片載入完成 | 淡入動畫顯示縮圖 |
| 圖片載入失敗 | 顯示 Error 圖示 |

- [ ] **Step 3: 邊界情況測試**
- [ ] 同時上傳多張照片時導航
- [ ] 網路斷線時上傳 (應進入 failed 狀態，重新載入頁面自動重試)
- [ ] localStorage 滿/損壞時優雅降級

- [ ] **Step 4: 最終 Commit**

```bash
git add -A
git commit -m "feat: 完成導航攔截上傳保護 + 圖片載入進度環形條"
```

---

## 待確認事項

| 事項 | 決策 |
|------|------|
| File 存入 localStorage 方案 | base64 Data URL (簡單) vs IndexedDB (大檔案) → 先用 base64，單張 ~1MB base64 約 1.3MB，50 張約 65MB，接近 localStorage 限制 → **改用 IndexedDB 或只存檔案資訊 + 重新拍照** |
| 實際決定 | **不存 File**，只存上傳所需參數；恢復時提示用戶「部分照片未上傳完成，請重新拍照」或提供「重新拍照」按鈕 |

---

## 執行選項

**Plan complete and saved to `docs/superpowers/plans/2026-09-20-upload-nav-guard-image-progress.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**