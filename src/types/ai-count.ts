/** AI Count Web Worker 通訊類型定義 */

export interface WorkerMessage {
  type: 'INIT_DECODER' | 'INIT_ENCODER' | 'RUN_ENCODER' | 'DISPOSE';
  modelUrl?: string;
  wasmConfig?: {
    numThreads: number;
    simd: boolean;
  };
  imageBitmap?: ImageBitmap;
}

export interface WorkerResponse {
  type: 'DECODER_READY' | 'ENCODER_READY' | 'EMBEDDING_READY' | 'ERROR';
  backend?: 'webgpu' | 'wasm';
  embedding?: Float32Array;
  shape?: number[];
  message?: string;
}