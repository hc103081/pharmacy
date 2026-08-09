// AI 計數核心邏輯：IoU 計算、點擊處理、後處理

import type { AICountingState, AISegmentedItem } from '@/types/ai-count';
import * as ort from 'onnxruntime-web';

const IOU_THRESHOLD = 0.75;
const MIN_MASK_AREA = 10;

/** 計算兩個二值化 Mask 的 IoU */
export function calculateIoU(maskA: Uint8Array, maskB: Uint8Array): number {
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < maskA.length; i++) {
    const a = maskA[i];
    const b = maskB[i];
    if (a && b) intersection++;
    if (a || b) union++;
  }
  return union > 0 ? intersection / union : 0;
}

/** 從 Mask 計算邊界框 (歸一化座標 0~1) */
export function computeBBox(mask: Uint8Array, width: number, height: number): [number, number, number, number] {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
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
  return found ? [minX / width, minY / height, maxX / width, maxY / height] : [0, 0, 0, 0];
}

/** 從 logits 計算信心度 */
export function computeConfidence(logits: Float32Array): number {
  const maxLogit = Math.max(...logits);
  return 1 / (1 + Math.exp(-maxLogit));
}

/** 將 Decoder 輸出的 logits 二值化並縮放回目標解析度 */
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

/** 正向點擊處理：呼叫 Decoder 產生 Mask，執行 IoU 去重 */
export async function processClick(
  state: AICountingState,
  clickX: number,
  clickY: number,
  label: 1 | 0,
  decoderSession: ort.InferenceSession,
  imageEmbedding: ort.Tensor
): Promise<AISegmentedItem | { action: 'delete'; item: AISegmentedItem } | null> {
  // SAM 輸入解析度 1024x1024
  const pointCoords = new Float32Array([clickX * 1024, clickY * 1024]);
  const pointLabels = new Float32Array([label]);

  const feeds = {
    image_embeddings: imageEmbedding,
    point_coords: new ort.Tensor('float32', pointCoords, [1, 1, 2]),
    point_labels: new ort.Tensor('float32', pointLabels, [1, 1]),
    orig_im_size: new ort.Tensor(
      'float32',
      new Float32Array([state.imageDimensions.height, state.imageDimensions.width]),
      [1, 2]
    ),
  };

  const results = await decoderSession.run(feeds);
  const maskLogits = results.masks?.data as Float32Array;

  // 立即釋放本次建立的輸入 Tensor (關鍵：防記憶體洩漏)
  feeds.point_coords.dispose();
  feeds.point_labels.dispose();
  feeds.orig_im_size.dispose();

  // 後處理：二值化 + Resize 回原圖解析度
  const binaryMask = binarizeAndResize(maskLogits, state.imageDimensions);
  const area = binaryMask.reduce((a, b) => a + b, 0);

  if (area < MIN_MASK_AREA) return null;

  // IoU 去重檢查
  for (const existing of state.items) {
    const iou = calculateIoU(binaryMask, existing.maskData);
    if (iou > IOU_THRESHOLD) {
      if (label === 1) return null; // 正向點擊重複 → 忽略
      return { action: 'delete', item: existing }; // 負向點擊高重疊 → 刪除既有
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

/** 負向點擊簡化邊界修正：直接檢測點擊是否落在現有 Mask 內部，命中即刪除 */
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