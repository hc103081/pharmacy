# MobileSAM/EdgeSAM 點擊式 AI 數量分析系統整合設計書

**專案**：PhamaCount Web - 藥局智能清點系統  
**整合目標**：`/scan` 頁面 (ScanContent.tsx)  
**設計日期**：2026-08-09  
**版本**：v1.0

---

## 1. 整體架構定位

### 1.1 整合點與啟用方式
- **整合頁面**：`/scan` (ScanContent.tsx)
- **啟用入口**：Header 右側新增「齒輪圖示」→ 切換「AI 計數模式」開關
- **運行模式**：混合模式（Encoder 全圖特徵提取一次 + Decoder 點擊累加計數）
- **資料流向**：AI 計數結果 → 疊加顯示於照片上 → 使用者點擊「採用」按鈕 → 寫入 `actual_quantity`

### 1.2 系統架構圖

```
┌─────────────────────────────────────────────────────────────────┐
│  ScanContent.tsx (既有掃描頁面)                                  │
│  ├─ Header: 齒輪設定 → [AI 計數模式: 關/開]                       │
│  ├─ DrugCard: 點擊「拍照確認」 → 開啟 CameraModal                │
│  │   └─ CameraModal: 拍照/選相片 → 顯示預覽                      │
│  │       └─ [AI 模式開啟時] 疊加 AI 計數 Canvas 層               │
│  │           ├─ 點擊相片 → Decoder 產生 Mask + 數字標籤 ①②③      │
│  │           ├─ 即時顯示：AI 計數: N 顆                          │
│  │           └─ [採用 AI 結果] / [手動輸入] 按鈕                  │
│  └─ 寫入 actual_quantity → 既有 updateDrugStatus 流程            │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 執行緒架構

```
Main Thread (UI)
├─ CameraModal: 照片顯示、Canvas 疊加、點擊事件、UI 互動
├─ Decoder Session (ONNX Runtime Web): 每次點擊 <30ms 推論
└─ AI 狀態管理 (useAICounting Hook)

Web Worker (Background)
├─ Model Loader: Decoder/Encoder 下載與初始化
├─ Encoder Session: 圖片載入後執行一次，產生 Embedding
└─ postMessage(embedding, [buffer]) → Main Thread (Zero-copy)
```

---

## 2. 核心資料結構 (TypeScript)

### 2.1 新增檔案：`src/types/ai-count.ts`

```typescript
// 單一 AI 偵測物件
export interface AISegmentedItem {
  id: string;                              // UUID
  index: number;                           // 顯示編號 (1, 2, 3...)
  clickPoint: { x: number; y: number };    // 觸發點座標 (相對圖片 0~1)
  boundingBox: [number, number, number, number]; // [xMin, yMin, xMax, yMax] 相對座標
  maskData: Uint8Array;                    // 二值化 Mask (壓縮版，用於重繪)
  areaPixels: number;                      // 物體像素面積
  confidence: number;                      // SAM 信心度 (0~1)
  createdAt: number;
}

// AI 計數狀態機
export interface AICountingState {
  imageId: string;                         // 照片唯一 ID
  imageDimensions: { width: number; height: number };
  imageElement: HTMLImageElement | null;   // 原始圖片元素
  
  // 模型狀態
  isDecoderReady: boolean;
  isEncoderReady: boolean;
  isEncoderProcessing: boolean;
  imageEmbedding: any | null;              // ort.Tensor (Encoder 輸出)
  
  // 計數結果
  items: AISegmentedItem[];                // 已採集的物體列表
  totalCount: number;                      // items.length
  
  // UI 狀態
  isAIModeEnabled: boolean;                // 齒輪開關狀態
  showAIOverlay: boolean;                  // 是否顯示 Canvas 疊加層
  pendingAdoption: boolean;                // 是否有待採用的結果
  
  // Undo/Redo
  historyStack: AISegmentedItem[][];
  historyIndex: number;
}

