# PaddleOCR v4-mobile 本地瀏覽器 OCR 設計文件

## 1. 專案背景與目標

### 1.1 現狀
- 現有匯入流程使用 **Google Gemini Vision API** 進行雲端 OCR 辨識
- 依賴網路連線、有 API 成本、有延遲

### 1.2 核心目標
- **速度優化**：本地推論零網路延遲，單張照片 < 1.5 秒完成
- **離線可用**：模型快取後斷網仍可操作
- **高精度掃描**：精確解析每一行 44 項藥品的條碼、健保碼、品名、數量、儲位
- **預設本地**：OCR 引擎預設為 PaddleOCR，可在設定頁切換至 Gemini

### 1.3 成功指標
| 指標 | 目標值 |
|------|--------|
| 首次模型載入 | < 3 秒 |
| 快取後模型載入 | < 300 ms |
| 單張推論 (44 項) | < 1.5 秒 |
| 行級準確率 | > 95% |
| 條碼提取率 | > 98% |
| 健保碼提取率 | > 95% |

---

## 2. 架構設計

### 2.1 整體架構 (方案 A：單一 Web Worker)

```
┌─────────────────────────────────────────────────────────────────┐
│                        主執行緒 (UI)                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  useOcrEngine.ts (Strategy Pattern)                      │   │
│  │  • 統一介面: recognize(files) → Promise<OcrResult>       │   │
│  │  • 內建引擎切換: 'gemini' | 'paddleocr'                   │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │ Comlink RPC (postMessage)              │
│                         ▼                                        │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                     Web Worker (OCR Worker)                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  paddleOCRWorker.ts                                      │   │
│  │  • init(): 載入 ONNX 模型 (det + rec)                    │   │
│  │  • recognize(imageData): 完整推論管線                    │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                        │
│    ┌────────────────────┼────────────────────┐                  │
│    ▼                    ▼                    ▼                  │
│ ┌─────────┐         ┌─────────┐         ┌─────────┐            │
│ │ 預處理   │  ───►   │ 文字檢測 │  ───►   │ 文字識別 │            │
│ │ resize  │         │ det.onnx│         │ rec.onnx│            │
│ │ normalize            │ 960×960 │         │ 32×320  │            │
│ └─────────┘         └─────────┘         └─────────┘            │
│    ▲                                              │             │
│    │                    ▼                         │             │
│    └──────────── 後處理 ◄────────────────────────┘             │
│      • NMS 去重                                                │
│      • 行分群 (y 軸聚類 DBSCAN)                                 │
│      • 規則解析: 條碼/健保碼/數量/儲位                          │
│      • 輸出 ParsedItem[]                                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 關鍵技術選型

| 層級 | 技術 | 版本/說明 |
|------|------|-----------|
| 推論引擎 | ONNX Runtime Web | WASM + SIMD 加速 |
| Worker 通訊 | Comlink | 型別安全、Promise 化 |
| 文字檢測模型 | PaddleOCR v4-mobile DBNet | `det_infer.onnx` (~3.2 MB) |
| 文字識別模型 | PaddleOCR v4-mobile CRNN | `rec_infer.onnx` (~5.8 MB) |
| 字典 | PaddleOCR 官方字典 | `dict.txt` (6000+ 字符) |
| 離線快取 | Service Worker + Cache API | 安裝期預快取模型檔 |

---

## 3. 核心模組設計

### 3.1 型別定義 (`src/lib/ocr/types.ts`)

```typescript
export type OcrEngineName = 'gemini' | 'paddleocr';

export interface OcrEngine {
  name: OcrEngineName;
  recognize(images: File[] | string[]): Promise<OcrResult>;
  isReady(): Promise<boolean>;
  warmup?(): Promise<void>;
}

export interface OcrResult {
  success: boolean;
  items: ParsedItem[];           // 相容 ParsedPdf.items
  order_number?: string;
  delivery_date?: string;
  warnings?: Array<{ missing_count: number; page_number: number }>;
  engine: OcrEngineName;
  timings: { total: number; detect: number; recognize: number; postprocess: number };
}

