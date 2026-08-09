// ONNX Runtime Web Session 建立：雙引擎降級 (WebGPU → WASM+SIMD)

import * as ort from 'onnxruntime-web';

export interface SessionResult {
  session: ort.InferenceSession;
  backend: 'webgpu' | 'wasm';
}

/** 建立 Decoder Session (Main Thread 使用，需毫秒級回應) */
export async function createDecoderSession(): Promise<SessionResult> {
  const modelUrl = '/models/mobile_sam_decoder.onnx';

  try {
    // 優先嘗試 WebGPU
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'all',
    });
    return { session, backend: 'webgpu' };
  } catch (e) {
    console.warn('[ONNX] WebGPU 不支援，降級 WASM+SIMD', e);

    // 降級配置：多線程 + SIMD
    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
    ort.env.wasm.simd = true;

    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    });
    return { session, backend: 'wasm' };
  }
}

/** 建立 Encoder Session (Web Worker 使用，僅執行一次) */
export async function createEncoderSession(): Promise<SessionResult> {
  const modelUrl = '/models/mobile_sam_encoder.onnx';

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