// 模型載入狀態
export interface ModelLoadState {
  decoder: 'idle' | 'loading' | 'ready' | 'error';
  encoder: 'idle' | 'loading' | 'ready' | 'error';
  backend: 'webgpu' | 'wasm' | 'unknown';
  errorMessage?: string;
}

// Worker 通訊協定
export type WorkerMessage =
  | { type: 'INIT_DECODER'; modelUrl: string; wasmConfig: { numThreads: number; simd: boolean } }
  | { type: 'INIT_ENCODER'; modelUrl: string; wasmConfig: { numThreads: number; simd: boolean } }
  | { type: 'RUN_ENCODER'; imageBitmap: ImageBitmap }
  | { type: 'DISPOSE' };

export type WorkerResponse =
  | { type: 'DECODER_READY'; backend: 'webgpu' | 'wasm' }
  | { type: 'ENCODER_READY' }
  | { type: 'EMBEDDING_READY'; embedding: Float32Array; buffer: ArrayBuffer }  // Transferable
  | { type: 'ERROR'; message: string };
```

---

## 3. 模型載入策略 (三階段非阻塞)

### 3.1 載入時機表

| 階段 | 觸發時機 | 動作 | 執行緒 | 預估耗時 |
|------|----------|------|--------|----------|
| **Phase 1** | 進入 `/scan` 頁面 | `requestIdleCallback` 下載 **Decoder (~4MB)** + 初始化 Session | Web Worker | ~1-2s (4G) |
| **Phase 2** | 使用者點擊「拍照」或「選相片」 | 背景下載 **Encoder (~35MB)** + Web Worker 初始化 | Web Worker | ~3-5s (4G) |
| **Phase 3** | 照片載入完成、Canvas 就緒 | 執行 **Encoder 推論** 產生 Embedding → 快取 | Web Worker | <600ms (WebGPU) / <1.8s (WASM) |

### 3.2 Service Worker 快取策略

```javascript
// public/sw.js
const MODEL_CACHE = 'mobile-sam-models-v1';
const MODEL_ASSETS = [
  '/models/mobile_sam_decoder.onnx',
  '/models/mobile_sam_encoder.onnx',
  '/wasm/ort-wasm-simd.wasm',
  '/wasm/ort-wasm.wasm'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(MODEL_CACHE).then(c => c.addAll(MODEL_ASSETS)));
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/models/') || e.request.url.includes('/wasm/')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
```

**效益**：首次下載後，後續造訪/離線皆從 CacheStorage 讀取，流量成本 $0。

---

## 4. 雙引擎降級機制 (WebGPU → WASM+SIMD)

### 4.1 初始化邏輯

```typescript
// src/lib/ai/onnx-session.ts
import * as ort from 'onnxruntime-web';

export interface SessionResult {
  session: ort.InferenceSession;
  backend: 'webgpu' | 'wasm';
}

export async function createDecoderSession(): Promise<SessionResult> {
  const modelUrl = '/models/mobile_sam_decoder.onnx';
  
  try {
    // 優先嘗試 WebGPU
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'all',
    });
    return { session, backend: 'webgpu' };
  } catch (e) {
    console.warn('WebGPU 不支援，降級 WASM+SIMD', e);
    
    // 降級配置
    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
    ort.env.wasm.simd = true;
    
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    });
    return { session, backend: 'wasm' };
  }
}

export async function createEncoderSession(): Promise<SessionResult> {
  // 同樣邏輯，Encoder 在 Web Worker 中執行
  const modelUrl = '/models/mobile_sam_encoder.onnx';
  // ... 相同降級邏輯
}
```

### 4.2 UI 狀態指示器
右下角固定顯示：`🟢 WebGPU` / `🟡 CPU (WASM)` 狀態標籤，讓使用者知悉當前效能模式。

---

## 5. 點擊累加計數邏輯與 IoU 去重

### 5.1 核心演算法

```typescript
// src/lib/ai/counting-logic.ts