export interface ParsedItem {
  line_number: number;
  barcode: string;          // EAN-13 13-14 碼或 8 碼
  product_code: string;     // 健保碼/商品碼 (A000015421 格式)
  drug_name: string;        // 中文品名
  quantity: number;         // 補貨量
  bonus_quantity: number;   // 贈品量 (預設 0)
  storage_location: string; // 儲位 (F3, A12 等)
  category: string;         // 分類 (預設空)
  confidence?: number;      // 0-1 平均信心度
}

export interface WorkerApi {
  init(): Promise<void>;
  recognize(imageData: ImageData): Promise<OcrResult>;
  terminate(): void;
}
```

### 3.2 常數與配置 (`src/lib/ocr/constants.ts`)

```typescript
export const MODEL_CONFIG = {
  // 模型路徑 (相對 public/)
  detModelUrl: '/models/paddleocr/det_infer.onnx',
  recModelUrl: '/models/paddleocr/rec_infer.onnx',
  dictUrl: '/models/paddleocr/dict.txt',
  
  // 前處理參數
  detInputSize: 960,        // 檢測輸入短邊
  recInputHeight: 32,       // 識別固定高度
  recInputWidth: 320,       // 識別最大寬度
  
  // 正規化參數 (ImageNet)
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
  
  // 後處理閾值
  detBoxThresh: 0.3,
  detUnclipRatio: 1.5,
  nmsThresh: 0.4,
  
  // 行分群
  lineClusterEps: 15,       // DBSCAN y 軸容差 (px)
  minLineTexts: 2,          // 最少文字數視為一行
} as const;

export const REGEX_PATTERNS = {
  // 條碼: EAN-13 (13碼) 或 EAN-8 (8碼) 或 14碼
  barcode: /\b\d{13,14}\b|\b\d{8}\b/g,
  // 健保碼/商品碼: 字母開頭 1-2 碼 + 數字 8-10 碼
  healthCode: /\b[A-Z]{1,2}\d{8,10}\b/g,
  // 數量: 1-4 位純數字
  quantity: /\b\d{1,4}\b/g,
  // 儲位: 英文字母 + 數字 1-3 碼，可含分隔符
  location: /\b[A-Z]\d{1,3}(?:[-/]\d{1,2})?\b/g,
} as const;
```

### 3.3 前處理 (`src/lib/ocr/preprocess.ts`)

```typescript
// 將 HTMLImageElement/File 轉為正規化 Float32Array (NCHW)
export async function preprocessForDet(
  image: HTMLImageElement | ImageData,
  targetSize: number
): Promise<{ tensor: ort.Tensor; scale: number; pad: [number, number] }>;

// 識別用前處理：裁剪文字區域 → resize 32×320 → normalize
export function preprocessForRec(
  imageData: ImageData,
  box: number[][],
  targetHeight: number,
  targetWidth: number
): ort.Tensor;
```

### 3.4 Web Worker 實作 (`src/lib/ocr/paddleOCRWorker.ts`)

```typescript
import { expose } from 'comlink';
import * as ort from 'onnxruntime-web';
import { preprocessForDet, preprocessForRec } from './preprocess';
import { postProcess, parseLinesToItems } from './postProcess';
import { MODEL_CONFIG } from './constants';

let detSession: ort.InferenceSession | null = null;
let recSession: ort.InferenceSession | null = null;
let dictMap: Map<number, string> = new Map();

// 載入字典
async function loadDict() {
  const resp = await fetch(MODEL_CONFIG.dictUrl);
  const text = await resp.text();
  text.split('\n').forEach((char, idx) => dictMap.set(idx, char));
}

