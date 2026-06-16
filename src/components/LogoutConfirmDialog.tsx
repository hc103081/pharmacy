'use client';

import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface LogoutConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function LogoutConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
}: LogoutConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="tech-card p-6 max-w-sm w-full space-y-4 animate-in zoom-in duration-200">
        <div className="flex items-center gap-3 text-[#ff4b5c]">
          <AlertCircle className="w-6 h-6" />
          <h3 className="font-bold text-lg">確定要登出嗎？</h3>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed">
          登出後將返回登入頁，若要繼續使用系統請重新登入。
        </p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-slate-800 text-slate-400 rounded-xl font-medium hover:bg-slate-700 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-[#ff4b5c] text-white rounded-xl font-bold hover:brightness-110 transition-all"
          >
            確認登出
          </button>
        </div>
      </div>
    </div>
  );
}