const IOU_THRESHOLD = 0.75;
const MIN_MASK_AREA = 10; // px

export function calculateIoU(maskA: Uint8Array, maskB: Uint8Array): number {
  let intersection = 0, union = 0;
  for (let i = 0; i < maskA.length; i++) {
    const a = maskA[i], b = maskB[i];
    if (a && b) intersection++;
    if (a || b) union++;
  }
  return union > 0 ? intersection / union : 0;
}

export function computeBBox(mask: Uint8Array, width: number): [number, number, number, number] {
  let minX = width, minY = width, maxX = 0, maxY = 0;
  let found = false;
  for (let y = 0; y < Math.sqrt(mask.length); y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        found = true;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return found ? [minX/width, minY/width, maxX/width, maxY/width] : [0,0,0,0];
}

export function computeConfidence(logits: Float32Array): number {
  // 取 mask logits 最大值經 sigmoid
  const maxLogit = Math.max(...logits);
  return 1 / (1 + Math.exp(-maxLogit));
}

export function binarizeAndResize(
  logits: Float32Array, 
  targetDim: { width: number; height: number },
  threshold = 0
): Uint8Array {
  const srcW = Math.sqrt(logits.length); // 假設 256x256
  const srcH = srcW;
  const { width, height } = targetDim;
  const output = new Uint8Array(width * height);
  
  const scaleX = srcW / width;
  const scaleY = srcH / height;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(Math.floor(x * scaleX), srcW - 1);
      const srcY = Math.min(Math.floor(y * scaleY), srcH - 1);
      const val = logits[srcY * srcW + srcX];
      output[y * width + x] = val > threshold ? 1 : 0;
    }
  }
  return output;
}

export async function processClick(
  state: AICountingState,
  clickX: number,      // 相對圖片 0~1
  clickY: number,
  label: 1 | 0,        // 1=正向(新增), 0=負向(排除)
  decoderSession: ort.InferenceSession,
  imageEmbedding: ort.Tensor
): Promise<AISegmentedItem | { action: 'delete'; item: AISegmentedItem } | null> {
  
  // 1. 產生 Point Prompt (SAM 輸入解析度 1024x1024)
  const pointCoords = new Float32Array([[clickX * 1024, clickY * 1024]]);
  const pointLabels = new Float32Array([label]);
  
  // 2. 執行 Decoder
  const feeds = {
    image_embeddings: imageEmbedding,
    point_coords: new ort.Tensor('float32', pointCoords, [1, 1, 2]),
    point_labels: new ort.Tensor('float32', pointLabels, [1, 1]),
    orig_im_size: new ort.Tensor('float32', new Float32Array([state.imageDimensions.height, state.imageDimensions.width]), [1, 2]),
  };
  
  const results = await decoderSession.run(feeds);
  const maskLogits = results.masks?.data as Float32Array;
  
  // 釋放輸入 Tensor (關鍵：防記憶體洩漏)
  feeds.point_coords.dispose();
  feeds.point_labels.dispose();
  feeds.orig_im_size.dispose();
  
  // 3. 後處理：二值化 + Resize 回原圖解析度
  const binaryMask = binarizeAndResize(maskLogits, state.imageDimensions);
  const area = binaryMask.reduce((a, b) => a + b, 0);
  
  if (area < MIN_MASK_AREA) return null; // 太小視為無效
  
  // 4. IoU 去重檢查
  for (const existing of state.items) {
    const iou = calculateIoU(binaryMask, existing.maskData);
    if (iou > IOU_THRESHOLD) {
      if (label === 1) return null; // 正向點擊重複 → 忽略
      // 負向點擊高重疊 → 刪除既有項目 (參見 Edge Case 4)
      return { action: 'delete', item: existing };
    }
  }
  
  // 5. 建立新項目
  return {
    id: crypto.randomUUID(),
    index: state.items.length + 1,
    clickPoint: { x: clickX, y: clickY },
    boundingBox: computeBBox(binaryMask, state.imageDimensions.width),
    maskData: binaryMask,
    areaPixels: area,
    confidence: computeConfidence(maskLogits),
    createdAt: Date.now(),
  };
}
```

### 5.2 互動流程
1. 使用者點擊相片 → 立即顯示 **Ripple 波紋動畫** (視覺回饋)
2. Decoder 推論 (< 30ms WebGPU / < 80ms WASM)
3. 產生 Mask → 疊加繪製半透明綠色 (`rgba(0,255,120,0.35)`) + 數字 Badge `①`
4. 即時更新底部：**AI 計數: N 顆**

---

## 6. UI/UX 設計規範

### 6.1 Header 齒輪設定 (現有 Header 右側新增)
```tsx
// ScanContent.tsx Header 區域新增
<div className="flex items-center gap-2">
  <button
    onClick={() => setShowAISettings(!showAISettings)}
    className="p-2 rounded-full hover:bg-slate-700 transition-colors"
    aria-label="AI 計數設定"
  >
    <Settings className="w-5 h-5 text-slate-400 hover:text-[#00f2fe]" />
  </button>
  
  {showAISettings && (
    <div className="absolute right-4 top-full mt-2 p-3 bg-[#162a56] border border-blue-500/30 rounded-xl shadow-lg z-50 min-w-[200px]">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={aiCountingState.isAIModeEnabled}
          onChange={e => toggleAIMode(e.target.checked)}
          className="w-4 h-4 accent-[#00f2fe]" />
        <span className="text-sm font-medium text-slate-200">啟用 AI 計數模式</span>
      </label>
      <div className="mt-2 pt-2 border-t border-slate-700 text-xs text-slate-500">
        模式: {modelLoadState.backend === 'webgpu' ? '🟢 WebGPU' : '🟡 CPU (WASM)'}
      </div>
    </div>
  )}
