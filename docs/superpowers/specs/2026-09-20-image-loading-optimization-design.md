# PhamaCount Web - 圖片加載優化設計文檔

## 1. 背景與問題

### 當前狀態
- 切換分頁時，`ScanContent` 在 `useEffect` 中批量請求所有藥品的 presigned URL (`/api/scan/batch-view-urls`)
- 等待全部完成後才設置 `photoViewUrls` 狀態
- 載入期間圖片位置顯示 `null` (空白)，用戶以為沒有照片
- 每頁 44 項，大多數有照片 (>30張)，全量請求導致首屏延遲明顯
- 無客戶端緩存，重複切換分頁重複請求

### 核心痛點
1. **空白佔位**：載入中無視覺反饋，用戶困惑
2. **阻塞渲染**：需等待所有 URL 返回才能顯示任意圖片
3. **無緩存**：重複請求浪費頻寬，B2 presigned URL 有效期 1 小時未利用
4. **無優先級**：非可視區圖片同等優先級爭搶連接數

---

## 2. 設計目標

| 目標 | 指標 |
|------|------|
| 首屏圖片顯示時間 | < 500ms (緩存命中) / < 1.5s (冷啟動) |
| 佔位符顯示 | 即時 (0ms 延遲) |
| 緩存命中率 | 分頁切換返回 > 90% |
| 錯誤降級 | 破圖顯示重試按鈕，不阻塞其他圖片 |
| 代碼複雜度 | 單一 Hook 封裝，組件改動最小化 |

---

## 3. 架構設計

### 3.1 模組劃分

```
src/app/scan/
├── hooks/
│   ├── useImageCache.ts      ← 新增：核心緩存與載入邏輯
│   └── usePhotoViewUrl.ts    ← 保留：向後兼容，內部調用 useImageCache
├── components/
│   └── DrugCard.tsx          ← 修改：圖片區域重構
├── ScanContent.tsx           ← 修改：整合預載入邏輯
```

### 3.2 核心數據結構

```typescript
// 本地緩存條目
interface CachedUrlEntry {
  url: string;           // presigned URL
  expiresAt: number;     // Unix timestamp (ms)
  key: string;           // B2 key / 原始 photo_url
}

// 載入狀態
type ImageLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

// Hook 返回接口
interface UseImageCacheReturn {
  // 獲取 URL (自動處理緩存/請求/過期)
  getUrl: (key: string) => Promise<string | null>;
  
  // 批量預載入 (用於首屏)
  preloadUrls: (keys: string[]) => void;
  
  // 狀態查詢
  getLoadStatus: (key: string) => ImageLoadStatus;
  
  // 手動設置狀態 (供 DrugCard 調用)
  setLoadStatus: (key: string, status: ImageLoadStatus) => void;
  
  // 緩存統計 (調試用)
  getCacheStats: () => { memory: number; localStorage: number; hitRate: number };
}
```

### 3.3 緩存策略

#### 兩級緩存架構

```
┌─────────────────────────────────────────────────────────────┐
│                      getUrl(key)                              │
├─────────────────────────────────────────────────────────────┤
│  1. Map 緩存 (記憶體，會話級)                                  │
│     ├─ 命中且未過期 → 立即返回                                 │
│     └─ 過期/未命中 → 步驟 2                                    │
├─────────────────────────────────────────────────────────────┤
│  2. localStorage 緩存 (持久化，跨會話)                         │
│     ├─ 命中且未過期 → 寫入 Map → 返回                          │
│     └─ 過期/未命中 → 步驟 3                                    │
├─────────────────────────────────────────────────────────────┤
│  3. 網絡請求 (批量 API)                                        │
│     ├─ 成功 → 寫入 Map + localStorage → 返回                   │
│     └─ 失敗 → 返回 null，設置 error 狀態                       │
└─────────────────────────────────────────────────────────────┘
```

#### localStorage 存儲格式
```json
{
  "imageCache_v1": {
    "photos/manifest_123/drug_456.jpg": {
      "url": "https://bucket.b2.cloud/...?X-Amz-Signature=...",
      "expiresAt": 1789842684000
    }
  }
}
```
- Key: `imageCache_v1` (版本化，便於未來遷移)
- 過期檢查：`Date.now() > expiresAt` 視為過期
- 容量控制：超過 500 條時清理最舊 20%