async function init() {
  await loadDict();
  detSession = await ort.InferenceSession.create(MODEL_CONFIG.detModelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  recSession = await ort.InferenceSession.create(MODEL_CONFIG.recModelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
}

async function recognize(imageData: ImageData): Promise<OcrResult> {
  const startTotal = performance.now();
  
  // 1. 文字檢測
  const detStart = performance.now();
  const { tensor: detInput, scale, pad } = await preprocessForDet(imageData, MODEL_CONFIG.detInputSize);
  const detOutputs = await detSession!.run({ images: detInput });
  const detTime = performance.now() - detStart;
  
  // 解析檢測框
  const boxes = parseDetOutput(detOutputs, scale, pad, MODEL_CONFIG);
  
  // 2. 文字識別 (批次處理所有 box)
  const recStart = performance.now();
  const recInputs = boxes.map(box => preprocessForRec(imageData, box, MODEL_CONFIG.recInputHeight, MODEL_CONFIG.recInputWidth));
  const recResults = await Promise.all(recInputs.map(input => recSession!.run({ input })));
  const recTime = performance.now() - recStart;
  
  // CTC 解碼
  const texts = recResults.map(output => ctcDecode(output, dictMap));
  
  // 3. 後處理：行分群 + 規則解析
  const postStart = performance.now();
  const items = parseLinesToItems(boxes, texts);
  const postTime = performance.now() - postStart;
  
  return {
    success: true,
    items,
    engine: 'paddleocr',
    timings: { total: performance.now() - startTotal, detect: detTime, recognize: recTime, postprocess: postTime },
  };
}

expose({ init, recognize, terminate: () => { detSession = recSession = null; } });
```

### 3.5 後處理與規則引擎 (`src/lib/ocr/postProcess.ts`)

```typescript
// 核心：將 (boxes, texts) 轉為 ParsedItem[]
export function parseLinesToItems(
  boxes: number[][][],
  texts: string[]
): ParsedItem[] {
  // 1. 過濾低信心度
  const valid = boxes
    .map((box, i) => ({ box, text: texts[i] }))
    .filter(({ text }) => text.length > 0);
  
  // 2. 計算每個 box 的中心點
  const centers = valid.map(({ box }) => ({
    x: box.reduce((s, p) => s + p[0], 0) / 4,
    y: box.reduce((s, p) => s + p[1], 0) / 4,
    ...valid[i],
  }));
  
  // 3. DBSCAN 行分群 (y 軸)
  const clusters = dbscan1D(centers.map(c => c.y), MODEL_CONFIG.lineClusterEps);
  
  // 4. 每群內按 x 排序，組合行文字
  const lines = clusters
    .map(cluster => cluster
      .sort((a, b) => a.x - b.x)
      .map(c => c.text))
    .filter(texts => texts.length >= MODEL_CONFIG.minLineTexts);
  
  // 5. 規則引擎解析每行
  return lines.map((texts, idx) => parseLineToItem(texts, idx + 1));
}

function parseLineToItem(texts: string[], lineNumber: number): ParsedItem {
  const fullText = texts.join(' ');
  
  const barcode = fullText.match(REGEX_PATTERNS.barcode)?.[0] || '';
  const healthCode = fullText.match(REGEX_PATTERNS.healthCode)?.[0] || '';
  const qtyMatches = [...fullText.matchAll(REGEX_PATTERNS.quantity)];
  const quantity = qtyMatches[qtyMatches.length - 1]?.[0] || '0';
  const location = fullText.match(REGEX_PATTERNS.location)?.[0] || '';
  
  // 品名 = 完整文字移除已提取欄位
  let name = fullText
    .replace(barcode, '')
    .replace(healthCode, '')
    .replace(quantity, '')
    .replace(location, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return {
    line_number: lineNumber,
    barcode,
    product_code: healthCode,
    drug_name: name,
    quantity: parseInt(quantity, 10),
    bonus_quantity: 0,
    storage_location: location,
    category: '',
    confidence: 1.0, // TODO: 從模型輸出計算
  };
}

// 1D DBSCAN 實作 (y 軸聚類)
function dbscan1D(values: number[], eps: number): number[][] {
  const visited = new Set<number>();
  const clusters: number[][] = [];
  
  values.forEach((_, i) => {
    if (visited.has(i)) return;
    const cluster = [i];
    visited.add(i);
    expandCluster(i, cluster);
    if (cluster.length > 0) clusters.push(cluster);
  });
  
  function expandCluster(idx: number, cluster: number[]) {
    values.forEach((v, j) => {
      if (!visited.has(j) && Math.abs(v - values[idx]) <= eps) {
        visited.add(j);
        cluster.push(j);
        expandCluster(j, cluster);
      }
    });
  }
  
  return clusters.map(c => c.map(i => values[i]));
}
```

### 3.6 主入口與引擎建立 (`src/lib/ocr/paddleOCR.ts`)

```typescript
import * as Comlink from 'comlink';
import type { OcrEngine, OcrResult, WorkerApi } from './types';

let workerProxy: Comlink.Remote<WorkerApi> | null = null;
let isInitializing = false;

async function getWorker(): Promise<Comlink.Remote<WorkerApi>> {
  if (workerProxy) return workerProxy;
  
  if (isInitializing) {
    // 等待初始化完成
    while (isInitializing) await new Promise(r => setTimeout(r, 50));
    return workerProxy!;
  }
  
  isInitializing = true;
  const worker = new Worker(new URL('./paddleOCRWorker.ts', import.meta.url), { type: 'module' });
  workerProxy = Comlink.wrap<WorkerApi>(worker);
  await workerProxy.init();
  isInitializing = false;
  return workerProxy;
}

export async function createPaddleOcrEngine(): Promise<OcrEngine> {
  const worker = await getWorker();
  
  return {
    name: 'paddleocr',
    async recognize(images: File[] | string[]) {
      // 統一轉為 File 陣列
      const files = images.map(img => 
        typeof img === 'string' ? fetch(img).then(r => r.blob()).then(b => new File([b], 'img.jpg')) : img
      );
      const fileArray = await Promise.all(files);
      
      // 依序處理每張圖片 (可改為並行)
      const allItems: ParsedItem[] = [];
      let orderNumber = '';
      let deliveryDate = '';
      
      for (let i = 0; i < fileArray.length; i++) {
        const bitmap = await createImageBitmap(fileArray[i]);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        const imageData = canvas.getContext('2d')!.getImageData(0, 0, bitmap.width, bitmap.height);
        
        const result = await worker.recognize(imageData);
        allItems.push(...result.items.map((item, idx) => ({ ...item, line_number: allItems.length + idx + 1 })));
        
        if (i === 0) {
          orderNumber = result.order_number || '';
          deliveryDate = result.delivery_date || '';
        }
      }
      
      return {
        success: true,
        items: allItems,
        order_number: orderNumber,
        delivery_date: deliveryDate,
        engine: 'paddleocr',
        timings: { total: 0, detect: 0, recognize: 0, postprocess: 0 },
      };
    },
    async isReady() {
      return !!workerProxy;
    },
    async warmup() {
      await getWorker();
    },
  };
}
```

### 3.7 React Hook 統一介面 (`src/hooks/useOcrEngine.ts`)

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPaddleOcrEngine } from '@/lib/ocr/paddleOCR';
import { processImagesWithGeminiAsPdf } from '@/app/actions/import/ocr';
import type { OcrEngine, OcrEngineName, OcrResult } from '@/lib/ocr/types';

const STORAGE_KEY = 'pharmacy_ocr_engine';

export function useOcrEngine() {
  const [engineName, setEngineName] = useState<OcrEngineName>(() => {
    if (typeof window === 'undefined') return 'paddleocr';
    return (localStorage.getItem(STORAGE_KEY) as OcrEngineName) || 'paddleocr';
  });
  
  const [engine, setEngine] = useState<OcrEngine | null>(null);
  const [isReady, setIsReady] = useState(false);
  const initializingRef = useRef(false);
  
  // 引擎切換時重新初始化
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, engineName);
    initializeEngine();
  }, [engineName]);
  
  const initializeEngine = useCallback(async () => {
    if (initializingRef.current) return;
    initializingRef.current = true;
    setIsReady(false);
    
    let newEngine: OcrEngine;
    if (engineName === 'paddleocr') {
      newEngine = await createPaddleOcrEngine();
    } else {
      // Gemini 引擎包裝器
      newEngine = {
        name: 'gemini',
        async recognize(urls) {
          const result = await processImagesWithGeminiAsPdf({ urls });
          return {
            success: result.success || false,
            items: result.data?.items || [],
            order_number: result.data?.order_metadata.order_number,
            delivery_date: result.data?.order_metadata.delivery_date,
            engine: 'gemini',
            timings: { total: 0, detect: 0, recognize: 0, postprocess: 0 },
          };
        },
        async isReady() { return true; },
      };
    }
    
    setEngine(newEngine);
    setIsReady(true);
    initializingRef.current = false;
  }, [engineName]);
  
  const recognize = useCallback(async (images: File[] | string[]): Promise<OcrResult> => {
    if (!engine) throw new Error('OCR 引擎未初始化');
    return engine.recognize(images);
  }, [engine]);
  
  const warmup = useCallback(async () => {
    if (engine?.warmup) await engine.warmup();
  }, [engine]);
  
  const switchEngine = useCallback((name: OcrEngineName) => {
    setEngineName(name);
  }, []);
  
  return {
    engineName,
    engine,
    isReady,
    recognize,
    warmup,
    switchEngine,
  };
}
```

### 3.8 設定頁面元件 (`src/components/settings/OcrEngineSelector.tsx`)

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Cpu, Cloud } from 'lucide-react';
import { techButtonStyles } from '@/styles/buttons';

export function OcrEngineSelector() {
  const [engine, setEngine] = useState<'paddleocr' | 'gemini'>('paddleocr');
  
  useEffect(() => {
    const saved = localStorage.getItem('pharmacy_ocr_engine');
    if (saved) setEngine(saved as 'paddleocr' | 'gemini');
  }, []);
  
  const handleChange = (newEngine: 'paddleocr' | 'gemini') => {
    setEngine(newEngine);
    localStorage.setItem('pharmacy_ocr_engine', newEngine);
    // 觸發全域事件通知 useOcrEngine 重新初始化
    window.dispatchEvent(new CustomEvent('ocr-engine-change', { detail: newEngine }));
  };
  
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-slate-300">OCR 辨識引擎</label>
      <div className="flex gap-3 flex-wrap" role="radiogroup" aria-label="選擇 OCR 引擎">
        <button
          role="radio"
          aria-checked={engine === 'paddleocr'}
          onClick={() => handleChange('paddleocr')}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
            engine === 'paddleocr'
              ? 'bg-[#00f2fe] text-[#07142b] shadow-[0_0_15px_rgba(0,242,254,0.5)]'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
          }`}
        >
          <Cpu className="w-4 h-4 inline-block mr-1.5" aria-hidden="true" />
          PaddleOCR 本地
          <span className="ml-2 px-2 py-0.5 text-[10px] bg-[#07142b]/50 rounded-full">預設・極速・離線</span>
        </button>
        <button
          role="radio"
          aria-checked={engine === 'gemini'}
          onClick={() => handleChange('gemini')}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
            engine === 'gemini'
              ? 'bg-[#00f2fe] text-[#07142b] shadow-[0_0_15px_rgba(0,242,254,0.5)]'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
          }`}
        >
          <Cloud className="w-4 h-4 inline-block mr-1.5" aria-hidden="true" />
          Gemini 雲端
          <span className="ml-2 px-2 py-0.5 text-[10px] bg-[#07142b]/50 rounded-full">高精度・需網路</span>
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {engine === 'paddleocr'
          ? '模型已快取於瀏覽器，斷網可用，單張約 1.5 秒完成 44 項辨識。'
          : '使用 Google Gemini Vision API，適合模糊、光照不佳或複雜版面的照片。'}
      </p>
    </div>
  );
}
```

---

## 4. 整合現有流程

### 4.1 修改 `src/app/import/page.tsx`

```typescript
// 新增 import
import { useOcrEngine } from '@/hooks/useOcrEngine';