</div>
```

### 6.2 CameraModal 內嵌 AI 疊加層 (含 Edge Case 1 座標對位)
```tsx
// CameraModal.tsx - 關鍵修改點
<div className="relative" ref={containerRef}>
  {/* 原始照片 - object-contain 保持比例 */}
  <img 
    src={photoUrl} 
    ref={imgRef} 
    className="max-w-full max-h-[70vh] object-contain" 
    onLoad={handleImageLoad}
  />
  
  {/* AI 疊加 Canvas - 解析度 = 圖片原始尺寸，CSS 縮放配合 img */}
  {aiCountingState.isAIModeEnabled && aiCountingState.isEncoderReady && (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 pointer-events-none"
      // 關鍵：canvas 內部解析度 = naturalWidth/Height
      // CSS 由 handleImageLoad 動態設定 width/height = img.getBoundingClientRect()
    />
  )}
  
  {/* AI 模式開啟但 Encoder 尚未就緒 */}
  {aiCountingState.isAIModeEnabled && !aiCountingState.isEncoderReady && !aiCountingState.isEncoderProcessing && (
    <button 
      onClick={triggerEncoderComputation}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#00f2fe] text-slate-900 px-4 py-2 rounded-xl font-bold"
    >
      初始化 AI 模型中...
    </button>
  )}
