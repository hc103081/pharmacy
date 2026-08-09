# MobileSAM/EdgeSAM AI 計數系統整合實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 MobileSAM/EdgeSAM 點擊式 AI 數量分析系統整合至 PhamaCount Web 的 `/scan` 頁面，提供離線、毫秒級、零伺服器成本的藥物顆粒計數功能。

**Architecture:** 採用 Edge-AI 架構，Encoder 在 Web Worker 執行一次全圖特徵提取，Decoder 在 Main Thread 每次點擊 <30ms 推論。三階段非阻塞載入 + Service Worker 離線快取 + 雙引擎降級 (WebGPU → WASM+SIMD)。

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, ONNX Runtime Web 1.17+, Web Workers, Service Worker, Supabase (既有後端)

## Global Constraints

- 專案路徑：`c:\project_Code\pharmacy`
- 模型檔案：`/public/models/mobile_sam_encoder.onnx` (~35MB), `/public/models/mobile_sam_decoder.onnx` (~4MB)
- WASM 檔案：`/public/wasm/ort-wasm.wasm`, `/public/wasm/ort-wasm-simd.wasm`
- 現有 UI 風格：Dark Mode 科技風 (`#07142b` 背景, `#162a56` Card, `#00f2fe` Accent, `#ff4b5c` Alert)
- 既有元件複用：`ScanContent.tsx`, `CameraModal.tsx`, `DrugCard.tsx`, `usePhotoCapture.ts`
- 嚴格 TypeScript，無 `any` 洩漏
- 記憶體管理：每次推論後必須 `.dispose()` Tensor，關閉 Modal 釋放 Embedding

---

### Task 1: 專案結構建立與型別定義

**Files:**
- Create: `src/types/ai-count.ts`
- Create: `src/lib/ai/counting-logic.ts`
- Create: `src/lib/ai/onnx-session.ts`
- Create: `src/lib/ai/model-loader.ts`

**Interfaces:**
- Produces: `AISegmentedItem`, `AICountingState`, `ModelLoadState`, `WorkerMessage`, `WorkerResponse`
- Produces: `calculateIoU()`, `processClick()`, `binarizeAndResize()`, `createDecoderSession()`, `createEncoderSession()`

- [ ] **Step 1: 建立核心型別檔案**

```typescript
// src/types/ai-count.ts
export interface AISegmentedItem {
  id: string;
  index: number;
  clickPoint: { x: number; y: number };
  boundingBox: [number, number, number, number];
  maskData: Uint8Array;
  areaPixels: number;
  confidence: number;
  createdAt: number;
}

export interface AICountingState {
  imageId: string;
  imageDimensions: { width: number; height: number };
  imageElement: HTMLImageElement | null;
  isDecoderReady: boolean;
  isEncoderReady: boolean;
  isEncoderProcessing: boolean;
  imageEmbedding: any | null;
  items: AISegmentedItem[];
  totalCount: number;
  isAIModeEnabled: boolean;
  showAIOverlay: boolean;
  pendingAdoption: boolean;
  historyStack: AISegmentedItem[][];
  historyIndex: number;
}

export interface ModelLoadState {
  decoder: 'idle' | 'loading' | 'ready' | 'error';
  encoder: 'idle' | 'loading' | 'ready' | 'error';
  backend: 'webgpu' | 'wasm' | 'unknown';
  errorMessage?: string;
}

export type WorkerMessage =
  | { type: 'INIT_DECODER'; modelUrl: string; wasmConfig: { numThreads: number; simd: boolean } }
  | { type: 'INIT_ENCODER'; modelUrl: string; wasmConfig: { numThreads: number; simd: boolean } }
  | { type: 'RUN_ENCODER'; imageBitmap: ImageBitmap }
  | { type: 'DISPOSE' };

export type WorkerResponse =
  | { type: 'DECODER_READY'; backend: 'webgpu' | 'wasm' }
  | { type: 'ENCODER_READY' }
  | { type: 'EMBEDDING_READY'; embedding: Float32Array; shape: number[] }
  | { type: 'ERROR'; message: string };
```

- [ ] **Step 2: 實作計數邏輯工具函數**

```typescript
// src/lib/ai/counting-logic.ts
import type { AICountingState, AISegmentedItem } from '@/types/ai-count';
import * as ort from 'onnxruntime-web';

const IOU_THRESHOLD = 0.75;
const MIN_MASK_AREA = 10;

export function calculateIoU(maskA: Uint8Array, maskB: Uint8Array): number {
  let intersection = 0, union = 0;
  for (let i = 0; i < maskA.length; i++) {
    const a = maskA[i], b = maskB[i];
    if (a && b) intersection++;
    if (a || b) union++;
  }
  return union > 0 ? intersection / union : 0;
}

export function computeBBox(mask: Uint8Array, width: number, height: number): [number, number, number, number] {
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let found = false;
  for (let y = 0; y < height; y++) {
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
  return found ? [minX/width, minY/height, maxX/width, maxY/height] : [0,0,0,0];
}

export function computeConfidence(logits: Float32Array): number {
  const maxLogit = Math.max(...logits);
  return 1 / (1 + Math.exp(-maxLogit));
}

export function binarizeAndResize(
  logits: Float32Array, 
  targetDim: { width: number; height: number },
  threshold = 0
): Uint8Array {
  const srcW = Math.sqrt(logits.length);
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
  clickX: number,
  clickY: number,
  label: 1 | 0,
  decoderSession: ort.InferenceSession,
  imageEmbedding: ort.Tensor
): Promise<AISegmentedItem | { action: 'delete'; item: AISegmentedItem } | null> {
  const pointCoords = new Float32Array([[clickX * 1024, clickY * 1024]]);
  const pointLabels = new Float32Array([label]);
  
  const feeds = {
    image_embeddings: imageEmbedding,
    point_coords: new ort.Tensor('float32', pointCoords, [1, 1, 2]),
    point_labels: new ort.Tensor('float32', pointLabels, [1, 1]),
    orig_im_size: new ort.Tensor('float32', new Float32Array([state.imageDimensions.height, state.imageDimensions.width]), [1, 2]),
  };
  
  const results = await decoderSession.run(feeds);
  const maskLogits = results.masks?.data as Float32Array;
  
  feeds.point_coords.dispose();
  feeds.point_labels.dispose();
  feeds.orig_im_size.dispose();
  
  const binaryMask = binarizeAndResize(maskLogits, state.imageDimensions);
  const area = binaryMask.reduce((a, b) => a + b, 0);
  
  if (area < MIN_MASK_AREA) return null;
  
  for (const existing of state.items) {
    const iou = calculateIoU(binaryMask, existing.maskData);
    if (iou > IOU_THRESHOLD) {
      if (label === 1) return null;
      return { action: 'delete', item: existing };
    }
  }
  
  return {
    id: crypto.randomUUID(),
    index: state.items.length + 1,
    clickPoint: { x: clickX, y: clickY },
    boundingBox: computeBBox(binaryMask, state.imageDimensions.width, state.imageDimensions.height),
    maskData: binaryMask,
    areaPixels: area,
    confidence: computeConfidence(maskLogits),
    createdAt: Date.now(),
  };
}

export function handleNegativeClick(
  state: AICountingState,
  clickX: number,
  clickY: number
): { action: 'delete'; index: number; item: AISegmentedItem } | null {
  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i];
    const mask = item.maskData;
    const width = state.imageDimensions.width;
    const x = Math.floor(clickX * width);
    const y = Math.floor(clickY * width);
    if (x >= 0 && x < width && y >= 0 && y < width) {
      const idx = y * width + x;
      if (mask[idx] === 1) {
        return { action: 'delete', index: i, item };
      }
    }
  }
  return null;
}
```