// 在元件內替換 handleOcrImages
const { engineName, recognize, isReady, warmup } = useOcrEngine();

const handleOcrImages = async () => {
  if (uploadedUrls.length === 0) return;
  
  try {
    setOcrProgress({ step: 'uploading', label: `正在初始化 ${engineName === 'paddleocr' ? '本地' : '雲端'} OCR...`, percent: 5 });
    
    if (!isReady) {
      setOcrProgress({ step: 'header', label: '首次載入模型中...', percent: 10 });
      await warmup();
    }
    
    setOcrProgress({ step: 'batch', label: `${engineName === 'paddleocr' ? '本地推論' : '雲端辨識'}中（${uploadedUrls.length} 張）...`, percent: 30 });
    
    const result = await recognize(uploadedUrls);
    
    setOcrProgress({ step: 'done', label: 'OCR 辨識完成！', percent: 100 });
    await new Promise(r => setTimeout(r, 500));
    
    if (!result.success || !result.items?.length) {
      setStatus('error');
      setMessage(`OCR 辨識失敗: ${result.error || '未取得任何藥品項目'}`);
      setOcrProgress(null);
      return;
    }
    
    // 轉換為 ParsedPdf 格式 (完全相容 PreviewPanel)
    const parsedPdf: ParsedPdf = {
      order_metadata: {
        order_number: result.order_number || '',
        delivery_date: result.delivery_date || '',
        total_items: result.items.length,
        source_type: 'images',
        uploaded_image_count: uploadedUrls.length,
        ocr_page_count: uploadedUrls.length,
        ocr_request_count: engineName === 'gemini' ? uploadedUrls.length : 1,
        ocr_engine: engineName,
      },
      items: result.items,
    };
    
    setParsedData(parsedPdf);
    setManifestName(prev => prev.trim() || result.order_number || '');
    setStatus('idle');
    setMessage('');
    setOcrProgress(null);
  } catch (err) {
    console.error('OCR Error:', err);
    setStatus('error');
    setMessage(`OCR 辨識錯誤: ${err instanceof Error ? err.message : '未知錯誤'}`);
    setOcrProgress(null);
  }
};
```

### 4.2 修改 `src/app/actions/import/ocr.ts` (可選：保留 Gemini Server Action 作為備援)

```typescript
// 新增：本地 OCR 不需 Server Action，但保留此檔案供 Gemini 使用
// 未來若需雲端備援 PaddleOCR，可在此新增 processImagesWithPaddleOCR()
```

---

## 5. 部署與建置配置

### 5.1 `next.config.js` 修改

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 允許 Web Worker 使用 ES 模組
  experimental: {
    webWorker: true,
  },
  // 複製模型檔到輸出目錄
  async rewrites() {
    return [
      {
        source: '/models/:path*',
        destination: '/models/:path*',
      },
    ];
  },
  // Webpack 配置：處理 .onnx、.wasm 檔案
  webpack(config, { isServer }) {
    if (!isServer) {
      config.module.rules.push({
        test: /\.(onnx|wasm)$/,
        type: 'asset/resource',
        generator: {
          filename: 'static/models/[name][ext]',
        },
      });
    }
    return config;
  },
};

module.exports = nextConfig;
```

