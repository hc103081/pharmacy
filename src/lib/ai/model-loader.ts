// 模型載入協調器：三階段非阻塞載入 + Worker 通訊

import type { ModelLoadState, WorkerMessage, WorkerResponse } from '@/types/ai-count';

export class ModelLoader {
  private worker: Worker;
  private state: ModelLoadState = {
    decoder: 'idle',
    encoder: 'idle',
    backend: 'unknown',
  };
  private listeners: Set<(state: ModelLoadState) => void> = new Set();
  private decoderReadyResolver: ((value: { backend: 'webgpu' | 'wasm' }) => void) | null = null;
  private encoderReadyResolver: (() => void) | null = null;
  private embeddingResolver: ((embedding: Float32Array, shape: number[]) => void) | null = null;

  constructor() {
    // 使用相對路徑建立 Worker，支援模組化
    this.worker = new Worker(new URL('../workers/encoder.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
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

  /** 訂閱模型載入狀態變化 */
  subscribe(listener: (state: ModelLoadState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): ModelLoadState {
    return { ...this.state };
  }

  /** Phase 1: 進頁即載入 Decoder (~4MB) */
  async initDecoder(): Promise<{ backend: 'webgpu' | 'wasm' }> {
    if (this.state.decoder !== 'idle') return { backend: this.state.backend };
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

  /** Phase 2: 開啟相機/選相片時載入 Encoder (~35MB) */
  async initEncoder(): Promise<void> {
    if (this.state.encoder !== 'idle') return;
    this.state.encoder = 'loading';
    this.notify();

    this.worker.postMessage({
      type: 'INIT_ENCODER',
      modelUrl: '/models/mobile_sam_encoder.onnx',
      wasmConfig: { numThreads: navigator.hardwareConcurrency || 4, simd: true },
    } satisfies WorkerMessage);

    return new Promise(resolve => {
      this.encoderReadyResolver = resolve;
    });
  }

  /** Phase 3: 照片載入完成，執行 Encoder 推論產生 Embedding */
  async runEncoder(imageBitmap: ImageBitmap): Promise<{ embedding: Float32Array; shape: number[] }> {
    this.state.isEncoderProcessing = true;
    this.notify();

    // Transferable: 零拷貝傳輸 ImageBitmap 給 Worker
    this.worker.postMessage({ type: 'RUN_ENCODER', imageBitmap }, [imageBitmap]);

    return new Promise(resolve => {
      this.embeddingResolver = resolve;
    });
  }

  /** 清理資源 */
  dispose() {
    this.worker.postMessage({ type: 'DISPOSE' });
    this.worker.terminate();
    this.listeners.clear();
  }
}

// 單例實例
export const modelLoader = new ModelLoader();