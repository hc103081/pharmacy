'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FolderPlus, Edit2, Loader2 } from 'lucide-react';

interface CreateFolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
  mode?: 'create' | 'rename';
  initialName?: string;
  parentFolderName?: string;
}

export function CreateFolderDialog({
  isOpen,
  onClose,
  onSubmit,
  mode = 'create',
  initialName = '',
  parentFolderName,
}: CreateFolderDialogProps) {
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('請輸入資料夾名稱');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err: any) {
      setError(err.message || '操作失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const isRename = mode === 'rename';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm bg-[#0d1d3a] border border-slate-700/80 rounded-2xl p-5 shadow-2xl flex flex-col box-border overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-[#00f2fe]/10 border border-[#00f2fe]/30 flex items-center justify-center text-[#00f2fe] flex-shrink-0">
            {isRename ? <Edit2 className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-white truncate">
              {isRename ? '重新命名資料夾' : '新增自訂資料夾'}
            </h3>
            {parentFolderName && !isRename && (
              <p className="text-xs text-slate-400 truncate">建立於：{parentFolderName}</p>
            )}
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4 w-full min-w-0 box-border">
          <div className="w-full min-w-0 box-border">
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              資料夾名稱
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="例如：10月份盤點、主管複查..."
              disabled={submitting}
              className="w-full min-w-0 max-w-full box-border block px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#00f2fe] focus:shadow-[0_0_15px_rgba(0,242,254,0.5)] transition-all"
            />
            {error && (
              <p className="text-xs text-red-400 mt-1.5 break-words">{error}</p>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 transition-all active:scale-95"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-[#00f2fe] hover:bg-[#00d0db] text-slate-950 transition-all shadow-[0_0_15px_rgba(0,242,254,0.3)] active:scale-95 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>處理中...</span>
                </>
              ) : (
                <span>{isRename ? '儲存名稱' : '建立'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