- [ ] **Step 3: 實作 ONNX Session 雙引擎建立**

```typescript
// src/lib/ai/onnx-session.ts
import * as ort from 'onnxruntime-web';
import type { SessionResult } from './types';

export interface SessionResult {
  session: ort.InferenceSession;
  backend: 'webgpu' | 'wasm';
}

export async function createDecoderSession(): Promise<SessionResult> {
  const modelUrl = '/models/mobile_sam_decoder.onnx';
  
  try {
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'all',
    });
    return { session, backend: 'webgpu' };
  } catch (e) {
    console.warn('WebGPU 不支援，降級 WASM+SIMD', e);
    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
    ort.env.wasm.simd = true;
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    });
    return { session, backend: 'wasm' };
  }
}

export async function createEncoderSession(): Promise<SessionResult> {
  const modelUrl = '/models/mobile_sam_encoder.onnx';
  try {
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'all',
    });
    return { session, backend: 'webgpu' };
  } catch (e) {
    console.warn('Encoder WebGPU 不支援，降級 WASM+SIMD', e);
    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
    ort.env.wasm.simd = true;
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    });
    return { session, backend: 'wasm' };
  }
}
```

- [ ] **Step 4: 實作模型載入協調器**

```typescript
// src/lib/ai/model-loader.ts
import type { ModelLoadState, WorkerMessage, WorkerResponse } from '@/types/ai-count';

export class ModelLoader {
  private worker: Worker;
  private state: ModelLoadState = {
    decoder: 'idle',
    encoder: 'idle',
    backend: 'unknown',
  };
  private listeners: Set<(state: ModelLoadState) => void> = new Set();
  private decoderReadyResolver: ((value: { session: any; backend: 'webgpu' | 'wasm' }) => void) | null = null;
  private encoderReadyResolver: (() => void) | null = null;
  private embeddingResolver: ((embedding: Float32Array, shape: number[]) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('../workers/encoder.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
  }

  private handleWorkerMessage(e: MessageEvent<WorkerResponse>) {
    const { type } = e.data;
    switch (type) {
      case 'DECODER_READY':
        this.state.decoder = 'ready';
        this.state.backend = e.data.backend;
        this.decoderReadyResolver?.({ session: null, backend: e.data.backend });
        this.decoderReadyResolver = null;
        break;
      case 'ENCODER_READY':
        this.state.encoder = 'ready';
        this.encoderReadyResolver?.();
        this.encoderReadyResolver = null;
        break;
      case 'EMBEDDING_READY':
        this.state.isEncoderProcessing = false;
        this.embeddingResolver?.(e.data.embedding, e.data.shape);
        this.embeddingResolver = null;
        break;
      case 'ERROR':
        this.state.decoder = 'error';
        this.state.encoder = 'error';
        this.state.errorMessage = e.data.message;
        break;
    }
    this.notify();
  }

  private notify() {
    this.listeners.forEach(l => l({ ...this.state }));
  }

  subscribe(listener: (state: ModelLoadState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState() { return { ...this.state }; }

  async initDecoder(): Promise<{ backend: 'webgpu' | 'wasm' }> {
    if (this.state.decoder !== 'idle') return { backend: this.state.backend };
    this.state.decoder = 'loading';
    this.notify();
    this.worker.postMessage({
      type: 'INIT_DECODER',
      modelUrl: '/models/mobile_sam_decoder.onnx',
      wasmConfig: { numThreads: navigator.hardwareConcurrency || 4, simd: true },
    } satisfies WorkerMessage);
    return new Promise(resolve => { this.decoderReadyResolver = resolve; });
  }

  async initEncoder(): Promise<void> {
    if (this.state.encoder !== 'idle') return;
    this.state.encoder = 'loading';
    this.notify();
    this.worker.postMessage({
      type: 'INIT_ENCODER',
      modelUrl: '/models/mobile_sam_encoder.onnx',
      wasmConfig: { numThreads: navigator.hardwareConcurrency || 4, simd: true },
    } satisfies WorkerMessage);
    return new Promise(resolve => { this.encoderReadyResolver = resolve; });
  }

  async runEncoder(imageBitmap: ImageBitmap): Promise<{ embedding: Float32Array; shape: number[] }> {
    this.state.isEncoderProcessing = true;
    this.notify();
    this.worker.postMessage({ type: 'RUN_ENCODER', imageBitmap }, [imageBitmap]);
    return new Promise(resolve => { this.embeddingResolver = resolve; });
  }

  dispose() {
    this.worker.postMessage({ type: 'DISPOSE' });
    this.worker.terminate();
  }
}

export const modelLoader = new ModelLoader();
```

