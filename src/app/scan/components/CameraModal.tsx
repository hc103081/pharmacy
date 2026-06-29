'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Camera as CameraIcon, RefreshCw } from 'lucide-react';

interface CameraModalProps {
 isOpen: boolean;
 onClose: () => void;
 onCapture: (file: File) => Promise<void>; // Callback to handle the captured file
 onError: (message: string) => void; // Callback for errors
 onCheckingSupport: (isSupported: boolean | null) => void; // Callback to update support status
 frontCamera?: boolean; // Initial camera preference
}

export default function CameraModal({
 isOpen,
 onClose,
 onCapture,
 onError,
 onCheckingSupport,
 frontCamera: frontCameraProp = false
}: CameraModalProps) {
 const videoRef = useRef<HTMLVideoElement>(null);
 const streamRef = useRef<MediaStream | null>(null);
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [hasUserMedia, setHasUserMedia] = useState<boolean | null>(null); // null = checking, true = supported, false = not supported
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
  }, []);

  // Handle video stream
  useEffect(() => {
    if (!isOpen || hasUserMedia === false) return;

    // Start camera when modal opens
    const startCamera = async () => {
      try {
        const constraints = {
          video: {
            facingMode: frontCamera ? 'user' : 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
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

    // Cleanup on unmount or when modal closes
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, hasUserMedia, frontCamera]);

  // Handle capture when video is ready
  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !streamRef.current) return;
    
    setIsLoading(true);
    setError(null);
    try {
      // Create canvas and capture frame
      const canvas = document.createElement('canvas');
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('無法獲取畫布上下文');
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setIsLoading(false);
          setError('無法處理圖像');
          return;
        }
        
        // Create file from blob
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        try {
          await onCapture(file);
        } catch (captureError: any) {
          setIsLoading(false);
          setError(`處理失敗: ${captureError.message}`);
        }
      });
    } catch (err: any) {
      setIsLoading(false);
      setError(`拍照失敗: ${err.message}`);
    }
  }, [isOpen, onCapture]);

  // Handle key presses
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault(); // Prevent scrolling
        handleCapture();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleCapture]);

  // Render loading state
  if (isLoading && hasUserMedia !== false) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-primary border-r-transparent rounded-full animate-spin"></div>
          <p className="mt-2 text-sm text-white">處理中...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error && hasUserMedia !== false) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">相機錯誤</h3>
            <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
          <button
            onClick={onClose}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
          >
            關閉
          </button>
        </div>
      </div>
    );
  }

  // If getUserMedia is not supported, show fallback message
  if (hasUserMedia === false) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">相機功能不可用</h3>
            <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            您的設備或瀏覽器不支援進階相機功能。將使用傳統檔案上傳方式。
          </p>
          <button
            onClick={onClose}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
          >
            關閉並使用傳統方式
          </button>
        </div>
      </div>
    );
  }

  // If still checking support, show loading
  if (hasUserMedia === null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-primary border-r-transparent rounded-full animate-spin"></div>
          <p className="mt-2 text-sm text-white">檢查相機權限...</p>
        </div>
      </div>
    );
  }

  // Main camera interface
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="relative w-full h-full max-w-[500px] max-h-[600px]">
        {/* Video preview */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full rounded-lg object-cover bg-black"
        />
        
        {/* Overlay controls */}
        <div className="absolute inset-0 flex flex-col items-end pb-4 pt-2 space-y-2">
          {/* Top right: Camera switch */}
          <div className="absolute top-2 right-2">
            <button
              onClick={() => setFrontCamera(!frontCamera)}
              disabled={isLoading}
              className={`p-2 rounded-full bg-white dark:bg-gray-800/50 hover:bg-white/200 ${isLoading ? 'opacity-50' : ''}`}
            >
              <RefreshCw className={`
                h-5 w-5 
                text-white dark:text-gray-100
                ${isLoading ? 'animate-spin' : ''}
              `} />
            </button>
          </div>
          
          {/* Bottom: Capture button */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <button
              onClick={handleCapture}
              disabled={isLoading}
              className={`relative w-14 h-14 rounded-full border-4 border-white dark:border-gray-200 hover:border-white/80 ${isLoading ? 'opacity-70' : ''}`}
            >
              {/* Inner circle for feedback */}
              <div className="absolute inset-0">
                <div className={`w-full h-full rounded-full bg-white dark:bg-gray-200 opacity-0 transition-opacity duration-200 ${isLoading ? 'opacity-60' : ''}`}>
                </div>
              </div>
              <CameraIcon className="h-6 w-6 text-white dark:text-gray-800" />
            </button>
          </div>
          
          {/* Top left: Close button */}
          <div className="absolute top-2 left-2">
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white dark:bg-gray-800/50 hover:bg-white/200"
            >
              <X className="h-4 w-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}