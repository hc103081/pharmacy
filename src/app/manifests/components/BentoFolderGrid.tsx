'use client';

import React, { useRef, useCallback } from 'react';
import { Calendar, Folder, Plus, ChevronRight, FileText, Sparkles, FolderPlus, Loader2 } from 'lucide-react';
import { ManifestFolder } from '@/types';

interface BentoFolderGridProps {
  folders: ManifestFolder[];
  onOpenFolder: (folderId: string) => void;
  onActionFolder: (folder: ManifestFolder) => void;
  onCreateFolder: () => void;
  onAiOrganize?: () => void;
  aiScanning?: boolean;
  unclassifiedCount?: number;
  currentFolderName?: string;
}

export function BentoFolderGrid({
  folders,
  onOpenFolder,
  onActionFolder,
  onCreateFolder,
  onAiOrganize,
  aiScanning = false,
  unclassifiedCount = 0,
  currentFolderName,
}: BentoFolderGridProps) {
  // 長按計時器（手機端 500ms 觸發管理）
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef<boolean>(false);

  const handleTouchStart = useCallback(
    (folder: ManifestFolder) => {
      isLongPressRef.current = false;
      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(40);
        }
        onActionFolder(folder);
      }, 500);
    },
    [onActionFolder]
  );

  const handleTouchEnd = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleTouchCancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 統一由點擊事件觸發導航，杜絕 touch 與 click 穿透連跳兩次
  const handleClick = useCallback(
    (folderId: string) => {
      if (isLongPressRef.current) {
        isLongPressRef.current = false;
        return;
      }
      onOpenFolder(folderId);
    },
    [onOpenFolder]
  );

  const totalManifestCount = folders.reduce((sum, f) => sum + (f.item_count || 0), 0);

  return (
    <div className="space-y-3 pt-1">
      {/* 頂部引導、統計與快捷操作列 (整合取代舊式標題列) */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-[#00f2fe] animate-pulse flex-shrink-0" />
          <h2 className="text-xs font-bold text-slate-200 tracking-wider truncate">
            {currentFolderName ? `${currentFolderName} 目錄導覽` : '目錄導覽'} ({folders.length})
          </h2>
          <span className="text-[11px] text-slate-400 font-mono hidden xs:inline">
            • 共 {totalManifestCount} 份清單
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onAiOrganize && (
            <button
              type="button"
              onClick={onAiOrganize}
              disabled={aiScanning}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#00f2fe] bg-[#00f2fe]/10 hover:bg-[#00f2fe]/20 px-2.5 py-1 rounded-lg border border-[#00f2fe]/30 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
            >
              {aiScanning ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              <span>AI 整理</span>
              {unclassifiedCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#00f2fe] text-slate-950 text-[9px] font-bold">
                  {unclassifiedCount}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onCreateFolder}
            className="flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-[#00f2fe] bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-700/60 transition-all active:scale-95 whitespace-nowrap"
          >
            <FolderPlus className="w-3 h-3 text-[#00f2fe]" />
            <span>新增目錄</span>
          </button>
        </div>
      </div>

      {/* 雙欄 Bento Grid 卡片矩陣 */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {folders.map((folder, index) => {
          const isSystemDate = folder.folder_type === 'system_date';
          const itemCount = folder.item_count ?? 0;
          const subCount = folder.subfolder_count ?? 0;
          const isLatest = index === 0;

          // 判斷 年、月、日 階層語意標籤
          let categoryTag: string | null = null;
          let isYear = false;
          let isMonth = false;
          let isDay = false;

          const yearMatch = folder.name.match(/^(\d{4})年?$/);
          const monthMatch = folder.name.match(/^(\d{1,2})月$/);
          const dayMatch = folder.name.match(/^(\d{1,2})(?:日|號)$/);

          if (yearMatch) {
            isYear = true;
            categoryTag = isLatest ? '最新年度' : '年度';
          } else if (monthMatch) {
            isMonth = true;
            const m = parseInt(monthMatch[1], 10);
            const quarter = m >= 10 ? 'Q4' : m >= 7 ? 'Q3' : m >= 4 ? 'Q2' : 'Q1';
            categoryTag = isLatest ? `${quarter} 最新` : quarter;
          } else if (dayMatch) {
            isDay = true;
            categoryTag = isLatest ? '最新盤點' : '日盤點';
          }

          return (
            <div
              key={folder.id}
              role="button"
              tabIndex={0}
              onClick={() => handleClick(folder.id)}
              onTouchStart={() => handleTouchStart(folder)}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchCancel}
              onContextMenu={(e) => {
                e.preventDefault();
                onActionFolder(folder);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClick(folder.id);
                }
              }}
              className="group relative select-none p-3.5 sm:p-4 rounded-2xl bg-[#162a56]/80 hover:bg-[#1f3a75] border border-[#233d7a] hover:border-[#00f2fe] transition-all duration-200 cursor-pointer shadow-lg hover:shadow-[0_0_15px_rgba(0,242,254,0.18)] active:scale-[0.97] flex flex-col justify-between min-h-[115px] sm:min-h-[125px]"
            >
              {/* 卡片頂部：類型圖示 / 語意標籤 與 進入箭頭 */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`p-1 rounded-md text-xs flex items-center justify-center ${
                      isSystemDate || isYear || isMonth || isDay
                        ? 'bg-[#00f2fe]/10 text-[#00f2fe] border border-[#00f2fe]/30'
                        : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                    }`}
                  >
                    {isSystemDate || isYear || isMonth || isDay ? (
                      <Calendar className="w-3.5 h-3.5" />
                    ) : (
                      <Folder className="w-3.5 h-3.5" />
                    )}
                  </span>

                  {categoryTag && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md border whitespace-nowrap font-bold ${
                        isLatest
                          ? 'bg-[#00f2fe]/15 text-[#00f2fe] border-[#00f2fe]/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {categoryTag}
                    </span>
                  )}
                </div>

                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-[#00f2fe] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </div>

              {/* 卡片主體：醒目大標題 + 清單數量徽章 */}
              <div className="my-auto py-1 flex items-center justify-between gap-2">
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight truncate group-hover:text-[#00f2fe] transition-colors">
                  {folder.name}
                </h3>
                <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-[#00f2fe]/15 text-[#00f2fe] border border-[#00f2fe]/40 font-mono font-bold shadow-[0_0_8px_rgba(0,242,254,0.15)]">
                  {itemCount}
                </span>
              </div>

              {/* 卡片底部：清單份數徽章與子目錄資訊 */}
              <div className="mt-2 pt-2 border-t border-[#1e3468] flex items-center justify-between text-xs">
                <span className="text-slate-400 text-[11px] flex items-center gap-1">
                  <FileText className="w-3 h-3 text-slate-500" />
                  <span>
                    {subCount > 0
                      ? isYear
                        ? `${subCount} 個月份`
                        : `${subCount} 個目錄`
                      : '清單數目'}
                  </span>
                </span>
                <span className="font-mono font-semibold text-slate-300 text-xs">
                  {itemCount} 份
                </span>
              </div>
            </div>
          );
        })}

        {/* 快捷操作卡片：新增目錄 */}
        <div
          role="button"
          tabIndex={0}
          onClick={onCreateFolder}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onCreateFolder();
            }
          }}
          className="group p-3.5 sm:p-4 rounded-2xl border-2 border-dashed border-[#233d7a] hover:border-[#00f2fe]/60 bg-[#0a1936]/40 hover:bg-[#0a1936]/80 flex flex-col items-center justify-center text-center cursor-pointer transition-all min-h-[115px] sm:min-h-[125px] active:scale-95"
        >
          <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 group-hover:text-[#00f2fe] group-hover:bg-[#00f2fe]/10 border border-slate-700/60 group-hover:border-[#00f2fe]/30 flex items-center justify-center transition-colors mb-1.5">
            <Plus className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
            新增子目錄
          </span>
          <span className="text-[10px] text-slate-500 mt-0.5">自訂分類或手動歸納</span>
        </div>
      </div>
    </div>
  );
}