- [ ] **Step 5: 提交變更**

```bash
git add src/types/ai-count.ts src/lib/ai/counting-logic.ts src/lib/ai/onnx-session.ts src/lib/ai/model-loader.ts
git commit -m "feat(ai): add core types, counting logic, ONNX sessions, and model loader"
```

---

### Task 2: Web Worker 實作 (Encoder 背景執行 + Transferable 零拷貝)

**Files:**
- Create: `src/workers/encoder.worker.ts`

**Interfaces:**
- Consumes: `WorkerMessage`, `WorkerResponse` from `src/types/ai-count.ts`
- Produces: Worker 進程，處理 Encoder 初始化與推論

- [ ] **Step 1: 實作 Encoder Worker**

```typescript
// src/workers/encoder.worker.ts
import * as ort from 'onnxruntime-web';
import type { WorkerMessage, WorkerResponse } from '@/types/ai-count';

let encoderSession: ort.InferenceSession | null = null;
let decoderSession: ort.InferenceSession | null = null;

function preprocessImage(bitmap: ImageBitmap): ort.Tensor {
  const canvas = new OffscreenCanvas(1024, 1024);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, 1024, 1024);
  const imageData = ctx.getImageData(0, 0, 1024, 1024);
  const data = new Float32Array(3 * 1024 * 1024);
  for (let i = 0; i < 1024 * 1024; i++) {
    data[i] = imageData.data[i * 4] / 255;
    data[1024 * 1024 + i] = imageData.data[i * 4 + 1] / 255;
    data[2 * 1024 * 1024 + i] = imageData.data[i * 4 + 2] / 255;
  }
  return new ort.Tensor('float32', data, [1, 3, 1024, 1024]);
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type } = e.data;
  
  try {
    switch (type) {
      case 'INIT_DECODER': {
        const { modelUrl, wasmConfig } = e.data;
        ort.env.wasm.numThreads = wasmConfig.numThreads;
        ort.env.wasm.simd = wasmConfig.simd;
        try {
          decoderSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['webgpu'],
            graphOptimizationLevel: 'all',
          });
          self.postMessage({ type: 'DECODER_READY', backend: 'webgpu' } satisfies WorkerResponse);
        } catch {
          decoderSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['wasm'],
          });
          self.postMessage({ type: 'DECODER_READY', backend: 'wasm' } satisfies WorkerResponse);
        }
        break;
      }
      
      case 'INIT_ENCODER': {
        const { modelUrl, wasmConfig } = e.data;
        ort.env.wasm.numThreads = wasmConfig.numThreads;
        ort.env.wasm.simd = wasmConfig.simd;
        try {
          encoderSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['webgpu'],
            graphOptimizationLevel: 'all',
          });
        } catch {
          encoderSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['wasm'],
          });
        }
        self.postMessage({ type: 'ENCODER_READY' } satisfies WorkerResponse);
        break;
      }
      
      case 'RUN_ENCODER': {
        if (!encoderSession) throw new Error('Encoder not initialized');
        const { imageBitmap } = e.data;
        const inputTensor = preprocessImage(imageBitmap);
        const results = await encoderSession.run({ images: inputTensor });
        const embedding = results.image_embeddings;
        const float32Data = embedding.data as Float32Array;
        // Transferable: 零拷貝傳回 Main Thread
        self.postMessage(
          { type: 'EMBEDDING_READY', embedding: float32Data, shape: embedding.dims } satisfies WorkerResponse,
          [float32Data.buffer]
        );
        inputTensor.dispose();
        embedding.dispose();
        break;
      }
      
      case 'DISPOSE': {
        encoderSession?.dispose();
        decoderSession?.dispose();
        encoderSession = null;
        decoderSession = null;
        break;
      }
    }
  } catch (error) {
    self.postMessage({ type: 'ERROR', message: (error as Error).message } satisfies WorkerResponse);
  }
};
```

- [ ] **Step 2: 更新 tsconfig.json 包含 worker**

```json
// tsconfig.json - 確保 worker 被編譯
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "WebWorker"],
    "types": ["jest", "@testing-library/jest-dom"]
  },
  "include": ["src/**/*", "src/workers/**/*"]
}
```

- [ ] **Step 3: 提交變更**

```bash
git add src/workers/encoder.worker.ts tsconfig.json
git commit -m "feat(ai): add encoder Web Worker with Transferable zero-copy"
```

---

### Task 3: AI 計數狀態管理 Hook (useAICounting)

**Files:**
- Create: `src/hooks/useAICounting.ts`

**Interfaces:**
- Consumes: `AICountingState`, `AISegmentedItem`, `ModelLoadState`, `modelLoader`, `processClick`, `handleNegativeClick`
- Produces: `useAICounting()` hook 供 `ScanContent` 和 `CameraModal` 使用

- [ ] **Step 1: 實作 useAICounting Hook**

