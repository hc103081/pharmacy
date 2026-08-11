'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Camera, CheckCircle2, RotateCcw, Trash2, RefreshCw } from 'lucide-react';
import { useAICounting } from '@/hooks/useAICounting';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onError: (message: string) => void;
  onCheckingSupport: (isSupported: boolean | null) => void;
  frontCamera?: boolean;
  // AI 計數相關
  isAIModeEnabled: boolean;
  onAIAdoptCount: () => number;
  onAIDispose: () => void;
}

export default function CameraModal({
  isOpen,
  onClose,
  onCapture,
  onError,
  onCheckingSupport,
  frontCamera = false,
  isAIModeEnabled,
  onAIAdoptCount,
  onAIDispose,
}: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingSupport, setCheckingSupport] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // AI 計數相關
  const {
    state: aiState,
    modelState,
    canvasRef: aiCanvasRef,
    imgRef,
    handleCanvasClick,
    adoptCount,
    clearAll,
    undo,
    dispose,
    loadImage,
  } = useAICounting();

  // 關閉 Modal 時清理
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setPhotoUrl(null);
      if (isAIModeEnabled) {
        onAIDispose();
        dispose();
      }
    }
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [isOpen, isAIModeEnabled, onAIDispose, dispose, stream]);

  // 檢查相機支援
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      setCheckingSupport(true);
      onCheckingSupport(true);
    } else {
      setCheckingSupport(false);
      onCheckingSupport(false);
    }
  }, [onCheckingSupport]);

  // 照片載入完成後觸發 AI Encoder
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    imgRef.current = img;
    if (isAIModeEnabled && aiState.isEncoderReady === false && !aiState.isEncoderProcessing) {
      loadImage(img, `photo-${Date.now()}`);
    }
  }, [isAIModeEnabled, aiState.isEncoderReady, aiState.isEncoderProcessing, loadImage]);

  const startCamera = useCallback(async () => {
    try {
      setCheckingSupport(true);
      const constraints = {
        video: {
          facingMode: frontCamera ? 'user' : 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);
      onCheckingSupport(true);
    } catch (err) {
      console.error('Camera access error:', err);
      setError('無法訪問相機，請檢查權限');
      setCheckingSupport(false);
      onCheckingSupport(false);
    }
  }, [frontCamera, onCheckingSupport]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !stream) {
      onError("相機未就緒");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const canvas = document.createElement('canvas');
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('無法獲取畫布上下文');

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve, reject) => {
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg');
      });

      if (!blob) {
        throw new Error('無法處理圖像');
      }

      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });

      // 停止相機串流
      stopCamera();

      // 建立 object URL 供預覽
      const url = URL.createObjectURL(file);
      setPhotoUrl(url);

      // 呼叫 onCapture 讓上層處理上傳
      onCapture(file);

    } catch (err: any) {
      setIsLoading(false);
      setError(`拍照失敗: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [stream, onError, onCapture, stopCamera]);

  const handleFileSelect = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
    onCapture(file);
  }, [onCapture]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // 鍵盤快捷鍵
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.key === ' ' || e.key === 'Enter') && !photoUrl) {
        e.preventDefault();
        handleCapture();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, photoUrl, handleCapture]);

  // 載入狀態
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#00f2fe] border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-300">處理中...</p>
        </div>
      </div>
    );
  }

  // 錯誤狀態
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-[#162a56] border border-blue-500/30 rounded-xl p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">相機錯誤</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <p className="text-slate-300 mb-4">{error}</p>
          <button onClick={onClose} className="w-full bg-[#00f2fe] text-slate-900 font-bold py-2 px-4 rounded-xl hover:bg-[#00f2fe]/90 active:scale-95 transition-all">關閉</button>
        </div>
      </div>
    );
  }

  // 不支援相機
  if (checkingSupport === false) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-[#162a56] border border-blue-500/30 rounded-xl p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">相機功能不可用</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <p className="text-slate-300 mb-4">您的設備或瀏覽器不支援進階相機功能。將使用傳統檔案上傳方式。</p>
          <button onClick={onClose} className="w-full bg-[#00f2fe] text-slate-900 font-bold py-2 px-4 rounded-xl hover:bg-[#00f2fe]/90 active:scale-95 transition-all">關閉並使用傳統方式</button>
        </div>
      </div>
    );
  }

  // 正在檢查支援
  if (checkingSupport === null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#00f2fe] border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-2 text-slate-300">檢查相機權限...</p>
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] mx-4" ref={containerRef}>
        {/* 關閉按鈕 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-slate-900/80 rounded-full text-slate-300 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* AI 模式指示器 */}
        {isAIModeEnabled && (
          <div className="absolute top-4 left-4 z-10 px-3 py-1 bg-[#00f2fe]/20 border border-[#00f2fe]/50 rounded-full text-xs font-bold text-[#00f2fe] flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#00f2fe] animate-pulse" />
            AI 計數模式
          </div>
        )}

        {photoUrl ? (
          // 照片預覽模式
          <div className="relative">
            <img
              src={photoUrl}
              ref={imgRef}
              className="max-w-full max-h-[70vh] object-contain"
              onLoad={handleImageLoad}
            />

            {/* AI 疊加 Canvas - Edge Case 1: 座標對位 */}
            {isAIModeEnabled && aiState.isEncoderReady && (
              <canvas
                ref={aiCanvasRef}
                className="absolute top-0 left-0 pointer-events-none"
                onClick={e => handleCanvasClick(e as React.MouseEvent<HTMLCanvasElement>, false)}
                onContextMenu={e => {
                  e.preventDefault();
                  handleCanvasClick(e as React.MouseEvent<HTMLCanvasElement>, true);
                }}
              />
            )}

            {/* AI 載入中提示 - 顯示進度 */}
            {isAIModeEnabled && !aiState.isEncoderReady && modelState.encoder === 'loading' && modelState.encoderProgress !== undefined && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 bg-slate-900/90 backdrop-blur p-6 rounded-xl border border-blue-500/30 min-w-[280px]">
                <div className="w-full flex flex-col gap-2">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{modelState.encoderStage === 'downloading' ? '下載模型' : modelState.encoderStage === 'initializing' ? '初始化模型' : '完成'}</span>
                    <span>{modelState.encoderProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#00f2fe] to-[#4fd1c5] transition-all duration-300 ease-out"
                      style={{ width: `${modelState.encoderProgress}%` }}
                    />
                  </div>
                  <p className="text-slate-300 text-sm text-center">
                    {modelState.encoderStage === 'downloading' 
                      ? `正在下載 Encoder 模型 (~11MB)...` 
                      : `正在初始化模型...`}
                  </p>
                </div>
              </div>
            )}

            {/* AI 未就緒時的啟動按鈕 */}
            {isAIModeEnabled && !aiState.isEncoderReady && !aiState.isEncoderProcessing && (
              <button
                onClick={() => { /* loadImage 會在 onLoad 觸發 */ }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#00f2fe] text-slate-900 px-6 py-3 rounded-xl font-bold text-lg shadow-[0_0_20px_rgba(0,242,254,0.4)]"
              >
                開始 AI 分析
              </button>
            )}

            {/* 底部 AI 計數操作列 - Sticky Bottom Bar */}
            {isAIModeEnabled && aiState.isEncoderReady && aiState.items.length > 0 && (
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#162a56]/95 backdrop-blur border-t border-blue-500/30 z-40 pointer-events-auto">
                <div className="max-w-4xl mx-auto flex flex-col gap-3">
                  <div className="flex items-center justify-between text-center">
                    <span className="text-slate-400 text-sm">AI 偵測顆粒數</span>
                    <span className="text-4xl font-bold font-mono text-[#00f2fe] drop-shadow-[0_0_15px_rgba(0,242,254,0.5)]">
                      {aiState.totalCount}
                    </span>
                    <span className="text-slate-400 text-sm">顆</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={undo}
                      disabled={aiState.historyIndex <= 0}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" /> 復原
                    </button>
                    <button
                      onClick={clearAll}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> 清空全部
                    </button>
                    <button
                      onClick={() => {
                        const count = adoptCount();
                        // 將 count 存入全域供 handleCameraFile/handleFileSelect 使用
                        window.aiAdoptedCount = count;
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#00f2fe] text-slate-900 font-bold shadow-[0_0_10px_rgba(0,242,254,0.4)] hover:bg-[#00f2fe]/90 active:scale-95 transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" /> 採用 AI 結果 ({aiState.totalCount})
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 原有的操作按鈕區 */}
            <div className={`absolute bottom-0 left-0 right-0 p-4 flex gap-2 ${isAIModeEnabled && aiState.items.length > 0 ? 'pb-32' : ''}`}>
              <button
                onClick={() => {
                  setPhotoUrl(null);
                  if (isAIModeEnabled) {
                    onAIDispose();
                    dispose();
                  }
                  startCamera();
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors active:scale-95"
              >
                <RotateCcw className="w-4 h-4" /> 重拍
              </button>
              <button
                onClick={() => {
                  // 確認使用這張照片
                  onClose();
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#00f2fe] text-slate-900 font-bold shadow-[0_0_10px_rgba(0,242,254,0.4)] hover:bg-[#00f2fe]/90 active:scale-95 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" /> 確認使用
              </button>
            </div>
          </div>
        ) : (
          // 相機預覽模式
          <div className="relative w-full h-[70vh] max-h-[70vh]">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full rounded-lg object-cover bg-slate-900"
            />

            <div className="absolute inset-0 flex flex-col items-end pb-4 pt-2 space-y-2">
              {/* 右上：切換前後鏡頭 */}
              <div className="absolute top-2 right-2">
                <button
                  onClick={() => {
                    frontCamera = !frontCamera;
                    stopCamera();
                    startCamera();
                  }}
                  disabled={isLoading}
                  className="p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 transition-colors"
                >
                  <RefreshCw className="h-5 w-5 text-white" />
                </button>
              </div>

              {/* 底部：拍照按鈕 */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                <button
                  onClick={handleCapture}
                  disabled={isLoading}
                  className="relative w-14 h-14 rounded-full border-4 border-white hover:border-white/80 transition-colors active:scale-95"
                >
                  <div className="absolute inset-0">
                    <div className="w-full h-full rounded-full bg-white opacity-0 transition-opacity duration-200" />
                  </div>
                  <Camera className="h-6 w-6 text-white" />
                </button>
              </div>

              {/* 左上：關閉按鈕 */}
              <div className="absolute top-2 left-2">
                <button
                  onClick={onClose}
                  className="p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 transition-colors"
                >
                  <X className="h-5 w-5 text-slate-300 hover:text-white" />
                </button>
              </div>
            </div>

            {/* 底部：從相簿選擇 */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <label className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors active:scale-95 cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <Camera className="w-4 h-4" />
                <span className="text-sm font-bold">從相簿選擇</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 全域變數用於傳遞 AI 採用的計數
declare global {
  interface Window {
    aiAdoptedCount?: number;
  }
}