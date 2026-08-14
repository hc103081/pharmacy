// 模型載入協調器：三階段非阻塞載入 + Worker 通訊 (Blob URL 相容 Turbopack)

import type { ModelLoadState, WorkerMessage, WorkerResponse } from '@/types/ai-count';

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
      modelUrl: '/models/mobile_sam_decoder.onnx',
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
    this.state.encoderStage = 'downloading';
    this.notify();

    // Cache-busting: 使用時間戳記強制重新下載新模型 (0.9 MB, 無 external data)
    const modelUrl = '/models/mobile_sam_encoder.onnx?v=' + Date.now();
    let cancelled = false;

    try {
      // 1. 主執行緒下載模型並追蹤進度
      const response = await fetch(modelUrl, { cache: 'force-cache' });
      if (!response.ok) throw new Error('模型下載失敗: ' + response.status);

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      const reader = response.body?.getReader();
      if (!reader) throw new Error('無法讀取模型資料流');

      const chunks: Uint8Array[] = [];

      try {
        while (true) {
          if (cancelled) break;
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;

          let progress = 0;
          if (total > 0) {
            progress = Math.min(80, Math.round((loaded / total) * 80));
          } else {
            // 未知大小：依已下載 MB 數估算 (Encoder ~11MB)
            const mb = loaded / 1024 / 1024;
            progress = Math.min(80, Math.round(mb * 7));
          }

          this.state.encoderProgress = progress;
          this.state.encoderStage = 'downloading';
          this.notify();
        }
      } catch {
        // 忽略 fetch 取消/錯誤
      }

      if (cancelled) return;

      // 2. 合併 chunks
      this.state.encoderProgress = 85;
      this.state.encoderStage = 'initializing';
      this.notify();

      const modelData = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        modelData.set(chunk, offset);
        offset += chunk.length;
      }

      // 驗證模型資料
      if (modelData.length === 0) {
        throw new Error('模型下載為空 (0 bytes)');
      }
      if (modelData.length < 1024 * 1024) { // 少於 1MB 可能是錯誤頁面
        console.warn('[ModelLoader] 模型大小異常:', modelData.length, 'bytes');
      }
      console.log('[ModelLoader] 模型下載完成:', modelData.length, 'bytes');

      // 3. 傳送 URL 給 Worker 建立 session (與 Decoder 相同方式，避免 Uint8Array 相容性問題)
      this.state.encoderProgress = 90;
      this.notify();

      // 修正線程數：非 crossOriginIsolated 環境限制為 1
      const isCrossOriginIsolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
      const numThreads = isCrossOriginIsolated ? (navigator.hardwareConcurrency || 4) : 1;
      
      console.log('[ModelLoader] 送出 INIT_ENCODER (URL), numThreads:', numThreads);
      this.worker.postMessage({
        type: 'INIT_ENCODER',
        modelUrl: modelUrl,
        wasmConfig: { numThreads, simd: true },
      } satisfies WorkerMessage);
      console.log('[ModelLoader] postMessage 完成');

      // 獨立輪詢：每 200ms 更新進度 90% → 99%，直到 Worker 完成
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
        const progress = Math.min(99, 90 + Math.floor(elapsed / 200));
        this.state.encoderProgress = progress;
        this.notify();
      }, 200);

      // 等待 Worker 完成
      try {
        await Promise.race([
          new Promise<void>(resolve => {
            this.encoderReadyResolver = resolve;
          }),
          new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error('Encoder 初始化逾時 (60秒)')), 60000)
          ),
        ]);
      } catch (err) {
        console.error('[ModelLoader] initEncoder 失敗:', err);
        this.state.encoder = 'error';
        this.state.errorMessage = err instanceof Error ? err.message : 'Unknown error';
        this.notify();
        throw err;
      }

      // 確保進度到 100%（若輪詢尚未跑到）
      this.state.encoderProgress = 100;
      this.state.encoderStage = 'ready';
      this.notify();
      clearInterval(pollInterval);

      // 清理
      this.encoderReadyResolver = null;
    } finally {
      this.progressCleanup = () => { cancelled = true; };
    }
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