</div>
```

**座標歸一化邏輯 (Edge Case 1)**：
```typescript
const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
  const rect = imgRef.current.getBoundingClientRect();
  // 關鍵：使用 img 的顯示矩形，而非 canvas (canvas 可能全螢幕)
  const clickX = (e.clientX - rect.left) / rect.width;   // 0~1
  const clickY = (e.clientY - rect.top) / rect.height;   // 0~1
  
  // 傳給 Decoder 的座標已歸一化，Decoder 內部會 * 1024
  processClick(clickX, clickY, 1);
};
```

### 6.3 底部 AI 計數操作列 (Sticky Bottom Bar)
```tsx
{aiCountingState.isAIModeEnabled && aiCountingState.items.length > 0 && (
  <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#162a56]/95 backdrop-blur border-t border-blue-500/30 z-40">
    <div className="max-w-xl mx-auto flex flex-col gap-3">
      {/* 計數顯示 */}
      <div className="flex items-center justify-between text-center">
        <span className="text-slate-400 text-sm">AI 偵測顆粒數</span>
        <span className="text-4xl font-bold font-mono text-[#00f2fe] drop-shadow-[0_0_15px_rgba(0,242,254,0.5)]">
          {aiCountingState.totalCount}
        </span>
        <span className="text-slate-400 text-sm">顆</span>
      </div>
      
      {/* 操作按鈕群 */}
      <div className="flex gap-2">
        <button
          onClick={undoLastClick}
          disabled={aiCountingState.historyIndex <= 0}
          className="flex-1 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-colors"
        >
          <RotateCcw className="w-4 h-4 inline mr-1" /> 復原
        </button>
        <button
          onClick={clearAllClicks}
          className="flex-1 px-4 py-2 rounded-xl bg-slate-800 text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors"
        >
          清空全部
        </button>
        <button
          onClick={adoptAICount}
          className="flex-1 px-4 py-3 rounded-xl bg-[#00f2fe] text-slate-900 font-bold shadow-[0_0_10px_rgba(0,242,254,0.4)] hover:bg-[#00f2fe]/90 active:scale-95 transition-all"
        >
          <CheckCircle2 className="w-4 h-4 inline mr-1" /> 採用 AI 結果 ({aiCountingState.totalCount})
        </button>
      </div>
    </div>
  </div>
)}
```

---

## 7. 四大關鍵 Edge Cases 實作細節 (Critical Implementation Details)

### 7.1 Edge Case 1：Canvas 座標點擊對位 (High-DPI & Object-Contain Offset)

**問題**：圖片在 `object-contain` 縮放時，CSS 顯示尺寸 ≠ 圖片真實尺寸。Retina 螢幕 `devicePixelRatio > 1` 進一步複雜化座標映射。

**解決方案**：
```typescript
// Canvas 解析度 = 圖片原始像素尺寸 (naturalWidth/Height)
const canvas = canvasRef.current;
const img = imgRef.current;
canvas.width = img.naturalWidth;
canvas.height = img.naturalHeight;

// CSS 顯示尺寸 = img.getBoundingClientRect() (配合 object-contain)
canvas.style.width = `${img.clientWidth}px`;
canvas.style.height = `${img.clientHeight}px`;

// 高 DPI 修正：實際繪製時 scale(devicePixelRatio)
const ctx = canvas.getContext('2d');
ctx.scale(devicePixelRatio, devicePixelRatio);

// 點擊座標歸一化 (關鍵公式)
const rect = img.getBoundingClientRect();  // 使用 img 而非 canvas
const clickX = (e.clientX - rect.left) / rect.width;   // 0~1
const clickY = (e.clientY - rect.top) / rect.height;   // 0~1

// 繪製標籤時：使用歸一化座標 * canvas.width/height
ctx.fillText(`①`, clickX * canvas.width, clickY * canvas.height);
```

**驗證清單**：
- [ ] 手機直向/橫向切換後點擊位置正確
- [ ] Retina 螢幕 (iPhone/MacBook) 標籤位置精準
- [ ] 縱向/橫向長圖 `object-contain` 留白區域點擊無誤判

---

### 7.2 Edge Case 2：Tensor 記憶體洩漏與 OOM 防範

**問題**：iOS Safari 記憶體限制嚴格 (~250-500MB)。連續掃描 3-5 張相片若不釋放 Tensor，必定 OOM。

**解決方案**：
```typescript
// src/hooks/useAICounting.ts - 關鍵清理時機

