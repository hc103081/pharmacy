// Encoder Web Worker：背景執行 Encoder 推論，零拷貝傳回 Embedding

import * as ort from 'onnxruntime-web';
import type { WorkerMessage, WorkerResponse } from '@/types/ai-count';

let encoderSession: ort.InferenceSession | null = null;
let decoderSession: ort.InferenceSession | null = null;

/** 將 ImageBitmap 前處理為 Encoder 輸入 Tensor (1, 3, 1024, 1024) */
function preprocessImage(bitmap: ImageBitmap): ort.Tensor {
  const canvas = new OffscreenCanvas(1024, 1024);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context not available');
  ctx.drawImage(bitmap, 0, 0, 1024, 1024);
  const imageData = ctx.getImageData(0, 0, 1024, 1024);
  const data = new Float32Array(3 * 1024 * 1024);

  // RGB 通道分離並歸一化到 [0, 1]
  for (let i = 0; i < 1024 * 1024; i++) {
    data[i] = imageData.data[i * 4] / 255; // R
    data[1024 * 1024 + i] = imageData.data[i * 4 + 1] / 255; // G
    data[2 * 1024 * 1024 + i] = imageData.data[i * 4 + 2] / 255; // B
  }
  return new ort.Tensor('float32', data, [1, 3, 1024, 1024]);
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type } = e.data;

  try {
    switch (type) {
      case 'INIT_DECODER': {
        const { modelUrl, decoderDataUrl, wasmConfig } = e.data;
        ort.env.wasm.numThreads = wasmConfig.numThreads;
        ort.env.wasm.simd = wasmConfig.simd;

        // Decoder 使用 externalData (模型有外部權重檔案)
        const decoderExternalData = [{ data: decoderDataUrl, path: 'mobile_sam_decoder.onnx.data' }];

        try {
          decoderSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['webgpu'],
            graphOptimizationLevel: 'all',
            externalData: decoderExternalData,
          });
          self.postMessage({ type: 'DECODER_READY', backend: 'webgpu' } satisfies WorkerResponse);
        } catch {
          decoderSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['wasm'],
            externalData: decoderExternalData,
          });
          self.postMessage({ type: 'DECODER_READY', backend: 'wasm' } satisfies WorkerResponse);
        }
        break;
      }

      case 'INIT_ENCODER': {
        const { modelUrl, wasmConfig } = e.data;
        ort.env.wasm.numThreads = wasmConfig.numThreads;
        ort.env.wasm.simd = wasmConfig.simd;

        try {
          // 先嘗試 WebGPU (Encoder 模型權重已內嵌，無需 externalData)
          try {
            console.log('[Worker] 嘗試 WebGPU 建立 Encoder session...');
            encoderSession = await ort.InferenceSession.create(modelUrl, {
              executionProviders: ['webgpu'],
              graphOptimizationLevel: 'all',
            });
            console.log('[Worker] WebGPU 成功');
            self.postMessage({ type: 'ENCODER_READY' } satisfies WorkerResponse);
          } catch (webgpuErr: unknown) {
            // WebGPU 失敗，降級 WASM
            console.warn('[Worker] WebGPU 失敗，降級 WASM:', (webgpuErr as Error).message);
            try {
              encoderSession = await ort.InferenceSession.create(modelUrl, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all',
              });
              console.log('[Worker] WASM 成功');
              self.postMessage({ type: 'ENCODER_READY' } satisfies WorkerResponse);
            } catch (wasmErr: unknown) {
              console.error('[Worker] WASM 也失敗:', (wasmErr as Error).message);
              self.postMessage({ type: 'ERROR', message: 'Encoder init failed (both WebGPU and WASM): ' + (wasmErr as Error).message } satisfies WorkerResponse);
            }
          }
        } catch (err: unknown) {
          console.error('[Worker] Encoder init outer error:', (err as Error).message);
          self.postMessage({ type: 'ERROR', message: 'Encoder init failed: ' + (err as Error).message } satisfies WorkerResponse);
        }
        break;
      }

      case 'RUN_ENCODER': {
        if (!encoderSession) throw new Error('Encoder not initialized');
        const { imageBitmap } = e.data;
        const inputTensor = preprocessImage(imageBitmap);
        const results = await encoderSession.run({ images: inputTensor });
        const embedding = results.image_embeddings;
        const float32Data = embedding.data as Float32Array;

        // 關鍵：Transferable 零拷貝傳回 Main Thread
        // embedding.dims 是 readonly，需轉為 mutable array
        const shape: number[] = Array.from(embedding.dims);
        self.postMessage(
          { type: 'EMBEDDING_READY', embedding: float32Data, shape: shape as number[] } satisfies WorkerResponse,
          [float32Data.buffer]
        );

        inputTensor.dispose();
        embedding.dispose();
        break;
      }

      case 'DISPOSE': {
        // InferenceSession 在較新版本沒有 dispose 方法，直接釋放參考
        encoderSession = null;
        decoderSession = null;
        break;
      }
    }
  } catch (error) {
    self.postMessage({ type: 'ERROR', message: (error as Error).message } satisfies WorkerResponse);
  }
};