```typescript
// src/hooks/useAICounting.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import * as ort from 'onnxruntime-web';
import { modelLoader } from '@/lib/ai/model-loader';
import { processClick, handleNegativeClick, binarizeAndResize, computeBBox } from '@/lib/ai/counting-logic';
import type { AICountingState, AISegmentedItem, ModelLoadState } from '@/types/ai-count';

export function useAICounting() {
  const [state, setState] = useState<AICountingState>({
    imageId: '',
    imageDimensions: { width: 0, height: 0 },
    imageElement: null,
    isDecoderReady: false,
    isEncoderReady: false,
    isEncoderProcessing: false,
    imageEmbedding: null,
    items: [],
    totalCount: 0,
    isAIModeEnabled: false,
    showAIOverlay: false,
    pendingAdoption: false,
    historyStack: [[]],
    historyIndex: 0,
  });
  
  const [modelState, setModelState] = useState<ModelLoadState>(modelLoader.getState());
  const decoderSessionRef = useRef<ort.InferenceSession | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const animationFrameRef = useRef<number>();

  // 訂閱模型載入狀態
  useEffect(() => {
    const unsubscribe = modelLoader.subscribe(setModelState);
    return unsubscribe;
  }, []);

  // 初始化 Decoder (Phase 1: 進頁即載入)
  useEffect(() => {
    let mounted = true;
    modelLoader.initDecoder().then(({ backend }) => {
      if (!mounted) return;
      // Decoder session 存在於 Worker 中，Main Thread 需要自己的 session 給 Decoder 推論
      // 這裡在 Main Thread 也建立一個 decoder session
      import('@/lib/ai/onnx-session').then(({ createDecoderSession }) => 
        createDecoderSession().then(({ session }) => {
          decoderSessionRef.current = session;
          setState(s => ({ ...s, isDecoderReady: true }));
        })
      );
    });
    return () => { mounted = false; };
  }, []);

  // 啟用 AI 模式時初始化 Encoder (Phase 2)
  const toggleAIMode = useCallback(async (enabled: boolean) => {
    setState(s => ({ ...s, isAIModeEnabled: enabled, showAIOverlay: enabled }));
    if (enabled && !modelState.isEncoderReady && modelState.encoder !== 'loading') {
      await modelLoader.initEncoder();
    }
  }, [modelState.isEncoderReady, modelState.encoder]);

  // 載入新圖片 (Phase 3: 執行 Encoder)
  const loadImage = useCallback(async (imageElement: HTMLImageElement, imageId: string) => {
    const bitmap = await createImageBitmap(imageElement);
    setState(s => ({
      ...s,
      imageId,
      imageDimensions: { width: bitmap.width, height: bitmap.height },
      imageElement,
      items: [],
      totalCount: 0,
      historyStack: [[]],
      historyIndex: 0,
    }));
    
    const { embedding, shape } = await modelLoader.runEncoder(bitmap);
    const tensor = new ort.Tensor('float32', embedding, shape);
    setState(s => ({ ...s, imageEmbedding: tensor, isEncoderReady: true, showAIOverlay: true }));
    bitmap.close();
  }, []);

  // 正向點擊
  const handlePositiveClick = useCallback(async (clickX: number, clickY: number) => {
    if (!state.isEncoderReady || !state.imageEmbedding || !decoderSessionRef.current) return;
    
    const result = await processClick(state, clickX, clickY, 1, decoderSessionRef.current, state.imageEmbedding);
    if (result && !('action' in result)) {
      pushHistory();
      setState(s => ({ 
        ...s, 
        items: [...s.items, result], 
        totalCount: s.items.length + 1,
      }));
    }
  }, [state.isEncoderReady, state.imageEmbedding, state.items.length]);

  // 負向點擊 (刪除)
  const handleNegativeClickAction = useCallback((clickX: number, clickY: number) => {
    const result = handleNegativeClick(state, clickX, clickY);
    if (result?.action === 'delete') {
      pushHistory();
      setState(s => ({
        ...s,
        items: s.items.filter((_, i) => i !== result.index).map((item, idx) => ({ ...item, index: idx + 1 })),
        totalCount: s.items.length - 1,
      }));
    }
  }, [state]);

  // Canvas 點擊事件處理 (含座標歸一化 - Edge Case 1)
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>, isNegative = false) => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    
    const rect = img.getBoundingClientRect(); // 關鍵：使用 img 而非 canvas
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;
    
    if (clickX < 0 || clickX > 1 || clickY < 0 || clickY > 1) return;
    
    if (isNegative) {
      handleNegativeClickAction(clickX, clickY);
    } else {
      handlePositiveClick(clickX, clickY);
    }
  }, [handlePositiveClick, handleNegativeClickAction]);

  // 繪製 Mask 與標籤
  const renderOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !state.isEncoderReady || state.items.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 同步 Canvas 解析度與顯示尺寸 (High-DPI 支援)
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = img.clientWidth;
    const displayHeight = img.clientHeight;
    
    canvas.width = Math.round(state.imageDimensions.width * dpr);
    canvas.height = Math.round(state.imageDimensions.height * dpr);
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    ctx.scale(dpr, dpr);
    
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    
    const scaleX = displayWidth / state.imageDimensions.width;
    const scaleY = displayHeight / state.imageDimensions.height;
    
    state.items.forEach((item, idx) => {
      // 繪製 Mask (半透明綠色)
      const maskCanvas = new OffscreenCanvas(state.imageDimensions.width, state.imageDimensions.height);
      const maskCtx = maskCanvas.getContext('2d');
      const maskImageData = maskCtx.createImageData(state.imageDimensions.width, state.imageDimensions.height);
      const maskData = maskImageData.data;
      for (let i = 0; i < item.maskData.length; i++) {
        if (item.maskData[i]) {
          maskData[i * 4] = 0;
          maskData[i * 4 + 1] = 255;
          maskData[i * 4 + 2] = 120;
          maskData[i * 4 + 3] = 90; // 0.35 * 255
        }
      }
      maskCtx.putImageData(maskImageData, 0, 0);
      ctx.drawImage(maskCanvas, 0, 0, displayWidth, displayHeight);
      
      // 繪製數字標籤
      const centerX = (item.boundingBox[0] + item.boundingBox[2]) / 2 * displayWidth;
      const centerY = (item.boundingBox[1] + item.boundingBox[3]) / 2 * displayHeight;
      ctx.font = 'bold 20px system-ui';
      ctx.fillStyle = '#00f2fe';
      ctx.strokeStyle = '#07142b';
      ctx.lineWidth = 4;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = `${idx + 1}`;
      ctx.strokeText(label, centerX, centerY);
      ctx.fillText(label, centerX, centerY);
    });
  }, [state.items, state.imageDimensions, state.isEncoderReady]);

  // 監聽 items 變化觸發重繪
  useEffect(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(renderOverlay);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [renderOverlay]);

  // Undo/Redo
  const pushHistory = useCallback(() => {
    setState(s => ({
      ...s,
      historyStack: [...s.historyStack.slice(0, s.historyIndex + 1), s.items],
      historyIndex: s.historyIndex + 1,
    }));
  }, []);

  const undo = useCallback(() => {
    setState(s => {
      if (s.historyIndex <= 0) return s;
      const newIndex = s.historyIndex - 1;
      return {
        ...s,
        items: s.historyStack[newIndex],
        totalCount: s.historyStack[newIndex].length,
        historyIndex: newIndex,
      };
    });
  }, []);

  const clearAll = useCallback(() => {
    pushHistory();
    setState(s => ({ ...s, items: [], totalCount: 0 }));
  }, [pushHistory]);

  // 採用 AI 計數結果
  const adoptCount = useCallback(() => {
    setState(s => ({ ...s, pendingAdoption: true }));
    return state.totalCount;
  }, [state.totalCount]);

  // 釋放資源 (Edge Case 2: 記憶體洩漏防範)
  const dispose = useCallback(() => {
    if (state.imageEmbedding) {
      state.imageEmbedding.dispose();
    }
    state.items.forEach(item => {
      // maskData 是 Uint8Array 不需 dispose
    });
    decoderSessionRef.current?.dispose();
    decoderSessionRef.current = null;
    modelLoader.dispose();
    setState(s => ({ 
      ...s, 
      imageEmbedding: null, 
      isEncoderReady: false, 
      isDecoderReady: false,
      items: [],
      totalCount: 0,
    }));
  }, [state.imageEmbedding, state.items]);

  return {
    state,
    modelState,
    canvasRef,
    imgRef,
    toggleAIMode,
    loadImage,
    handleCanvasClick,
    undo,
    clearAll,
    adoptCount,
    dispose,
    renderOverlay,
  };
}
```

