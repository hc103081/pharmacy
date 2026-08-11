// AI 計數系統核心型別定義

// 單一 AI 偵測物件
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

// AI 計數狀態機
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

// 模型載入狀態
export interface ModelLoadState {
  decoder: 'idle' | 'loading' | 'ready' | 'error';
  encoder: 'idle' | 'loading' | 'ready' | 'error';
  backend: 'webgpu' | 'wasm' | 'unknown';
  errorMessage?: string;
  isEncoderProcessing: boolean;
  encoderProgress?: number; // 0-100
  encoderStage?: 'downloading' | 'initializing' | 'ready';
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
  | { type: 'EMBEDDING_READY'; embedding: Float32Array; shape: number[] }
  | { type: 'ERROR'; message: string }
  | { type: 'ENCODER_PROGRESS'; progress: number; stage: 'downloading' | 'initializing' | 'ready' };