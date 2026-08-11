// 模型載入協調器：三階段非阻塞載入 + Worker 通訊 (Blob URL 相容 Turbopack)

import type { ModelLoadState, WorkerMessage, WorkerResponse } from '@/types/ai-count';

// Worker 程式碼字串 (內嵌編譯後的 worker 內容)
const WORKER_CODE = `
// Encoder Web Worker：背景執行 Encoder 推論，零拷貝傳回 Embedding
import * as ort from 'onnxruntime-web';

let encoderSession = null;
let decoderSession = null;

function preprocessImage(bitmap) {
  const canvas = new OffscreenCanvas(1024, 1024);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context not available');
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

self.onmessage = async (e) => {
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
            externalData: [{ data: '/models/mobile_sam_decoder.onnx.data', path: 'mobile_sam_decoder.onnx.data' }],
          });
          self.postMessage({ type: 'DECODER_READY', backend: 'webgpu' });
        } catch {
          decoderSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['wasm'],
            externalData: [{ data: '/models/mobile_sam_decoder.onnx.data', path: 'mobile_sam_decoder.onnx.data' }],
          });
          self.postMessage({ type: 'DECODER_READY', backend: 'wasm' });
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
        self.postMessage({ type: 'ENCODER_READY' });
        break;
      }
      case 'RUN_ENCODER': {
        if (!encoderSession) throw new Error('Encoder not initialized');
        const { imageBitmap } = e.data;
        const inputTensor = preprocessImage(imageBitmap);
        const results = await encoderSession.run({ images: inputTensor });
        const embedding = results.image_embeddings;
        const float32Data = embedding.data;
        self.postMessage(
          { type: 'EMBEDDING_READY', embedding: float32Data, shape: embedding.dims },
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
    self.postMessage({ type: 'ERROR', message: error.message });
  }
};
`;

export class ModelLoader {
  private worker: Worker;
  private workerUrl: string;
  private state: ModelLoadState = {
    decoder: 'idle',
    encoder: 'idle',
    backend: 'unknown',
    isEncoderProcessing: false,
  };
  private listeners: Set<(state: ModelLoadState) => void> = new Set();
  private decoderReadyResolver: ((value: { backend: 'webgpu' | 'wasm' }) => void) | null = null;
  private encoderReadyResolver: (() => void) | null = null;
  private embeddingResolver: ((value: { embedding: Float32Array; shape: number[] }) => void) | null = null;

  constructor() {
    // 使用 Blob URL 建立 Worker (相容 Turbopack 和 Webpack)
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    this.workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(this.workerUrl, { type: 'module' });
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
        this.embeddingResolver?.({ embedding: e.data.embedding, shape: e.data.shape });
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
    return () => { this.listeners.delete(listener); };
  }

  getState(): ModelLoadState {
    return { ...this.state };
  }

  async initDecoder(): Promise<{ backend: 'webgpu' | 'wasm' }> {
    if (this.state.decoder !== 'idle') {
      // decoder ready 時 backend 已設為 webgpu 或 wasm
      return { backend: this.state.backend === 'webgpu' ? 'webgpu' : 'wasm' };
    }
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
    URL.revokeObjectURL(this.workerUrl); // 釋放 Blob URL
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