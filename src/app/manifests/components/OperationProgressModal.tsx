'use client';

import React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface OperationProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: 'archiving' | 'restoring' | 'completed' | 'error';
  message: string;
  progress?: number;
}

export function OperationProgressModal({
  isOpen,
  onClose,
  status,
  message,
  progress,
}: OperationProgressModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="tech-card p-6 max-w-md w-full mx-4 animate-in slide-in-from-bottom-4 duration-300 border-[#00f2fe]/50 shadow-[0_0_30px_rgba(0,242,254,0.15)]">
        <div className="flex items-center gap-3 mb-4">
          {status === 'completed' ? (
            <div className="w-12 h-12 rounded-full bg-green-400/20 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-400 animate-check-pop" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#00f2fe]/20 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-[#00f2fe] animate-spin drop-shadow-[0_0_8px_rgba(0,242,254,0.6)]" />
            </div>
          )}
          <h3 className="text-lg font-bold text-white">
            {status === 'completed'
              ? '操作成功'
              : status === 'error'
              ? '操作失敗'
              : status === 'archiving'
              ? '封存中'
              : '還原中'}
          </h3>
        </div>

        <p className={`mb-6 leading-relaxed ${
          status === 'completed' ? 'text-white' :
          status === 'error' ? 'text-red-400' :
          'text-slate-400'
        }`}>
          {message}
        </p>

        {progress !== undefined && status !== 'completed' && status !== 'error' && (
          <div className="mb-6">
            <div className="w-full bg-slate-700/30 rounded-full h-2.5 overflow-hidden relative">
              <div
                className="bg-gradient-to-r from-[#00f2fe] to-blue-500 h-2.5 rounded-full transition-all duration-500 relative shadow-[0_0_10px_rgba(0,242,254,0.5)]"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-1 flex justify-between">
              <span>處理進度</span>
              <span>{progress}% 完成</span>
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors active:scale-95"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}