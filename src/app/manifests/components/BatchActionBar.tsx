'use client';

import React from 'react';
import { FolderInput, Archive, RotateCcw, X, CheckSquare, Square } from 'lucide-react';

interface BatchActionBarProps {
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  onToggleSelectAll: () => void;
  onMoveSelected: () => void;
  onArchiveSelected: () => void;
  onRestoreSelected: () => void;
  onExitBatchMode: () => void;
  hasArchivedSelected: boolean;
  hasActiveSelected: boolean;
}

export function BatchActionBar({
  selectedCount,
  totalCount,
  isAllSelected,
  onToggleSelectAll,
  onMoveSelected,
  onArchiveSelected,
  onRestoreSelected,
  onExitBatchMode,
  hasArchivedSelected,
  hasActiveSelected,
}: BatchActionBarProps) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-xl z-40 animate-in slide-in-from-bottom-5 duration-200">
      <div className="bg-[#0d1d3a]/95 backdrop-blur-xl border border-[#00f2fe]/40 rounded-2xl p-3 shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex items-center justify-between gap-2">
        {/* 左側選取統計與全選按鈕 */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onToggleSelectAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 transition-colors active:scale-95 whitespace-nowrap"
          >
            {isAllSelected ? (
              <CheckSquare className="w-3.5 h-3.5 text-[#00f2fe]" />
            ) : (
              <Square className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>{isAllSelected ? '取消全選' : '全選'}</span>
          </button>

          <span className="text-xs font-semibold text-white whitespace-nowrap">
            已選取 <span className="text-[#00f2fe] font-mono">{selectedCount}</span> 份
          </span>
        </div>

        {/* 右側操作按鈕群 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* 移動至目錄 */}
          <button
            type="button"
            onClick={onMoveSelected}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 text-xs font-medium transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
            title="移動所選清單至目錄"
          >
            <FolderInput className="w-3.5 h-3.5 text-[#00f2fe]" />
            <span className="hidden sm:inline">移動目錄</span>
            <span className="sm:hidden">移動</span>
          </button>

          {/* 批次封存（若選取的清單中包含在辦清單） */}
          {hasActiveSelected && (
            <button
              type="button"
              onClick={onArchiveSelected}
              disabled={selectedCount === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-medium transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
              title="將所選在辦清單批次封存"
            >
              <Archive className="w-3.5 h-3.5 text-amber-400" />
              <span>封存</span>
            </button>
          )}

          {/* 批次還原（若選取的清單中包含封存清單） */}
          {hasArchivedSelected && (
            <button
              type="button"
              onClick={onRestoreSelected}
              disabled={selectedCount === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
              title="將所選封存清單批次還原"
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
              <span>還原</span>
            </button>
          )}

          {/* 退出多選 */}
          <button
            type="button"
            onClick={onExitBatchMode}
            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/70 transition-colors"
            title="退出批次選取"
            aria-label="退出批次選取"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