#### 並發控制
- 最大並發請求數：`6` (瀏覽器 HTTP/1.1 限制 + B2 速率限制)
- 使用隊列模式：`pendingQueue` + `activeCount`
- 請求去重：同一 key 並發請求合併為單一 Promise

---

## 4. 組件設計

### 4.1 DrugCard 圖片區域重構

#### 當前代碼 (行 200-221)
```tsx
{isUploading ? (/* 上傳中動畫 */) : photoViewUrl ? (
  <div onClick={...} className="...">
    <img src={photoViewUrl} alt="Thumbnail" className="w-full h-full object-cover" />
  </div>
) : null}
```

#### 新設計
```tsx
// 始終渲染固定尺寸容器，避免佈局偏移
<div className="relative w-11 h-11 lg:w-12 lg:h-12 rounded-lg overflow-hidden border shrink-0 shadow-inner bg-slate-900">
  {/* 1. Idle 狀態：無照片或未開始載入 */}
  {loadStatus === 'idle' && (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-600">
      <Camera className="w-5 h-5 opacity-50" />
    </div>
  )}
  
  {/* 2. Loading 狀態：灰色背景 + 藍色轉圈 */}
  {loadStatus === 'loading' && (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
      <Loader2 className="w-5 h-5 text-[#00f2fe] animate-spin" />
    </div>
  )}
  
  {/* 3. Loaded 狀態：圖片淡入動畫 */}
  {loadStatus === 'loaded' && photoViewUrl && (
    <img 
      src={photoViewUrl} 
      alt="" 
      className="w-full h-full object-cover animate-in fade-in duration-300" 
      onLoad={() => setLoadStatus(key, 'loaded')}
      onError={() => setLoadStatus(key, 'error')}
    />
  )}
  
  {/* 4. Error 狀態：破圖圖標 + 重試 (可選) */}
  {loadStatus === 'error' && (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-slate-500">
      <AlertCircle className="w-5 h-5" />
    </div>
  )}
  
  {/* 上傳中覆蓋層 (保持現有邏輯最高優先級) */}
  {isUploading && (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm z-10">
      <div className="relative w-6 h-6">
        <div className="absolute inset-0 rounded-full border-2 border-[#00f2fe]/30" />
        <div className="absolute inset-0 rounded-full border-2 border-t-[#00f2fe] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        <div className="absolute inset-1 rounded-full bg-[#00f2fe]/20 animate-ping opacity-50" />
      </div>
    </div>
  )}
</div>
```

### 4.2 視覺規格對照表

| 狀態 | 背景 | 圖標/內容 | 動畫 | 顏色 |
|------|------|-----------|------|------|
| Idle | `bg-slate-900` | Camera | 無 | `text-slate-600 opacity-50` |
| Loading | `bg-slate-900` | Loader2 | `animate-spin` | `text-[#00f2fe]` (品牌色) |
| Loaded | 圖片 | - | `animate-in fade-in duration-300` | - |
| Error | `bg-slate-800` | AlertCircle | 無 | `text-slate-500` |
| Uploading | `bg-slate-900/60 backdrop-blur-sm` | 自定義脈動環 | `animate-spin` + `animate-ping` | `#00f2fe` |

---

## 5. 懶加載實現

### 5.1 IntersectionObserver 配置
```typescript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const key = entry.target.dataset.imageKey;
      if (key && getLoadStatus(key) === 'idle') {
        // 觸發載入
        loadImage(key);
      }
      observer.unobserve(entry.target); // 單次觸發
    }
  });
}, {
  rootMargin: '100px 0px',  // 提前 100px 開始載入
  threshold: 0.01
});
```

### 5.2 DrugCard 整合
```tsx
const imgRef = useRef<HTMLDivElement>(null);
const loadStatus = useImageCache.getLoadStatus(photoKey);

useEffect(() => {
  if (!imgRef.current || loadStatus !== 'idle') return;
  
  const observer = new IntersectionObserver(...);
  observer.observe(imgRef.current);
  return () => observer.disconnect();
}, [loadStatus, photoKey]);

// 渲染容器
<div ref={imgRef} data-image-key={photoKey} className="...">
  {/* 狀態渲染邏輯 */}
</div>
```

---

## 6. ScanContent 整合邏輯