// 1. 切換照片 / 重新拍照時
const resetForNewImage = useCallback(() => {
  // 必須先釋放 embedding，再清空狀態
  if (state.imageEmbedding) {
    state.imageEmbedding.dispose();  // 釋放 WebGPU/WASM 顯存
    state.imageEmbedding = null;
  }
  // 釋放所有 Mask Tensor (若有保留)
  state.items.forEach(item => {
    if (item.maskTensor) item.maskTensor.dispose();
  });
  setState(prev => ({ ...prev, items: [], imageEmbedding: null, isEncoderReady: false }));
}, []);

// 2. 關閉 CameraModal 時 (useEffect cleanup)
useEffect(() => {
  return () => {
    if (state.imageEmbedding) {
      state.imageEmbedding.dispose();
      state.imageEmbedding = null;
    }
    // Worker 端也要清理
    worker.postMessage({ type: 'DISPOSE' });
  };
}, []);

// 3. 每次 Decoder 推論後立即釋放輸入 Tensor
const runDecoder = async (pointCoords, pointLabels, origSize) => {
  const feeds = {
    image_embeddings: embedding,  // 這個不釋放 (快取重用)
    point_coords: new ort.Tensor(...),
    point_labels: new ort.Tensor(...),
    orig_im_size: new ort.Tensor(...),
  };
  const results = await session.run(feeds);
  
  // 立即釋放本次建立的輸入 Tensor
  feeds.point_coords.dispose();
  feeds.point_labels.dispose();
  feeds.orig_im_size.dispose();
  
  // 輸出 results.masks 也要在用完後 dispose
  return results;
};
```

**記憶體監控建議**：
```typescript
// 開發環境記憶體監控
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    if ('memory' in performance) {
      const mem = (performance as any).memory;
      console.log(`JS Heap: ${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB / ${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB`);
    }
  }, 5000);
}
```

---

### 7.3 Edge Case 3：Web Worker 零拷貝傳輸 (Transferable Objects)

**問題**：Encoder 輸出 `1×64×256×256 = 1,048,576` floats (~4MB)。普通 `postMessage` 會複製記憶體，造成 10-30ms 延遲 + 記憶體壓力。

**解決方案**：
```typescript
// Worker 端 (encoder-worker.ts)
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === 'RUN_ENCODER') {
    const { imageBitmap } = e.data;
    
    // 前處理: resize to 1024x1024, normalize, to tensor
    const inputTensor = preprocessImage(imageBitmap); // ort.Tensor
    
    // 執行 Encoder
    const results = await encoderSession.run({ images: inputTensor });
    const embedding = results.image_embeddings; // ort.Tensor
    
    // 關鍵：取得 Float32Array 並轉移所有權
    const float32Data = embedding.data as Float32Array;
    
    // postMessage with transferable - 零拷貝！
    self.postMessage(
      { 
        type: 'EMBEDDING_READY', 
        embedding: float32Data,
        shape: embedding.dims 
      },
      [float32Data.buffer]  // Transferable: 轉移 ArrayBuffer 所有權
    );
    
    // 釋放 Worker 端的 Tensor
    inputTensor.dispose();
    embedding.dispose();
  }
};

// Main Thread 接收
worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
  if (e.data.type === 'EMBEDDING_READY') {
    // e.data.embedding 現在直接指向同一塊記憶體 (零拷貝)
    // 重建 ort.Tensor (不複製資料)
    const tensor = new ort.Tensor('float32', e.data.embedding, e.data.shape);
    setImageEmbedding(tensor);
    setIsEncoderReady(true);
  }
};
```

**效能提升**：傳輸耗時從 ~20-30ms 降至 <1ms。

---

### 7.4 Edge Case 4：SAM 負向點擊 (Label 0) 的多點 Prompt 機制

**問題**：SAM 原生 negative prompt 需將「多個正點 + 負點」打包成 `[N, 2]` Tensor 一次送給 Decoder 修補邊界。但我們的情境是「手動刪除誤判」。

**解決方案**：**不使用 SAM 原生負向點擊**，改用前端邏輯直接判定並移除：

```typescript
// src/lib/ai/counting-logic.ts - 簡化版負向處理

