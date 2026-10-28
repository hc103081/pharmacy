'use client';

import React from 'react';
import { ChevronRight, Home, ArrowLeft, Folder } from 'lucide-react';
import { BreadcrumbItem } from '@/app/actions/manifests/folders';

interface FolderBreadcrumbProps {
  breadcrumbs: BreadcrumbItem[];
  onNavigate: (folderId: string | null) => void;
  currentFolderName?: string;
  isUnclassifiedOnly?: boolean;
  onToggleUnclassified?: () => void;
}

export function FolderBreadcrumb({
  breadcrumbs,
  onNavigate,
  isUnclassifiedOnly,
  onToggleUnclassified,
}: FolderBreadcrumbProps) {
  const currentFolder = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1] : null;
  const parentFolder = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null;

  return (
    <div className="flex items-center justify-between gap-2 px-1 py-1.5 overflow-x-auto no-scrollbar">
      {/* Breadcrumb Path */}
      <div className="flex items-center gap-1.5 text-sm min-w-0 flex-nowrap">
        {/* 返回上一層快捷按鈕 (若在子資料夾中) */}
        {currentFolder && (
          <button
            onClick={() => onNavigate(parentFolder ? parentFolder.id : null)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white transition-all text-xs font-medium border border-slate-700/50 active:scale-95 mr-1"
            title="返回上一層"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#00f2fe]" />
            <span className="hidden sm:inline">上一層</span>
          </button>
        )}

        {/* 根目錄 */}
        <button
          onClick={() => {
            if (isUnclassifiedOnly && onToggleUnclassified) {
              onToggleUnclassified();
            }
            onNavigate(null);
          }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all text-xs sm:text-sm font-medium whitespace-nowrap ${
            !currentFolder && !isUnclassifiedOnly
              ? 'bg-[#00f2fe]/15 text-[#00f2fe] border border-[#00f2fe]/40 shadow-[0_0_10px_rgba(0,242,254,0.15)]'
              : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60'
          }`}
        >
          <Home className="w-3.5 h-3.5" />
          <span>根目錄</span>
        </button>

        {/* 各階層路徑節點 */}
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <React.Fragment key={item.id}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
              <button
                onClick={() => onNavigate(item.id)}
                disabled={isLast}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all text-xs sm:text-sm font-medium whitespace-nowrap ${
                  isLast
                    ? 'bg-[#00f2fe]/15 text-[#00f2fe] border border-[#00f2fe]/40 shadow-[0_0_10px_rgba(0,242,254,0.15)] cursor-default'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60'
                }`}
              >
                <Folder className="w-3.5 h-3.5 opacity-80" />
                <span className="max-w-[120px] sm:max-w-[180px] truncate">{item.name}</span>
              </button>
            </React.Fragment>
          );
        })}

        {/* 若正處於未分類專區檢視 */}
        {isUnclassifiedOnly && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs sm:text-sm font-medium whitespace-nowrap">
              <span>未分類專區</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