- [ ] **Step 2: 提交變更**

```bash
git add src/hooks/useAICounting.ts
git commit -m "feat(ai): add useAICounting hook with state management, click handling, and rendering"
```

---

### Task 4: ScanContent 整合 (Header 齒輪開關 + 狀態注入)

**Files:**
- Modify: `src/app/scan/page.tsx` (Header 區域新增齒輪)
- Modify: `src/app/scan/ScanContent.tsx` (整合 useAICounting，傳遞給 CameraModal)

**Interfaces:**
- Consumes: `useAICounting` hook
- Produces: `isAIModeEnabled` 透過 props 傳給 CameraModal

- [ ] **Step 1: 修改 ScanContent.tsx Header 新增齒輪設定**

```tsx
// src/app/scan/ScanContent.tsx - 在 Header 區域 (約第 580 行附近) 新增
import { useAICounting } from '@/hooks/useAICounting';
import { Settings } from 'lucide-react';

// 在元件內部新增
const { state: aiState, modelState, toggleAIMode } = useAICounting();
const [showAISettings, setShowAISettings] = useState(false);

// 在 Header 右側按鈕群 (約第 580-600 行) 新增:
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
          checked={aiState.isAIModeEnabled}
          onChange={e => toggleAIMode(e.target.checked)}
          className="w-4 h-4 accent-[#00f2fe]" />
        <span className="text-sm font-medium text-slate-200">啟用 AI 計數模式</span>
      </label>
      <div className="mt-2 pt-2 border-t border-slate-700 text-xs text-slate-500">
        模式: {modelState.backend === 'webgpu' ? '🟢 WebGPU' : '🟡 CPU (WASM)'}
        {modelState.encoder === 'loading' && <span className="ml-2 animate-pulse">載入中...</span>}
        {modelState.encoder === 'error' && <span className="ml-2 text-red-400">錯誤: {modelState.errorMessage}</span>}
      </div>
    </div>
  )}
</div>

// 將 isAIModeEnabled 傳給 CameraModal (約第 349 行)
const { 
  // ... 既有解構
  showCameraModal,
  setShowCameraModal,
  // 新增
} = usePhotoCapture({
  // ... 既有參數
  // 新增：傳遞 AI 狀態
});

// 在 CameraModal 呼叫處傳遞 (約第 1146 行)
{showCameraModal && (
  <CameraModal
    isOpen={showCameraModal}
    onClose={() => setShowCameraModal(false)}
    onCapture={handleCameraFile}
    onError={setCameraError}
    onCheckingSupport={setCheckingCameraSupport}
    // 新增 props
    isAIModeEnabled={aiState.isAIModeEnabled}
    onAIAdoptCount={aiState.adoptCount}
    onAIDispose={aiState.dispose}
  />
)}
```

- [ ] **Step 2: 修改 usePhotoCapture 接受 AI 相關參數**

```typescript
// src/app/scan/hooks/usePhotoCapture.ts - 修改介面
interface UsePhotoCaptureOptions {
  // ... 既有參數
  isAIModeEnabled?: boolean;
  onAIAdoptCount?: () => number;
  onAIDispose?: () => void;
}

// 在 handleCameraFile 中，採用 AI 計數時:
const handleCameraFile = async (file: File) => {
  // ... 既有上傳邏輯
  if (isAIModeEnabled && onAIAdoptCount) {
    const aiCount = onAIAdoptCount();
    // 將 aiCount 作為 actualQuantity 傳給 updateDrugStatus
    actualQuantityRef.current = String(aiCount);
  }
  // ... 既有流程
};

// 關閉 Modal 時釋放 AI 資源
useEffect(() => {
  if (!isOpen && onAIDispose) {
    onAIDispose();
  }
}, [isOpen, onAIDispose]);
```

- [ ] **Step 3: 提交變更**

```bash
git add src/app/scan/ScanContent.tsx src/app/scan/hooks/usePhotoCapture.ts
git commit -m "feat(ai): integrate AI counting toggle in ScanContent Header and pass to CameraModal"
```

---

### Task 5: CameraModal 整合 (AI Canvas 疊加層 + 底部操作列)

**Files:**
- Modify: `src/app/scan/components/CameraModal.tsx`

**Interfaces:**
- Consumes: `isAIModeEnabled`, `onAIAdoptCount`, `onAIDispose`, `useAICounting` hook (canvasRef, imgRef, handleCanvasClick, renderOverlay, state)
- Produces: AI 疊加 Canvas、點擊互動、底部 Sticky 操作列

- [ ] **Step 1: 修改 CameraModal.tsx 整合 AI 功能**

