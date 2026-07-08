'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  variant?: 'danger' | 'warning';
}

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  loading = false,
  title = '確認刪除',
  message = '此操作將永久刪除該清單及其所有藥品項目，<strong className="text-red-400">無法恢復</strong>。請確認後再執行。',
  confirmText = '確定刪除',
  variant = 'danger',
}: DeleteConfirmDialogProps) {
  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const iconBgColor = isDanger ? 'bg-red-500/20' : 'bg-yellow-500/20';
  const iconColor = isDanger ? 'text-red-400' : 'text-yellow-400';
  const buttonBgColor = isDanger ? 'bg-red-500/20' : 'bg-yellow-500/20';
  const buttonTextColor = isDanger ? 'text-red-400' : 'text-yellow-400';
  const buttonBorderColor = isDanger ? 'border-red-500/30' : 'border-yellow-500/30';
  const buttonHoverColor = isDanger ? 'hover:bg-red-500/30' : 'hover:bg-yellow-500/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="tech-card p-6 max-w-md w-full mx-4 animate-in slide-in-from-bottom-4 duration-300 border-red-500/30 shadow-[0_0_30px_rgba(255,75,92,0.15)]">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-full ${iconBgColor} flex items-center justify-center`}>
            <AlertTriangle className={`w-6 h-6 ${iconColor}`} />
          </div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
        </div>

        <p className="text-slate-400 mb-6">
          {message}
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-lg ${buttonBgColor} ${buttonTextColor} border ${buttonBorderColor} ${buttonHoverColor} transition-colors active:scale-95 disabled:opacity-50`}
          >
            {loading ? '執行中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}