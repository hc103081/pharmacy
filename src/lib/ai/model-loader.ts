// 模型載入協調器：三階段非阻塞載入 + Worker 通訊 (Blob URL 相容 Turbopack)

import type { ModelLoadState, WorkerMessage, WorkerResponse } from '@/types/ai-count';

// 使用本地模型檔案 (public/models/)，避免跨域下載與手機網路逾時
const MODEL_BASE = '/models';

export class ModelLoader {
  private worker: Worker;
  private state: ModelLoadState = {
    decoder: 'idle',
    encoder: 'idle',
    backend: 'unknown',
    isEncoderProcessing: false,
    encoderProgress: 0,
    encoderStage: 'idle',
  };
  private listeners: Set<(state: ModelLoadState) => void> = new Set();
  private decoderReadyResolver: ((value: { backend: 'webgpu' | 'wasm' }) => void) | null = null;
  private encoderReadyResolver: (() => void) | null = null;
  private embeddingResolver: ((value: { embedding: Float32Array; shape: number[] }) => void) | null = null;

  private workerReady: Promise<void>;

  constructor() {
    // 使用 public/workers 下的檔案式 Worker (Next.js 相容)
    this.worker = new Worker('/workers/encoder.worker.js', { type: 'module' });
    this.worker.onmessage = this.handleWorkerMessage.bind(this);

    // 等待 Worker 就緒 (Worker 啟動後會發送第一則訊息)
    this.workerReady = new Promise(resolve => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'WORKER_READY' || e.data?.type === 'DECODER_READY' || e.data?.type === 'ENCODER_READY' || e.data?.type === 'ERROR') {
          console.log('[ModelLoader] Worker ready 收到:', e.data.type);
          this.worker.removeEventListener('message', handler);
          resolve();
        }
      };
      this.worker.addEventListener('message', handler);
      // 保險：3 秒後強制 resolve
      setTimeout(() => {
        console.log('[ModelLoader] Worker ready 逾時，強制 resolve');
        this.worker.removeEventListener('message', handler);
        resolve();
      }, 3000);
    });
  }

  private async ensureWorkerReady() {
    console.log('[ModelLoader] 等待 Worker ready...');
    await this.workerReady;
    console.log('[ModelLoader] Worker ready 完成');
  }

  private handleWorkerMessage(e: MessageEvent<WorkerResponse>) {
    const { type } = e.data;
    switch (type) {
      case 'DECODER_READY':
        this.state.decoder = 'ready';
        this.state.backend = e.data.backend;
        this.decoderReadyResolver?.({ backend: e.data.backend });
        this.decoderReadyResolver = null;
        break;
      case 'ENCODER_READY':
        this.progressCleanup?.();
        this.progressCleanup = null;
        this.state.encoder = 'ready';
        this.state.encoderProgress = 100;
        this.state.encoderStage = 'ready';
        this.encoderReadyResolver?.();
        this.encoderReadyResolver = null;
        break;
      case 'EMBEDDING_READY':
        this.state.isEncoderProcessing = false;
        this.embeddingResolver?.({ embedding: e.data.embedding, shape: e.data.shape });
        this.embeddingResolver = null;
        break;
      case 'ENCODER_PROGRESS':
        this.state.encoderProgress = e.data.progress;
        this.state.encoderStage = e.data.stage;
        break;
      case 'ERROR':
        this.progressCleanup?.();
        this.progressCleanup = null;
        this.state.decoder = 'error';
        this.state.encoder = 'error';
        this.state.errorMessage = e.data.message;
        console.error('[ModelLoader] Worker ERROR:', e.data.message);
        // 解開等待的 Promise，避免卡住
        this.encoderReadyResolver?.();
        this.decoderReadyResolver?.({ backend: 'wasm' });
        break;
    }
    this.notify();
  }

  private notify() {
    this.listeners.forEach(l => l({ ...this.state }));
  }

  subscribe(listener: (state: ModelLoadState) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getState(): ModelLoadState {
    return { ...this.state };
  }

  async initDecoder(): Promise<{ backend: 'webgpu' | 'wasm' }> {
    if (this.state.decoder !== 'idle') {
      return { backend: this.state.backend === 'webgpu' ? 'webgpu' : 'wasm' };
    }
    await this.ensureWorkerReady();
    this.state.decoder = 'loading';
    this.notify();

    this.worker.postMessage({
      type: 'INIT_DECODER',
      modelUrl: `${MODEL_BASE}/mobile_sam_decoder.onnx`,
      decoderDataUrl: `${MODEL_BASE}/mobile_sam_decoder.onnx.data`,
      wasmConfig: { numThreads: navigator.hardwareConcurrency || 4, simd: true },
    } satisfies WorkerMessage);

    return new Promise(resolve => {
      this.decoderReadyResolver = resolve;
    });
  }

  async initEncoder(): Promise<void> {
    if (this.state.encoder !== 'idle') return;
    await this.ensureWorkerReady();
    this.state.encoder = 'loading';
    this.state.encoderProgress = 0;
    this.state.encoderStage = 'initializing';
    this.notify();

    // 優先使用 fp32 版本 (含 external data，適合 web 串流載入)
    const modelUrl = `${MODEL_BASE}/mobile_sam_encoder_fp32.onnx`;
    const modelDataUrl = `${MODEL_BASE}/mobile_sam_encoder_fp32.onnx.data`;

    // 先驗證檔案可存取
    try {
      const testRes = await fetch(modelUrl, { method: 'HEAD' });
      console.log('[ModelLoader] Encoder 模型檔案 HEAD 請求:', testRes.status, testRes.headers.get('content-length'));
      if (!testRes.ok) throw new Error(`Encoder 模型檔案不可存取: ${testRes.status}`);
      
      const dataRes = await fetch(modelDataUrl, { method: 'HEAD' });
      console.log('[ModelLoader] Encoder data 檔案 HEAD 請求:', dataRes.status, dataRes.headers.get('content-length'));
      if (!dataRes.ok) throw new Error(`Encoder data 檔案不可存取: ${dataRes.status}`);
    } catch (e) {
      console.error('[ModelLoader] Encoder 模型檔案預檢失敗，嘗試備用檔案:', e);
      // 備用：使用單一檔案版本
      const fallbackUrl = `${MODEL_BASE}/mobile_sam_encoder.onnx`;
      try {
        const fallbackRes = await fetch(fallbackUrl, { method: 'HEAD' });
        console.log('[ModelLoader] 備用 Encoder 檔案 HEAD 請求:', fallbackRes.status);
        if (fallbackRes.ok) {
          console.log('[ModelLoader] 使用備用 Encoder 檔案');
          // 這裡不拋錯，繼續使用備用檔案
        }
      } catch {}
    }

    // 修正線程數：非 crossOriginIsolated 環境限制為 1
    const isCrossOriginIsolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
    const numThreads = isCrossOriginIsolated ? (navigator.hardwareConcurrency || 4) : 1;

    console.log('[ModelLoader] 送出 INIT_ENCODER (local fp32), modelUrl:', modelUrl, 'modelDataUrl:', modelDataUrl, 'numThreads:', numThreads);
    this.worker.postMessage({
      type: 'INIT_ENCODER',
      modelUrl: modelUrl,
      // encoder data URL 傳給 worker 用於 externalData
      encoderDataUrl: modelDataUrl,
      wasmConfig: { numThreads, simd: true },
    } satisfies WorkerMessage);
    console.log('[ModelLoader] postMessage 完成');

    // 獨立輪詢：更新進度直到 Worker 完成
    const pollStart = Date.now();
    const pollInterval = setInterval(() => {
      if (this.state.encoder === 'ready') {
        this.state.encoderProgress = 100;
        this.state.encoderStage = 'ready';
        this.notify();
        clearInterval(pollInterval);
        return;
      }
      const elapsed = Date.now() - pollStart;
      // 估算進度：本地載入較快，1分鐘內線性增長到 99%
      const progress = Math.min(99, Math.floor((elapsed / ENCODER_TIMEOUT_MS) * 99));
      this.state.encoderProgress = progress;
      this.state.encoderStage = progress < 90 ? 'downloading' : 'initializing';
      this.notify();
    }, 200);

    // 等待 Worker 完成 (60 秒逾時，本地載入通常幾秒內完成)
    const ENCODER_TIMEOUT_MS = 60000; // 1 分鐘
    try {
      await Promise.race([
        new Promise<void>(resolve => {
          this.encoderReadyResolver = resolve;
        }),
        new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error(`Encoder 初始化逾時 (${ENCODER_TIMEOUT_MS / 1000}秒)`)), ENCODER_TIMEOUT_MS)
        ),
      ]);
    } catch (err) {
      clearInterval(pollInterval);
      console.error('[ModelLoader] initEncoder 失敗:', err);
      this.state.encoder = 'error';
      this.state.errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.notify();
      throw err;
    } finally {
      // 確保清理
      clearInterval(pollInterval);
    }

    // 確保進度到 100%
    this.state.encoderProgress = 100;
    this.state.encoderStage = 'ready';
    this.notify();
    clearInterval(pollInterval);

    // 清理
    this.encoderReadyResolver = null;
  }

  private progressCleanup: (() => void) | null = null;

  async runEncoder(imageBitmap: ImageBitmap): Promise<{ embedding: Float32Array; shape: number[] }> {
    this.state.isEncoderProcessing = true;
    this.notify();

    // Transferable: 零拷貝傳輸 ImageBitmap 給 Worker
    this.worker.postMessage({ type: 'RUN_ENCODER', imageBitmap }, [imageBitmap]);

    return new Promise(resolve => {
      this.embeddingResolver = resolve;
    });
  }

  dispose() {
    this.worker.postMessage({ type: 'DISPOSE' });
    this.worker.terminate();
    this.listeners.clear();
  }
}

let modelLoaderInstance: ModelLoader | null = null;

export function getModelLoader(): ModelLoader {
  if (typeof window === 'undefined') {
    throw new Error('ModelLoader can only be used on client side');
  }
  if (!modelLoaderInstance) {
    modelLoaderInstance = new ModelLoader();
  }
  return modelLoaderInstance;
}

// 為了向後相容，提供一個 proxy 物件
export const modelLoader = new Proxy({} as ModelLoader, {
  get(_, prop) {
    if (typeof window === 'undefined') {
      throw new Error('ModelLoader can only be used on client side');
    }
    return (getModelLoader() as any)[prop];
  },
});