```tsx
// src/app/scan/components/CameraModal.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Camera, CheckCircle2, RotateCcw, Trash2 } from 'lucide-react';
import { useAICounting } from '@/hooks/useAICounting';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onError: (error: string) => void;
  onCheckingSupport: (checking: boolean) => void;
  frontCamera?: boolean;
  // 新增 AI 相關 props
  isAIModeEnabled: boolean;
  onAIAdoptCount: () => number;
  onAIDispose: () => void;
}

export default function CameraModal({
  isOpen,
  onClose,
  onCapture,
  onError,
  onCheckingSupport,
  frontCamera = false,
  isAIModeEnabled,
  onAIAdoptCount,
  onAIDispose,
}: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingSupport, setCheckingSupport] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  // AI 計數相關
  const {
    state: aiState,
    canvasRef: aiCanvasRef,
    imgRef,
    handleCanvasClick,
    adoptCount,
    clearAll,
    undo,
    dispose,
    loadImage,
  } = useAICounting();

  // 關閉 Modal 時清理
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setPhotoUrl(null);
      if (isAIModeEnabled) {
        onAIDispose();
        dispose();
      }
    }
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [isOpen, isAIModeEnabled, onAIDispose, dispose, stream]);

  // 照片載入完成後觸發 AI Encoder
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    imgRef.current = img;
    if (isAIModeEnabled && aiState.isEncoderReady === false && !aiState.isEncoderProcessing) {
      loadImage(img, `photo-${Date.now()}`);
    }
  }, [isAIModeEnabled, aiState.isEncoderReady, aiState.isEncoderProcessing, loadImage]);

  // 相機/檔案選擇邏輯 (既有)
  const handleFileSelect = (file: File) => {
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
    onCapture(file);
  };

  // ... 既有 startCamera, stopCamera, handleCameraFile 等邏輯保持不變 ...

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] mx-4">
        {/* 關閉按鈕 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-slate-900/80 rounded-full text-slate-300 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* AI 模式指示器 */}
        {isAIModeEnabled && (
          <div className="absolute top-4 left-4 z-10 px-3 py-1 bg-[#00f2fe]/20 border border-[#00f2fe]/50 rounded-full text-xs font-bold text-[#00f2fe] flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#00f2fe] animate-pulse" />
            AI 計數模式
          </div>
        )}

        {photoUrl ? (
          // 照片預覽模式
          <div className="relative" ref={containerRef}>
            <img
              src={photoUrl}
              ref={imgRef}
              className="max-w-full max-h-[70vh] object-contain"
              onLoad={handleImageLoad}
            />
            
            {/* AI 疊加 Canvas - Edge Case 1: 座標對位 */}
            {isAIModeEnabled && aiState.isEncoderReady && (
              <canvas
                ref={aiCanvasRef}
                className="absolute top-0 left-0 pointer-events-none"
                onClick={e => handleCanvasClick(e as React.MouseEvent<HTMLCanvasElement>, false)}
                onContextMenu={e => {
                  e.preventDefault();
                  handleCanvasClick(e as React.MouseEvent<HTMLCanvasElement>, true);
                }}
              />
            )}
            
            {/* AI 載入中提示 */}
            {isAIModeEnabled && !aiState.isEncoderReady && aiState.isEncoderProcessing && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 bg-slate-900/90 backdrop-blur p-6 rounded-xl border border-blue-500/30">
                <div className="w-10 h-10 border-4 border-[#00f2fe] border-t-transparent rounded-full animate-spin" />
                <span className="text-slate-300">AI 模型分析中...</span>
              </div>
            )}
            
            {/* AI 未就緒時的啟動按鈕 */}
            {isAIModeEnabled && !aiState.isEncoderReady && !aiState.isEncoderProcessing && (
              <button
                onClick={() => { /* loadImage 會在 onLoad 觸發 */ }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#00f2fe] text-slate-900 px-6 py-3 rounded-xl font-bold text-lg shadow-[0_0_20px_rgba(0,242,254,0.4)]"
              >
                開始 AI 分析
              </button>
            )}

            {/* 底部 AI 計數操作列 - Sticky Bottom Bar */}
            {isAIModeEnabled && aiState.isEncoderReady && aiState.items.length > 0 && (
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#162a56]/95 backdrop-blur border-t border-blue-500/30 z-40 pointer-events-auto">
                <div className="max-w-4xl mx-auto flex flex-col gap-3">
                  <div className="flex items-center justify-between text-center">
                    <span className="text-slate-400 text-sm">AI 偵測顆粒數</span>
                    <span className="text-4xl font-bold font-mono text-[#00f2fe] drop-shadow-[0_0_15px_rgba(0,242,254,0.5)]">
                      {aiState.totalCount}
                    </span>
                    <span className="text-slate-400 text-sm">顆</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={undo}
                      disabled={aiState.historyIndex <= 0}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" /> 復原
                    </button>
                    <button
                      onClick={clearAll}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> 清空全部
                    </button>
                    <button
                      onClick={() => {
                        const count = adoptCount();
                        // 將 count 存入某處供 handleCameraFile 使用
                        // 這裡可以用 ref 或 context 傳遞
                        window.aiAdoptedCount = count;
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#00f2fe] text-slate-900 font-bold shadow-[0_0_10px_rgba(0,242,254,0.4)] hover:bg-[#00f2fe]/90 active:scale-95 transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" /> 採用 AI 結果 ({aiState.totalCount})
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 原有的拍照/重拍/確認按鈕 (保持在 AI 操作列上方) */}
            <div className={`absolute bottom-0 left-0 right-0 p-4 flex gap-2 ${isAIModeEnabled && aiState.items.length > 0 ? 'pb-32' : ''}`}>
              {/* 既有按鈕邏輯保持不變 */}
            </div>
          </div>
        ) : (
          // 相機預覽模式 (既有邏輯)
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 處理 AI 採用計數傳遞給 handleCameraFile**

```typescript
// 在 CameraModal 外部建立全域 ref (或用 Context)
declare global {
  interface Window {
    aiAdoptedCount?: number;
  }
}

