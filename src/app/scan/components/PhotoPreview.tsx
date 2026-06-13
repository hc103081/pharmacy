'use client';

import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface PhotoPreviewProps {
  imageUrl: string;
  onClose: () => void;
}

export default function PhotoPreview({ imageUrl, onClose }: PhotoPreviewProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md cursor-zoom-out"
      onClick={onClose}
    >
      <div className="relative max-w-4xl w-full animate-in zoom-in duration-300">
        <img
          src={imageUrl}
          alt="Drug evidence"
          className="w-full h-auto max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/10"
        />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/80 transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}