### 6.1 初始化
```tsx
const imageCache = useImageCache(manifestId);

// 頁面數據獲取完成後
useEffect(() => {
  if (drugs.length > 0) {
    // 計算首屏可視項數 (手機 ~12, 桌面 ~24)
    const visibleCount = isMobile ? 12 : 24;
    const firstScreenKeys = drugs
      .slice(0, visibleCount)
      .map(d => d.photo_url)
      .filter(Boolean);
    
    // 觸發預載入 (非阻塞)
    imageCache.preloadUrls(firstScreenKeys);
  }
}, [drugs, isMobile]);
```

### 6.2 移除舊邏輯
- 刪除 `photoViewUrls` state (行 55)
- 刪除批量請求 `useEffect` (行 429-457)
- DrugCard 直接使用 `imageCache.getUrl(photo_key)` 和狀態查詢

---

## 7. 錯誤處理與降級

### 7.1 錯誤分類
| 錯誤類型 | 處理方式 |
|----------|----------|
| 網絡錯誤 / 403 (URL 過期) | 重試 2 次 (指數退避 1s, 2s)，失敗標記 error |
| 404 (檔案不存在) | 直接標記 error，不重試 |
| CORS / 其他 | 標記 error，console.warn |

### 7.2 重試機制
```typescript
async function fetchWithRetry(key: string, retries = 2): Promise<string | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      const url = await fetchPresignedUrl(key);
      return url;
    } catch (err) {
      if (i === retries) throw err;
      await sleep(1000 * Math.pow(2, i)); // 1s, 2s
    }
  }
  return null;
}
```

---

## 8. 測試驗證清單

### 8.1 功能測試
- [ ] 首次進入頁面：佔位符即時顯示 → 圖片淡入
- [ ] 滾動頁面：可視區圖片優先載入，非可視區延後
- [ ] 切換分頁 → 返回原分頁：緩存命中，無 Loading 閃爍
- [ ] 刷新頁面：localStorage 緩存生效 (未過期)
- [ ] 模擬 403 過期 URL：自動重試 → 成功或顯示錯誤狀態
- [ ] 模擬離線：顯示錯誤狀態，不崩潰

### 8.2 性能指標
- [ ] 首屏 12 張圖片並發請求數 ≤ 6
- [ ] 緩存命中時 `getUrl` 解析 < 5ms
- [ ] 佔位容器尺寸固定，無佈局偏移 (CLS = 0)
- [ ] 內存佔用：Map 緩存 < 500 條時 < 2MB

### 8.3 邊界情況
- [ ] `photo_url` 為空/undefined：顯示 Idle 狀態 (相機圖標)
- [ ] 極快滾動：IntersectionObserver 不會遺漏觸發
- [ ] 組件卸載：清理 Observer，避免內存洩漏
- [ ] 並發請求去重：同一 key 多次調用 `getUrl` 僅發一請求

---

## 9. 實施順序

1. **Phase 1** (核心): `useImageCache.ts` - 緩存邏輯 + 批量請求 + 狀態管理
2. **Phase 2** (UI): `DrugCard.tsx` - 圖片區域重構，四狀態渲染
3. **Phase 3** (整合): `ScanContent.tsx` - 移除舊邏輯，接入新 Hook，首屏預載入
4. **Phase 4** (優化): 懶加載 IntersectionObserver，錯誤重試優化
5. **Phase 5** (驗證): 完整測試清單執行

---

## 10. 風險與緩解

| 風險 | 機率 | 影響 | 緩解方案 |
|------|------|------|----------|
| localStorage 配額超限 | 低 | 中 | 定期清理過期條目，限制 500 條 |
| B2 速率限制導致 429 | 中 | 高 | 並發限制 6，指數退避重試 |
| IntersectionObserver 不兼容 | 低 | 低 | Polyfill 或回退到全量載入 |
| 圖片淡入導致閃爍 | 中 | 低 | `animate-in fade-in` 原生 CSS 動畫，無 JS 參與 |

---

## 11. 向後兼容性

- `usePhotoViewUrl` Hook 保留，內部委託 `useImageCache`
- 現有 `getPresignedViewUrl` Server Action 不變
- API 路由 `/api/scan/batch-view-urls` 不變
- 數據庫 schema 無變更

---

**文檔版本**: 1.0  
**創建日期**: 2026-09-20  
**狀態**: 待審核