'use client';

import React, { useState } from 'react';
import { Sparkles, Loader2, FileText, ChevronRight } from 'lucide-react';
import { AiOrganizeSuggestion } from '@/app/actions/manifests/folders';

interface AiOrganizeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: AiOrganizeSuggestion[];
  totalUnclassified: number;
  onApply: (suggestions: AiOrganizeSuggestion[]) => Promise<void>;
}

export function AiOrganizeDrawer({
  isOpen,
  onClose,
  suggestions,
  totalUnclassified,
  onApply,
}: AiOrganizeDrawerProps) {
  const [applying, setApplying] = useState(false);

  if (!isOpen) return null;

  const handleApply = async () => {
    setApplying(true);
    try {
      await onApply(suggestions);
      onClose();
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0d1d3a] border border-[#00f2fe]/40 rounded-2xl p-5 shadow-[0_0_30px_rgba(0,242,254,0.15)] flex flex-col max-h-[85vh] box-border overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#00f2fe]/10 border border-[#00f2fe]/30 flex items-center justify-center text-[#00f2fe] flex-shrink-0">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-1.5">
                <span>AI 智慧整理清單</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]/30 font-mono">
                  Auto
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                掃描完成：共偵測到 <span className="text-[#00f2fe] font-medium">{totalUnclassified}</span> 份未分類清單
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={applying}
            className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors flex items-center justify-center border border-slate-700 flex-shrink-0 active:scale-95"
            title="關閉"
          >
            ✕
          </button>
        </div>

        {/* Suggestion List */}
        <div className="flex-1 overflow-y-auto py-3 my-2 no-scrollbar space-y-2">
          {suggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-sm gap-2">
              <span className="text-emerald-400 text-xl">✓</span>
              <span>所有清單皆已完成分類歸檔，無待整理項目！</span>
            </div>
          ) : (
            suggestions.map((item) => (
              <div
                key={item.manifestId}
                className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col gap-1.5"
              >
                {/* 清單名稱與來源日期 */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-slate-200 font-medium truncate max-w-[240px]">
                    <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{item.manifestName}</span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {item.sourceDate}
                  </span>
                </div>

                {/* 建議歸檔路徑 */}
                <div className="flex items-center gap-1 text-xs text-[#00f2fe] bg-[#00f2fe]/5 px-2.5 py-1.5 rounded-lg border border-[#00f2fe]/20">
                  <span className="text-slate-400 text-[11px]">目標路徑：</span>
                  <div className="flex items-center gap-1 font-mono font-medium truncate">
                    <span>{item.targetPath[0]}</span>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    <span>{item.targetPath[1]}</span>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    <span>{item.targetPath[2]}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800 flex-wrap gap-2">
          <p className="text-[11px] text-slate-400 min-w-0">
            {suggestions.length > 0 ? '系統將自動建立「年/月/日」目錄結構' : ''}
          </p>

          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <button
              onClick={onClose}
              disabled={applying}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 transition-all whitespace-nowrap flex-shrink-0 active:scale-95"
            >
              取消
            </button>
            {suggestions.length > 0 && (
              <button
                onClick={handleApply}
                disabled={applying}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-[#00f2fe] hover:bg-[#00d0db] text-slate-950 transition-all shadow-[0_0_12px_rgba(0,242,254,0.25)] active:scale-95 disabled:opacity-50 whitespace-nowrap flex-shrink-0 min-w-fit"
              >
                {applying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>AI 歸檔中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>一鍵套用 ({suggestions.length})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