export function handleNegativeClick(
  state: AICountingState,
  clickX: number,
  clickY: number
): AISegmentedItem | null {
  // 1. 檢查點擊位置是否落在現有 Mask 內部
  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i];
    const mask = item.maskData;
    const width = state.imageDimensions.width;
    const x = Math.floor(clickX * width);
    const y = Math.floor(clickY * width);
    
    if (x >= 0 && x < width && y >= 0 && y < width) {
      const idx = y * width + x;
      if (mask[idx] === 1) {
        // 命中現有 Mask → 直接刪除該項目
        return { action: 'delete', index: i, item };
      }
    }
  }
  return null; // 沒打到任何 Mask，忽略
}

// 在 UI 層處理
const handleCanvasClick = (e, isNegative = false) => {
  if (isNegative) {
    const result = handleNegativeClick(state, clickX, clickY);
    if (result?.action === 'delete') {
      // 從陣列移除，重新編排 index
      setItems(prev => prev.filter((_, idx) => idx !== result.index)
        .map((item, idx) => ({ ...item, index: idx + 1 })));
      pushHistory();
    }
  } else {
    // 正向點擊 → 呼叫 Decoder
    processPositiveClick(clickX, clickY);
  }
};
```

**優點**：
- 不重跑 Decoder，零延遲
- 邏輯確定，無模型不確定性
- 符合「點擊現有標註刪除」的直覺操作

**何時需要真正的 SAM Negative Prompt**：
- 使用者想「修剪邊界」(例如 Mask 過大，點擊外圍排除) → 此時才需打包多點送 Decoder
- 目前需求為「刪除誤判」，前端邏輯即可滿足

---

## 8. 整合現有流程 (關鍵接點)

| 現有元件 | 修改重點 |
|----------|----------|
| **ScanContent.tsx** | 新增 `aiCountingState`、Header 齒輪開關、傳遞 `isAIModeEnabled` 給 CameraModal |
| **CameraModal.tsx** | 新增 Canvas 疊加層、點擊事件處理、底部 AI 操作列、座標歸一化邏輯 |
| **usePhotoCapture.ts** | `onCapture` 回傳時攜帶 `aiCount: number`，`adoptAICount` 時直接寫入 `actualQuantity` |
| **DrugCard.tsx** | 無需修改，既有 `onTriggerCamera` → `updateDrugStatus` 流程不變 |

**資料流向**：
```
使用者點擊「拍照確認」 
  → CameraModal 開啟 (isAIModeEnabled=true)
  → 拍照/選相片完成
  → 背景觸發 Encoder (若未載入)
  → 使用者點擊相片 → Decoder 產生 Mask + 計數
  → 使用者點擊「採用 AI 結果」
  → onCapture(photoUrl, aiCount) 
  → usePhotoCapture.handleCameraFile → updateDrugStatus(drugId, photoUrl, aiCount)
  → 既有資料庫更新流程
```

---

## 9. 檔案結構規劃

```
src/
├─ types/
│  └─ ai-count.ts                 # 新增：AI 計數核心型別
├─ lib/
│  └─ ai/
│     ├─ onnx-session.ts          # 新增：雙引擎 Session 建立
│     ├─ counting-logic.ts        # 新增：IoU、點擊處理、後處理
│     └─ model-loader.ts          # 新增：三階段載入協調器
├─ hooks/
│  ├─ useAICounting.ts            # 新增：AI 計數狀態管理 Hook
│  └─ useModelLoader.ts           # 新增：模型載入進度 Hook
├─ workers/
│  └─ encoder.worker.ts           # 新增：Encoder Web Worker
├─ components/
│  └─ scan/
│     └─ AICountOverlay.tsx       # 新增：Canvas 疊加元件
└─ app/
   └─ scan/
      ├─ page.tsx                 # 修改：Header 齒輪、狀態注入
      ├─ ScanContent.tsx          # 修改：整合 useAICounting
      └─ components/
         └─ CameraModal.tsx       # 修改：AI Canvas、底部操作列
