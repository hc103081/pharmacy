'use client';

import React from 'react';
import { ManifestFolder } from '@/types';
import {
  Folder,
  FolderOpen,
  Edit2,
  Trash2,
  X,
  Calendar,
  Layers,
} from 'lucide-react';

interface FolderActionModalProps {
  isOpen: boolean;
  folder: ManifestFolder | null;
  onClose: () => void;
  onRename: (folder: ManifestFolder) => void;
  onDelete: (folder: ManifestFolder) => void;
  onOpenFolder?: (folderId: string) => void;
  isCurrentFolder?: boolean;
}

export function FolderActionModal({
  isOpen,
  folder,
  onClose,
  onRename,
  onDelete,
  onOpenFolder,
  isCurrentFolder = false,
}: FolderActionModalProps) {
  if (!isOpen || !folder) return null;

  const isSystemDate = folder.folder_type === 'system_date';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-sm bg-[#0d1d3a] border border-slate-700/80 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl flex flex-col box-border overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 手機頂端下滑拖動指示條 */}
        <div className="w-10 h-1 bg-slate-700/70 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#00f2fe]/10 border border-[#00f2fe]/30 flex items-center justify-center text-[#00f2fe] flex-shrink-0">
              {isSystemDate ? <Calendar className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white truncate">
                {folder.name}
              </h3>
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <Layers className="w-3 h-3 text-[#00f2fe]" />
                <span>內含 {folder.item_count ?? 0} 份清單</span>
                {isCurrentFolder && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#00f2fe]/20 text-[#00f2fe] font-medium ml-1">
                    當前所在目錄
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Buttons List */}
        <div className="mt-4 space-y-2">
          {/* 1. 進入目錄 (若不是當前所在目錄) */}
          {!isCurrentFolder && onOpenFolder && (
            <button
              onClick={() => {
                onClose();
                onOpenFolder(folder.id);
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white border border-slate-700/80 hover:border-[#00f2fe]/50 font-medium text-sm transition-all active:scale-95"
            >
              <FolderOpen className="w-4 h-4 text-[#00f2fe]" />
              <span>進入此目錄</span>
            </button>
          )}

          {/* 2. 重新命名 */}
          <button
            onClick={() => {
              onClose();
              onRename(folder);
            }}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white border border-slate-700/80 hover:border-[#00f2fe]/50 font-medium text-sm transition-all active:scale-95"
          >
            <Edit2 className="w-4 h-4 text-[#00f2fe]" />
            <span>重新命名目錄</span>
          </button>

          {/* 3. 刪除目錄 */}
          <button
            onClick={() => {
              onClose();
              onDelete(folder);
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-medium text-sm transition-all active:scale-95 group"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>刪除此目錄</span>
            </div>
            <span className="text-[11px] text-red-400/70 font-normal">
              清單自動移至未分類
            </span>
          </button>
        </div>

        {/* Cancel Button */}
        <div className="mt-4 pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
