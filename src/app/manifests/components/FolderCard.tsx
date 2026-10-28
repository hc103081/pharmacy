'use client';

import React, { useState } from 'react';
import { Folder, Calendar, MoreVertical, Edit2, Trash2, ChevronRight, FileText } from 'lucide-react';
import { ManifestFolder } from '@/types';

interface FolderCardProps {
  folder: ManifestFolder;
  onOpen: (folderId: string) => void;
  onRename?: (folder: ManifestFolder) => void;
  onDelete?: (folder: ManifestFolder) => void;
}

export function FolderCard({ folder, onOpen, onRename, onDelete }: FolderCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const isSystemDate = folder.folder_type === 'system_date';
  const itemCount = folder.item_count ?? 0;
  const subfolderCount = folder.subfolder_count ?? 0;

  return (
    <div
      onClick={() => onOpen(folder.id)}
      className="group relative flex items-center justify-between p-3 sm:p-3.5 rounded-2xl bg-[#162a56]/85 hover:bg-[#1a3266] border border-slate-700/60 hover:border-[#00f2fe]/60 backdrop-blur-md transition-all duration-200 cursor-pointer shadow-lg hover:shadow-[0_0_15px_rgba(0,242,254,0.12)] active:scale-[0.98]"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* 資料夾圖示 */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${
          isSystemDate 
            ? 'bg-[#00f2fe]/10 text-[#00f2fe] border border-[#00f2fe]/30'
            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
        }`}>
          {isSystemDate ? (
            <Calendar className="w-4 h-4" />
          ) : (
            <Folder className="w-4 h-4" />
          )}
        </div>

        {/* 資料夾名稱與數量資訊 */}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-100 text-sm truncate group-hover:text-[#00f2fe] transition-colors">
            {folder.name}
          </h3>
          <div className="flex items-center gap-2.5 text-[11px] text-slate-400 mt-0.5">
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3 text-slate-500" />
              <span>{itemCount} 份清單</span>
            </span>
            {subfolderCount > 0 && (
              <span className="flex items-center gap-1">
                <Folder className="w-3 h-3 text-slate-500" />
                <span>{subfolderCount} 個子目錄</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 右側操作區 */}
      <div className="flex items-center gap-1 ml-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {/* 操作選單按鈕 */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 border border-slate-700/60 hover:text-white hover:bg-slate-700 transition-all active:scale-95"
            title="更多動作"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {menuOpen && (
            <>
              {/* 關閉背景層 */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              {/* 下拉選單 */}
              <div className="absolute right-0 top-full mt-1 w-32 rounded-xl bg-[#0d1d3a] border border-slate-700/80 shadow-2xl z-50 py-1 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                {onRename && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onRename(folder);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors bg-transparent"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-[#00f2fe]" />
                    <span>重新命名</span>
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(folder);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors bg-transparent"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>刪除目錄</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* 箭頭指示 */}
        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-[#00f2fe] group-hover:translate-x-0.5 transition-all" />
      </div>
    </div>
  );
}