public/
├─ models/
│  ├─ mobile_sam_encoder.onnx     # 需放置 (約 35MB)
│  └─ mobile_sam_decoder.onnx     # 需放置 (約 4MB)
├─ wasm/
│  ├─ ort-wasm.wasm
│  └─ ort-wasm-simd.wasm
└─ sw.js                          # 修改：模型快取策略
```

---

## 10. 效能指標 (KPI) 與驗收標準

| 指標 | 目標值 | 測試方式 |
|------|--------|----------|
| 首訪模型下載 (4G) | < 5 秒 | Network 面板計時 |
| Encoder 推論 (WebGPU) | < 600 ms | `performance.now()` 計時 |
| Encoder 推論 (WASM) | < 1.8 s | 同上 |
| Decoder 單次點擊 (WebGPU) | < 30 ms | 同上 |
| Decoder 單次點擊 (WASM) | < 80 ms | 同上 |
| 連續掃描 10 張相片無 OOM | 通過 | iOS Safari 實測 |
| 點擊座標偏移量 | < 2px | 視覺檢查 + 自動化測試 |
| 離線可用性 | 完全離線可用 | 斷網測試 |

---

## 11. 風險評估與緩解

| 風險 | 機率 | 影響 | 緩解方案 |
|------|------|------|----------|
| iOS Safari WebGPU 不支援 | 高 | 效能下降 | WASM+SIMD 降級已內建，預期 <80ms 仍可接受 |
| 模型檔案過大導致首載慢 | 中 | 體驗差 | SW 預快取 + Decoder 先載 + Encoder 懶載 |
| 記憶體洩漏導致 Crash | 高 | 資料遺失 | 強制 `.dispose()` + 開發期記憶體監控 |
| High-DPI 座標偏移 | 中 | 標籤位置錯 | 完整歸一化邏輯 + 多裝置測試 |
| ONNX Runtime Web 版本相容 | 低 | 執行錯誤 | 鎖定版本 `ort@1.17.x`，CI 測試 |

---

## 12. 後續擴展性設計

1. **批次自動掃描**：Encoder Embedding 快取後，可支援「全自動掃描」模式（網格採樣點擊）
2. **計數結果雲端同步**：`ai_count` 欄位寫入 `drug_items`，支援稽核追蹤
3. **模型熱更新**：SW `stale-while-revalidate` 策略，新版模型無縫更新
4. **多模型支援**：架構預留 `modelType: 'mobile-sam' | 'edge-sam' | 'sam2'` 擴展點

---

## 13. 實作優先順序建議

| 階段 | 任務 | 預估工時 |
|------|------|----------|
| **P0** | 專案結構建立、型別定義、ONNX Session 雙引擎 | 4h |
| **P0** | Web Worker 架構、Encoder/Decoder 分離、Transferable 傳輸 | 6h |
| **P0** | 三階段載入策略 + SW 快取 | 4h |
| **P1** | Canvas 疊加層、座標歸一化、點擊互動 | 6h |
| **P1** | IoU 去重、Undo/Redo、狀態管理 Hook | 4h |
| **P1** | UI 整合：齒輪開關、底部操作列、狀態指示器 | 4h |
| **P2** | 記憶體壓力測試、`.dispose()` 完善、邊界案例修正 | 4h |
| **P2** | 多裝置測試 (iOS/Android/Desktop)、效能調優 | 4h |
| **總計** | | **~36h** |

---

**文件狀態**：✅ 已完成實作  
**實作完成日期**：2026-08-09  
**相關文件**：
- 實作計畫：`docs/superpowers/plans/2026-08-09-mobile-sam-integration-plan.md`
- 手動測試清單：`docs/ai-counting-manual-test-checklist.md`
- 使用者指南：`docs/ai-counting-user-guide.md`
- E2E 測試：`tests/e2e/ai-counting.spec.ts`