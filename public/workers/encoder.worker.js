// Encoder Web Worker：背景執行 Encoder 推論，零拷貝傳回 Embedding
// 純 JavaScript 版本，使用 importScripts 載入 onnxruntime-web

let encoderSession = null;
let decoderSession = null;
let ort = null;

// 動態載入 onnxruntime-web
async function loadOrt() {
  if (ort) return ort;
  try {
    // 嘗試從 CDN 載入 ESM 模組 (使用正確的 ESM 入口點)
    const mod = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.mjs');
    // 也可能需要從 webgpu/wasm 子模組載入
    console.log('[Worker] onnxruntime-web 載入成功, exports:', Object.keys(mod));
    
    // onnxruntime-web 直接 export 類別
    ort = {
      InferenceSession: mod.InferenceSession,
      Tensor: mod.Tensor,
      env: mod.env || { wasm: {}, webgpu: {} },
    };
    // 確保 env.wasm 存在
    if (!ort.env.wasm) ort.env.wasm = {};
    return ort;
  } catch (e) {
    console.error('[Worker] onnxruntime-web 載入失敗 (ort.mjs):', e);
    // 嘗試備用 URL
    try {
      const mod2 = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.web.mjs');
      ort = {
        InferenceSession: mod2.InferenceSession,
        Tensor: mod2.Tensor,
        env: mod2.env || { wasm: {}, webgpu: {} },
      };
      if (!ort.env.wasm) ort.env.wasm = {};
      console.log('[Worker] onnxruntime-web 載入成功 (ort.web.mjs), exports:', Object.keys(mod2));
      return ort;
    } catch (e2) {
      console.error('[Worker] onnxruntime-web 載入失敗 (ort.web.mjs):', e2);
      throw e2;
    }
  }
}

// 立即啟動載入
loadOrt().then(() => {
  console.log('[Worker] Encoder Worker 就緒');
  self.postMessage({ type: 'WORKER_READY' });
}).catch(err => {
  console.error('[Worker] 啟動失敗:', err);
  self.postMessage({ type: 'ERROR', message: 'Worker 啟動失敗: ' + err.message });
});

console.log('[Worker] 啟動載入 onnxruntime-web...');

/** 將 ImageBitmap 前處理為 Encoder 輸入 Tensor (1, 3, 1024, 1024) */
function preprocessImage(bitmap) {
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
  // ort 會在首次使用前確保已載入
  return new ort.Tensor('float32', data, [1, 3, 1024, 1024]);
}

self.onmessage = async (e) => {
  const { type } = e.data;
  console.log('[Worker] 收到訊息:', type, e.data);

  // 確保 ort 已載入
  if (!ort) {
    await loadOrt();
  }

  try {
    switch (type) {
      case 'INIT_DECODER': {
        const { modelUrl, decoderDataUrl, wasmConfig } = e.data;
        ort.env.wasm.numThreads = wasmConfig.numThreads;
        ort.env.wasm.simd = wasmConfig.simd;

        const decoderExternalData = [{ data: decoderDataUrl, path: 'mobile_sam_decoder.onnx.data' }];

        try {
          decoderSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['webgpu'],
            graphOptimizationLevel: 'all',
            externalData: decoderExternalData,
          });
          self.postMessage({ type: 'DECODER_READY', backend: 'webgpu' });
        } catch {
          decoderSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['wasm'],
            externalData: decoderExternalData,
          });
          self.postMessage({ type: 'DECODER_READY', backend: 'wasm' });
        }
        break;
      }

      case 'INIT_ENCODER': {
        const { modelUrl, wasmConfig } = e.data;
        console.log('[Worker] INIT_ENCODER modelUrl:', modelUrl);
        ort.env.wasm.numThreads = wasmConfig.numThreads;
        ort.env.wasm.simd = wasmConfig.simd;

        // 發送進度：開始下載
        self.postMessage({ type: 'ENCODER_PROGRESS', progress: 5, stage: 'downloading' });

        try {
          console.log('[Worker] Starting Encoder session creation...');
          // 從 URL 建立 Session (Encoder 模型權重已內嵌，無需 externalData)
          // 先嘗試 WebGPU
          try {
            console.log('[Worker] 嘗試 WebGPU 建立 Encoder session...');
            self.postMessage({ type: 'ENCODER_PROGRESS', progress: 10, stage: 'downloading' });
            encoderSession = await ort.InferenceSession.create(modelUrl, {
              executionProviders: ['webgpu'],
              graphOptimizationLevel: 'all',
            });
            console.log('[Worker] WebGPU 成功');
            self.postMessage({ type: 'ENCODER_READY' });
          } catch (webgpuErr) {
            // WebGPU 失敗，降級 WASM
            console.warn('[Worker] WebGPU 失敗，降級 WASM:', webgpuErr.message);
            self.postMessage({ type: 'ENCODER_PROGRESS', progress: 20, stage: 'downloading' });
            try {
              console.log('[Worker] 嘗試 WASM 建立 Encoder session (下載 27MB 模型中)...');
              self.postMessage({ type: 'ENCODER_PROGRESS', progress: 30, stage: 'downloading' });
              encoderSession = await ort.InferenceSession.create(modelUrl, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all',
              });
              console.log('[Worker] WASM 成功');
              self.postMessage({ type: 'ENCODER_PROGRESS', progress: 95, stage: 'initializing' });
              self.postMessage({ type: 'ENCODER_READY' });
            } catch (wasmErr) {
              console.error('[Worker] WASM 也失敗:', wasmErr.message);
              self.postMessage({ type: 'ERROR', message: 'Encoder init failed (both WebGPU and WASM): ' + wasmErr.message });
            }
          }
        } catch (err) {
          console.error('[Worker] Encoder init outer error:', err.message);
          self.postMessage({ type: 'ERROR', message: 'Encoder init failed: ' + err.message });
        }
        break;
      }

      case 'RUN_ENCODER': {
        if (!encoderSession) throw new Error('Encoder not initialized');
        const { imageBitmap } = e.data;
        const inputTensor = preprocessImage(imageBitmap);
        const results = await encoderSession.run({ images: inputTensor });
        const embedding = results.image_embeddings;
        const float32Data = embedding.data;

        // 關鍵：Transferable 零拷貝傳回 Main Thread
        const shape = Array.from(embedding.dims);
        self.postMessage(
          { type: 'EMBEDDING_READY', embedding: float32Data, shape },
          [float32Data.buffer]
        );

        inputTensor.dispose();
        embedding.dispose();
        break;
      }

      case 'DISPOSE': {
        encoderSession = null;
        decoderSession = null;
        break;
      }
    }
  } catch (error) {
    self.postMessage({ type: 'ERROR', message: error.message });
  }
};

// 注意：WORKER_READY 已在 loadOrt().then() 中發送，這裡不再重複發送