### 5.2 `public/sw.js` (Service Worker)

```javascript
// 使用 next-pwa 自動產生，或手動編寫
const CACHE_NAME = 'pharmacy-paddleocr-v1';
const MODEL_URLS = [
  '/models/paddleocr/det_infer.onnx',
  '/models/paddleocr/rec_infer.onnx',
  '/models/paddleocr/dict.txt',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(MODEL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/models/paddleocr/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
```

### 5.3 `package.json` 新增依賴

```json
{
  "dependencies": {
    "onnxruntime-web": "^1.18.0",
    "comlink": "^4.4.1"
  },
  "devDependencies": {
    "@types/comlink": "^4.4.0"
  }
}
```

---

## 6. 模型取得與驗證

### 6.1 官方模型下載
- PaddleOCR v4-mobile 推論模型：https://github.com/PaddlePaddle/PaddleOCR/blob/release/2.7/doc/doc_en/models_list_en.md
- 需轉換為 ONNX 格式：`paddle2onnx` 工具
- 或使用社群已轉換版本：`onnx-paddleocr` 專案

### 6.2 模型驗證腳本
```python
# scripts/verify_onnx_models.py
import onnxruntime as ort
import numpy as np

for model_path in ['det_infer.onnx', 'rec_infer.onnx']:
    sess = ort.InferenceSession(model_path)
    print(f"{model_path}:")
    print(f"  Inputs: {[i.name for i in sess.get_inputs()]}")
    print(f"  Outputs: {[o.name for o in sess.get_outputs()]}")
    # 測試推論
    dummy = np.random.randn(1, 3, 960, 960).astype(np.float32) if 'det' in model_path else np.random.randn(1, 3, 32, 320).astype(np.float32)
    out = sess.run(None, {sess.get_inputs()[0].name: dummy})
    print(f"  Output shapes: {[o.shape for o in out]}")
```