// 在 handleCameraFile 中讀取
const handleCameraFile = async (file: File) => {
  const aiCount = window.aiAdoptedCount;
  delete window.aiAdoptedCount;
  
  // 上傳照片...
  // 如果有 aiCount，作為 actualQuantity
  if (aiCount !== undefined) {
    // 傳遞給 onCapture 或直接這裡處理
  }
  onCapture(file);
};
```

- [ ] **Step 3: 提交變更**

```bash
git add src/app/scan/components/CameraModal.tsx
git commit -m "feat(ai): integrate AI Canvas overlay, click handling, and bottom bar in CameraModal"
```

---

### Task 6: Service Worker 模型快取策略

**Files:**
- Modify: `public/sw.js`

**Interfaces:**
- Produces: 模型檔案離線快取，首載後零流量

- [ ] **Step 1: 更新 Service Worker**

```javascript
// public/sw.js
const CACHE_NAME = 'pharmacount-v1';
const MODEL_CACHE = 'mobile-sam-models-v1';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  // 其他靜態資源...
];

const MODEL_ASSETS = [
  '/models/mobile_sam_encoder.onnx',
  '/models/mobile_sam_decoder.onnx',
  '/wasm/ort-wasm.wasm',
  '/wasm/ort-wasm-simd.wasm',
];

// 安裝時快取靜態資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(MODEL_CACHE).then((cache) => cache.addAll(MODEL_ASSETS)),
    ])
  );
  self.skipWaiting();
});

// 啟用時清理舊快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== MODEL_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 攔截請求：模型檔案優先從快取讀取
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // 模型與 WASM 檔案：Cache First 策略
  if (url.pathname.startsWith('/models/') || url.pathname.startsWith('/wasm/')) {
    event.respondWith(
      caches.match(event.request, { cacheName: MODEL_CACHE }).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(MODEL_CACHE).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        });
      })
    );
    return;
  }
  
  // 靜態資源：Stale While Revalidate
  if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.startsWith(asset))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }
  
  // 其他：Network First
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
```

- [ ] **Step 2: 註冊 SW (確保 next.config.ts 有設定)**

```typescript
// next.config.ts - 確認 PWA 設定
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});
```

- [ ] **Step 3: 提交變更**

```bash
git add public/sw.js next.config.ts
git commit -m "feat(ai): add Service Worker caching for MobileSAM models and WASM"
```

---

### Task 7: 模型檔案放置與驗證

**Files:**
- Create: `public/models/mobile_sam_encoder.onnx` (需從官方取得，約 35MB)
- Create: `public/models/mobile_sam_decoder.onnx` (需從官方取得，約 4MB)
- Create: `public/wasm/ort-wasm.wasm` (從 onnxruntime-web dist 複製)
- Create: `public/wasm/ort-wasm-simd.wasm` (從 onnxruntime-web dist 複製)

**Note:** 模型檔案需自行從 MobileSAM 官方 Release 下載並轉換為 ONNX INT8/FP16 格式。

- [ ] **Step 1: 下載並轉換模型 (手動步驟，文件記錄)**

```bash
# 參考腳本 (不在 CI 中執行)
# 1. 從 https://github.com/ChaoningZhang/MobileSAM 下載權重
# 2. 使用 export_onnx.py 轉換為 ONNX
# 3. 使用 ONNX Quantization 工具量化為 INT8
# 4. 複製到 public/models/
# 5. 從 node_modules/onnxruntime-web/dist/ 複製 wasm 檔案到 public/wasm/
```

- [ ] **Step 2: 建立模型驗證腳本**

```typescript
// scripts/verify-models.ts
import * as fs from 'fs';
import * as path from 'path';

const models = [
  { path: 'public/models/mobile_sam_encoder.onnx', minSize: 30 * 1024 * 1024 },
  { path: 'public/models/mobile_sam_decoder.onnx', minSize: 3 * 1024 * 1024 },
  { path: 'public/wasm/ort-wasm.wasm', minSize: 1 * 1024 * 1024 },
  { path: 'public/wasm/ort-wasm-simd.wasm', minSize: 1 * 1024 * 1024 },
];

