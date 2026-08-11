// ONNX Runtime Web Session 建立：雙引擎降級 (WebGPU → WASM+SIMD)
// 支援外部資料檔案 (.data) 載入

import * as ort from 'onnxruntime-web';

export interface SessionResult {
  session: ort.InferenceSession;
  backend: 'webgpu' | 'wasm';
}

/** 建立 Decoder Session (Main Thread 使用，需毫秒級回應) */
export async function createDecoderSession(): Promise<SessionResult> {
  const modelUrl = '/models/mobile_sam_decoder.onnx';
  // Decoder 有外部資料檔案 (.data)，需透過 externalData 載入
  const externalData = [{ data: '/models/mobile_sam_decoder.onnx.data', path: 'mobile_sam_decoder.onnx.data' }];

  try {
    // 優先嘗試 WebGPU
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'all',
      externalData,
    });
    return { session, backend: 'webgpu' };
  } catch (e) {
    console.warn('[ONNX] WebGPU 不支援，降級 WASM+SIMD', e);

    // 降級配置：多線程 + SIMD
    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
    ort.env.wasm.simd = true;

    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
      externalData,
    });
    return { session, backend: 'wasm' };
  }
}

/** 建立 Encoder Session (Web Worker 使用，僅執行一次) */
export async function createEncoderSession(): Promise<SessionResult> {
  const modelUrl = '/models/mobile_sam_encoder.onnx';
  // Encoder 模型為自包含 (11MB)，無外部 .data 檔案，不需 externalData

  try {
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'all',
    });
    return { session, backend: 'webgpu' };
  } catch (e) {
    console.warn('[ONNX] Encoder WebGPU 不支援，降級 WASM+SIMD', e);

    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
    ort.env.wasm.simd = true;

    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    });
    return { session, backend: 'wasm' };
  }
}