---

## 7. 測試計畫

### 7.1 單元測試
- [ ] `preprocess.ts`: 輸入尺寸、正規化數值正確性
- [ ] `postProcess.ts`: 規則引擎各欄位提取準確率 (用標註資料驗證)
- [ ] `dbscan1D`: 行分群邊界條件 (單行、重疊、間距大)

### 7.2 整合測試
- [ ] Web Worker 初始化、推論、終止生命週期
- [ ] Comlink 型別安全呼叫
- [ ] 切換引擎時狀態正確重置
- [ ] Service Worker 離線快取模型檔

### 7.3 效能基準測試
- [ ] 桌面 Chrome: 模型載入、推論時間
- [ ] 手機 Chrome/Safari: 記憶體、推論時間、電量
- [ ] 低階裝置: 降級策略驗證

---

## 8. 風險評估與對策

| 風險 | 機率 | 影響 | 緩解方案 |
|------|------|------|----------|
| 手機 WASM 效能不足 | 中 | 高 | 降級：輸入 640×640、關閉 Beam Search、Web Worker 降優先級 |
| 模型檔過大影響首屏 | 低 | 中 | 動態 import、進度條顯示、預載關鍵模型 |
| Safari 不支援 SIMD | 中 | 中 | WASM fallback、polyfill、優雅降級至 Gemini |
| 識別準確率不達標 | 中 | 高 | 持續收集錯樣本、調優規則引擎、微調字典 |
| Service Worker 快取失效 | 低 | 中 | Versioned cache name、手動清除機制、fallback 到網路 |

