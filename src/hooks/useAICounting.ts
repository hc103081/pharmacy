// AI 計數狀態管理 Hook：狀態、點擊處理、Canvas 渲染、Undo/Redo、記憶體管理

import { useState, useCallback, useEffect, useRef } from 'react';
import * as ort from 'onnxruntime-web';
import { getModelLoader } from '@/lib/ai/model-loader';
import { processClick, handleNegativeClick, binarizeAndResize, computeBBox } from '@/lib/ai/counting-logic';
import type { AICountingState, AISegmentedItem, ModelLoadState } from '@/types/ai-count';

export function useAICounting() {
  const [state, setState] = useState<AICountingState>({
    imageId: '',
    imageDimensions: { width: 0, height: 0 },
    imageElement: null,
    isDecoderReady: false,
    isEncoderReady: false,
    isEncoderProcessing: false,
    imageEmbedding: null,
    items: [],
    totalCount: 0,
    isAIModeEnabled: false,
    showAIOverlay: false,
    pendingAdoption: false,
    historyStack: [[]],
    historyIndex: 0,
  });

  const [modelState, setModelState] = useState<ModelLoadState>({
    decoder: 'idle',
    encoder: 'idle',
    backend: 'unknown',
    isEncoderProcessing: false,
  });
  const decoderSessionRef = useRef<ort.InferenceSession | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const modelLoaderRef = useRef<ReturnType<typeof getModelLoader> | null>(null);

  // 初始化 ModelLoader (僅客戶端)
  useEffect(() => {
    const loader = getModelLoader();
    modelLoaderRef.current = loader;
    const unsubscribe = loader.subscribe(setModelState);
    return () => unsubscribe();
  }, []);

  // Phase 1: 進頁即初始化 Decoder (Main Thread 也需要自己的 session)
  useEffect(() => {
    let mounted = true;
    modelLoaderRef.current?.initDecoder().then(({ backend }) => {
      if (!mounted) return;
      import('@/lib/ai/onnx-session').then(({ createDecoderSession }) =>
        createDecoderSession().then(({ session }) => {
          decoderSessionRef.current = session;
          setState(s => ({ ...s, isDecoderReady: true }));
        })
      );
    });
    return () => { mounted = false; };
  }, []);

  // 啟用/關閉 AI 模式
  const toggleAIMode = useCallback(async (enabled: boolean) => {
    setState(s => ({ ...s, isAIModeEnabled: enabled, showAIOverlay: enabled }));
    if (enabled && modelState.encoder !== 'ready' && modelState.encoder !== 'loading') {
      await modelLoaderRef.current?.initEncoder();
    }
    if (!enabled) {
      // 關閉模式時清理
      dispose();
    }
  }, [modelState.encoder]);

  // Phase 3: 載入新圖片，觸發 Encoder 推論
  const loadImage = useCallback(async (imageElement: HTMLImageElement, imageId: string) => {
    const bitmap = await createImageBitmap(imageElement);
    setState(s => ({
      ...s,
      imageId,
      imageDimensions: { width: bitmap.width, height: bitmap.height },
      imageElement,
      items: [],
      totalCount: 0,
      historyStack: [[]],
      historyIndex: 0,
    }));

    const { embedding, shape } = await modelLoaderRef.current!.runEncoder(bitmap);
    const tensor = new ort.Tensor('float32', embedding, shape);
    setState(s => ({ ...s, imageEmbedding: tensor, isEncoderReady: true, showAIOverlay: true }));
    bitmap.close();
  }, []);

  // 正向點擊：呼叫 Decoder 產生 Mask
  const handlePositiveClick = useCallback(async (clickX: number, clickY: number) => {
    if (!state.isEncoderReady || !state.imageEmbedding || !decoderSessionRef.current) return;

    const result = await processClick(state, clickX, clickY, 1, decoderSessionRef.current, state.imageEmbedding);
    if (result && !('action' in result)) {
      pushHistory();
      setState(s => ({
        ...s,
        items: [...s.items, result],
        totalCount: s.items.length + 1,
      }));
    }
  }, [state.isEncoderReady, state.imageEmbedding, state.items.length]);

  // 負向點擊：檢測點擊是否落在現有 Mask 內部，命中即刪除
  const handleNegativeClickAction = useCallback((clickX: number, clickY: number) => {
    const result = handleNegativeClick(state, clickX, clickY);
    if (result?.action === 'delete') {
      pushHistory();
      setState(s => ({
        ...s,
        items: s.items.filter((_, i) => i !== result.index).map((item, idx) => ({ ...item, index: idx + 1 })),
        totalCount: s.items.length - 1,
      }));
    }
  }, [state]);

  // Canvas 點擊事件處理 (含座標歸一化 - Edge Case 1)
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>, isNegative = false) => {
    const img = imgRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect(); // 關鍵：使用 img 而非 canvas
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    if (clickX < 0 || clickX > 1 || clickY < 0 || clickY > 1) return;

    if (isNegative) {
      handleNegativeClickAction(clickX, clickY);
    } else {
      handlePositiveClick(clickX, clickY);
    }
  }, [handlePositiveClick, handleNegativeClickAction]);

  // 繪製 Mask 與數字標籤
  const renderOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !state.isEncoderReady || state.items.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High-DPI 支援：Canvas 內部解析度 = 圖片原始尺寸 * dpr
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = img.clientWidth;
    const displayHeight = img.clientHeight;

    canvas.width = Math.round(state.imageDimensions.width * dpr);
    canvas.height = Math.round(state.imageDimensions.height * dpr);
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const scaleX = displayWidth / state.imageDimensions.width;
    const scaleY = displayHeight / state.imageDimensions.height;

    state.items.forEach((item, idx) => {
      // 繪製 Mask (半透明綠色 rgba(0,255,120,0.35))
      const maskCanvas = new OffscreenCanvas(state.imageDimensions.width, state.imageDimensions.height);
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) return;
      const maskImageData = maskCtx.createImageData(state.imageDimensions.width, state.imageDimensions.height);
      const maskData = maskImageData.data;
      for (let i = 0; i < item.maskData.length; i++) {
        if (item.maskData[i]) {
          maskData[i * 4] = 0;
          maskData[i * 4 + 1] = 255;
          maskData[i * 4 + 2] = 120;
          maskData[i * 4 + 3] = 90; // 0.35 * 255
        }
      }
      maskCtx.putImageData(maskImageData, 0, 0);
      ctx.drawImage(maskCanvas, 0, 0, displayWidth, displayHeight);

      // 繪製數字標籤 ①②③...
      const centerX = (item.boundingBox[0] + item.boundingBox[2]) / 2 * displayWidth;
      const centerY = (item.boundingBox[1] + item.boundingBox[3]) / 2 * displayHeight;
      ctx.font = 'bold 20px system-ui';
      ctx.fillStyle = '#00f2fe';
      ctx.strokeStyle = '#07142b';
      ctx.lineWidth = 4;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = String(idx + 1);
      ctx.strokeText(label, centerX, centerY);
      ctx.fillText(label, centerX, centerY);
    });
  }, [state.items, state.imageDimensions, state.isEncoderReady]);

  // 監聽 items 變化觸發重繪
  useEffect(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(renderOverlay);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [renderOverlay]);

  // Undo/Redo 歷史堆疊
  const pushHistory = useCallback(() => {
    setState(s => ({
      ...s,
      historyStack: [...s.historyStack.slice(0, s.historyIndex + 1), s.items],
      historyIndex: s.historyIndex + 1,
    }));
  }, []);

  const undo = useCallback(() => {
    setState(s => {
      if (s.historyIndex <= 0) return s;
      const newIndex = s.historyIndex - 1;
      return {
        ...s,
        items: s.historyStack[newIndex],
        totalCount: s.historyStack[newIndex].length,
        historyIndex: newIndex,
      };
    });
  }, []);

  const clearAll = useCallback(() => {
    pushHistory();
    setState(s => ({ ...s, items: [], totalCount: 0 }));
  }, [pushHistory]);

  // 採用 AI 計數結果
  const adoptCount = useCallback(() => {
    setState(s => ({ ...s, pendingAdoption: true }));
    return state.totalCount;
  }, [state.totalCount]);

  // 釋放所有資源 (Edge Case 2: 記憶體洩漏防範)
  const dispose = useCallback(() => {
    if (state.imageEmbedding) {
      state.imageEmbedding.dispose();
    }
    // maskData 是 Uint8Array 不需 dispose
    // decoderSessionRef.current?.dispose(); // InferenceSession 無 dispose 方法
    decoderSessionRef.current = null;
    modelLoaderRef.current?.dispose();
    setState(s => ({
      ...s,
      imageEmbedding: null,
      isEncoderReady: false,
      isDecoderReady: false,
      items: [],
      totalCount: 0,
      historyStack: [[]],
      historyIndex: 0,
    }));
  }, [state.imageEmbedding]);

  return {
    state,
    modelState,
    canvasRef,
    imgRef,
    toggleAIMode,
    loadImage,
    handleCanvasClick,
    undo,
    clearAll,
    adoptCount,
    dispose,
    renderOverlay,
  };
}