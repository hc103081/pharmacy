'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Camera as CameraIcon, RefreshCw } from 'lucide-react';

interface CameraModalSimpleProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => Promise<void>;
  onError: (message: string) => void;
  onCheckingSupport: (isSupported: boolean | null) => void;
  frontCamera?: boolean;
}

export default function CameraModalSimple({
  isOpen,
  onClose,
  onCapture,
  onError,
  onCheckingSupport,
  frontCamera: frontCameraProp = false,
}: CameraModalSimpleProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUserMedia, setHasUserMedia] = useState<boolean | null>(null);
  const [frontCamera, setFrontCamera] = useState(frontCameraProp);

  // Check getUserMedia support on mount
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      setHasUserMedia(true);
      onCheckingSupport(true);
    } else {
      setHasUserMedia(false);
      onCheckingSupport(false);
    }
  }, [onCheckingSupport]);

  // Handle video stream
  useEffect(() => {
    if (!isOpen || hasUserMedia === false) return;

    const startCamera = async () => {
      try {
        const constraints = {
          video: {
            facingMode: frontCamera ? 'user' : 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setError(null);
      } catch (err) {
        console.error('Camera access error:', err);
        setError('無法訪問相機，請檢查權限');
        setHasUserMedia(false);
        onCheckingSupport(false);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [isOpen, hasUserMedia, frontCamera, onCheckingSupport]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !streamRef.current) {
      onError('相機未就緒');
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

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
      });

      if (!blob) throw new Error('無法處理圖像');

      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });

      // Stop camera stream before calling onCapture
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      await onCapture(file);
      onClose();
    } catch (err: any) {
      setError(`拍照失敗: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [onError, onCapture, onClose]);

  // Handle key presses
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleCapture();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleCapture]);

  // Loading state
  if (isLoading && hasUserMedia !== false) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#00f2fe] border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-300">處理中...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && hasUserMedia !== false) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-[#162a56] border border-blue-500/30 rounded-xl p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">相機錯誤</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-slate-300 mb-4">{error}</p>
          <button onClick={onClose} className="w-full bg-[#00f2fe] text-slate-900 font-bold py-2 px-4 rounded-xl hover:bg-[#00f2fe]/90 active:scale-95 transition-all">
            關閉
          </button>
        </div>
      </div>
    );
  }

  // Camera not supported
  if (hasUserMedia === false) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-[#162a56] border border-blue-500/30 rounded-xl p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">相機功能不可用</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-slate-300 mb-4">
            您的設備或瀏覽器不支援進階相機功能。將使用傳統檔案上傳方式。
          </p>
          <button onClick={onClose} className="w-full bg-[#00f2fe] text-slate-900 font-bold py-2 px-4 rounded-xl hover:bg-[#00f2fe]/90 active:scale-95 transition-all">
            關閉並使用傳統方式
          </button>
        </div>
      </div>
    );
  }

  // Checking support
  if (hasUserMedia === null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#00f2fe] border-t-transparent rounded-full animate-spin" />
          <p className="mt-2 text-slate-300">檢查相機權限...</p>
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-slate-900/80 rounded-full text-slate-300 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Camera preview mode */}
        <div className="relative w-full h-[70vh] max-h-[70vh]">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full rounded-lg object-cover bg-slate-900"
          />

          <div className="absolute inset-0 flex flex-col items-end pb-4 pt-2 space-y-2">
            {/* Top right: Switch camera */}
            <div className="absolute top-2 right-2">
              <button
                onClick={() => {
                  setFrontCamera((prev) => !prev);
                }}
                disabled={isLoading}
                className="p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <RefreshCw className="h-5 w-5 text-white" />
              </button>
            </div>

            {/* Bottom: Capture button */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <button
                onClick={handleCapture}
                disabled={isLoading}
                className="relative w-14 h-14 rounded-full border-4 border-white hover:border-white/80 transition-colors active:scale-95 disabled:opacity-70"
              >
                <div className="absolute inset-0">
                  <div className="w-full h-full rounded-full bg-white opacity-0 transition-opacity duration-200" />
                </div>
                <CameraIcon className="h-6 w-6 text-white" />
              </button>
            </div>

            {/* Top left: Close button */}
            <div className="absolute top-2 left-2">
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5 text-slate-300 hover:text-white" />
              </button>
            </div>
          </div>

          {/* Bottom: Select from gallery */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <label className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors active:scale-95 cursor-pointer">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileSelect(file);
                  }
                }}
                className="hidden"
              />
              <CameraIcon className="w-4 h-4" />
              <span className="text-sm font-bold">從相簿選擇</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function handleFileSelect(file: File) {
  // This is a placeholder - the actual file selection handling
  // will be done via the onCapture callback from parent
  const url = URL.createObjectURL(file);
  // The parent component handles the actual capture via onCapture prop
}