---

## 9. 實作里程碑

| 階段 | 任務 | 預估工時 |
|------|------|----------|
| **Phase 1: 基礎建設** | 依賴安裝、模型檔放置、SW 註冊、Web Worker 架構 | 4h |
| **Phase 2: 核心推論** | ONNX Session 建立、前處理、檢測+識別管線 | 6h |
| **Phase 3: 後處理** | NMS、DBSCAN 行分群、規則引擎解析、ParsedItem 輸出 | 6h |
| **Phase 4: 整合** | useOcrEngine Hook、import/page.tsx 切換、設定頁 UI | 4h |
| **Phase 5: 優化與測試** | 效能調優、錯誤處理、離線測試、跨瀏覽器驗證 | 4h |
| **總計** | | **~24h** |

---

## 10. 後續擴展 (Out of Scope)

- [ ] 多 Worker 並行處理多張圖片 (Pipeline 架構)
- [ ] 模型量化 (INT8) 進一步縮小體積、提速
- [ ] 自訂字典微調 (藥品名稱專用詞彙)
- [ ] WebGPU 後端支援 (Chrome 113+)
- [ ] 訓練專用醫藥版面檢測模型

---

## 11. 簽核確認

- [ ] 架構設計審閱通過
- [ ] 模型授權確認 (PaddleOCR Apache 2.0)
- [ ] 效能基準達成標準
- [ ] 無障礙設計檢查 (設定頁 UI)
- [ ] 安全性審查 (本地處理無資料上傳)

---

**文件版本**: 1.0  
**建立日期**: 2026-09-19  
**作者**: AI Assistant  
**審核狀態**: 待使用者確認