for (const model of models) {
  const fullPath = path.resolve(model.path);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing: ${model.path}`);
    process.exit(1);
  }
  const stats = fs.statSync(fullPath);
  if (stats.size < model.minSize) {
    console.warn(`⚠️  ${model.path} seems small (${(stats.size/1024/1024).toFixed(1)}MB)`);
  } else {
    console.log(`✅ ${model.path} (${(stats.size/1024/1024).toFixed(1)}MB)`);
  }
}
```

- [ ] **Step 3: 提交變更 (模型檔案不進 git，用 Git LFS 或另行管理)**

```bash
# 模型檔案建議用 Git LFS 或 CDN 托管
git lfs track "public/models/*.onnx"
git lfs track "public/wasm/*.wasm"
git add .gitattributes public/models/.gitkeep public/wasm/.gitkeep
git commit -m "chore: add model placeholders and LFS tracking"
```

---

### Task 8: 整合測試與邊界案例驗證

**Files:**
- Create: `tests/e2e/ai-counting.spec.ts`
- Test: 手動測試清單

**Interfaces:**
- Verifies: 完整流程、記憶體洩漏、座標對位、離線可用

- [ ] **Step 1: 編寫 E2E 測試**

```typescript
// tests/e2e/ai-counting.spec.ts
import { test, expect } from '@playwright/test';

test.describe('AI 計數功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/scan?manifestId=test-manifest');
    await page.waitForLoadState('networkidle');
  });

  test('啟用 AI 模式 → 拍照 → 點擊計數 → 採用結果', async ({ page }) => {
    // 1. 開啟 AI 設定
    await page.click('button[aria-label="AI 計數設定"]');
    await page.click('input[type="checkbox"]');
    await expect(page.locator('text=AI 計數模式')).toBeVisible();
    
    // 2. 點擊藥品卡片拍照
    await page.click('[data-drug-id="test-drug-1"] >> button:has-text("拍照確認")');
    await expect(page.locator('text=CameraModal')).toBeVisible();
    
    // 3. 選擇測試圖片 (使用 file input)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('tests/fixtures/test-pills.jpg');
    
    // 4. 等待 Encoder 完成
    await expect(page.locator('text=AI 模型分析中')).toBeHidden({ timeout: 30000 });
    
    // 5. 在 Canvas 上點擊 3 次
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 100, y: 100 } });
    await canvas.click({ position: { x: 200, y: 200 } });
    await canvas.click({ position: { x: 300, y: 150 } });
    
    // 6. 驗證計數顯示
    await expect(page.locator('text=AI 偵測顆粒數')).toBeVisible();
    await expect(page.locator('text=3')).toBeVisible();
    
    // 7. 點擊採用
    await page.click('button:has-text("採用 AI 結果")');
    
    // 8. 關閉 Modal，驗證 actual_quantity 更新
    await expect(page.locator('[data-drug-id="test-drug-1"]')).toContainText('3');
  });

  test('負向點擊刪除誤判', async ({ page }) => {
    // ... 類似流程，右鍵點擊現有 Mask 驗證刪除
  });

  test('Undo/Redo 功能', async ({ page }) => {
    // ... 點擊 → Undo → 驗證計數減少
  });

  test('離線模式可用', async ({ page }) => {
    await page.context().setOffline(true);
    await page.reload();
    // 驗證模型從快取載入
    await page.click('button[aria-label="AI 計數設定"]');
    await page.click('input[type="checkbox"]');
    // 應該不顯示下載中，直接可用
  });
});
```

- [ ] **Step 2: 手動測試清單 (Checklist)**

```markdown
## 手動驗收清單

### 基礎功能
- [ ] 進入 /scan 頁面，Header 齒輪可開啟 AI 設定
- [ ] 勾選「啟用 AI 計數模式」，顯示模式指示器 (WebGPU/WASM)
- [ ] 點擊藥品「拍照確認」開啟 CameraModal
- [ ] 選擇相片/拍照後，Encoder 自動啟動 (顯示載入中)
- [ ] Encoder 完成後，點擊相片產生 Mask + 數字標籤 ①②③
- [ ] 底部顯示「AI 計數: N 顆」
- [ ] 右鍵點擊現有 Mask 可刪除 (負向點擊)
- [ ] Undo/Redo/清空全部 按鈕正常運作
- [ ] 點擊「採用 AI 結果」關閉 Modal，actual_quantity 更新為 AI 計數

### Edge Cases
- [ ] **High-DPI**: MacBook Retina / iPhone 上標籤位置精準 (無偏移)
- [ ] **Object-contain**: 直向長圖/橫向寬圖留白區域點擊不誤判
- [ ] **記憶體**: 連續掃描 10 張相片，iOS Safari 不 Crash (DevTools Memory 面板無洩漏)
- [ ] **離線**: 斷網後重新整理，AI 功能完全可用 (模型從 SW 快取讀取)
- [ ] **降級**: 無 WebGPU 瀏覽器 (Firefox/Safari) 自動降級 WASM，推論 <80ms
- [ ] **模型缺失**: 模型檔案不存在時顯示友善錯誤訊息

### 效能指標
- [ ] Decoder 點擊回應 < 30ms (WebGPU) / < 80ms (WASM)
- [ ] Encoder 全圖推論 < 600ms (WebGPU) / < 1.8s (WASM)
- [ ] 首載模型下載 < 5s (4G 環境)
```

- [ ] **Step 3: 執行測試並提交**

```bash
# 執行 E2E 測試
npx playwright test tests/e2e/ai-counting.spec.ts

# 手動測試清單逐項驗收
git add tests/e2e/ai-counting.spec.ts
git commit -m "test(ai): add E2E tests for AI counting feature"
```

---

### Task 9: 文件更新與最終整理

**Files:**
- Modify: `docs/superpowers/specs/2026-08-09-mobile-sam-integration-design.md` (如有調整同步更新)
- Create: `docs/ai-counting-user-guide.md` (使用者指南)

- [ ] **Step 1: 更新設計文件 (若實作中有調整)**
- [ ] **Step 2: 撰寫使用者指南**

```markdown
# AI 智能計數使用指南

## 啟用方式
1. 進入清點頁面 (/scan)
2. 點擊右上角「齒輪圖示」
3. 勾選「啟用 AI 計數模式」

## 操作流程
1. 點擊藥品卡片的「拍照確認」
2. 拍照或從相簿選擇藥品照片
3. 等待 AI 分析完成 (顯示「AI 模型分析中...」)
4. 在照片上點擊每一顆藥物 → 顯示綠色 Mask + 數字 ①②③
5. 若誤判：右鍵/長按點擊該 Mask 可刪除
6. 確認無誤後，點擊底部「採用 AI 結果 (N)」
7. 系統自動填入實際數量並關閉拍照視窗

## 注意事項
- 首次使用需下載模型 (~39MB)，建議在 WiFi 環境
- 之後離線也能使用 (已快取)
- iOS Safari 會自動使用 CPU 模式，速度稍慢但功能完整
- 連續拍照請間隔幾秒，避免記憶體壓力
```

- [ ] **Step 3: 最終提交**

```bash
git add docs/
git commit -m "docs: update AI counting design spec and add user guide"
```

---

## 總結

| 階段 | 任務 | 預估工時 |
|------|------|----------|
| **P0** | Task 1: 型別定義、計數邏輯、ONNX Session、Model Loader | 4h |
| **P0** | Task 2: Encoder Web Worker + Transferable | 3h |
| **P0** | Task 3: useAICounting Hook (狀態、點擊、渲染、Undo) | 5h |
| **P1** | Task 4: ScanContent Header 齒輪整合 | 2h |
| **P1** | Task 5: CameraModal AI Canvas + 底部操作列 | 5h |
| **P1** | Task 6: Service Worker 模型快取 | 2h |
| **P1** | Task 7: 模型檔案準備與驗證 | 2h |
| **P2** | Task 8: E2E 測試 + 手動驗收清單 | 4h |
| **P2** | Task 9: 文件更新 | 1h |
| **總計** | | **~28h** |

---

**執行方式選擇：**

1. **Subagent-Driven (推薦)** - 我派發子代理逐任務執行，任務間審核
2. **Inline Execution** - 在此會話中批次執行，設定檢查點審核

**請選擇執行方式？**