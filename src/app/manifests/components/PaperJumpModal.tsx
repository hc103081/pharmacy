'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Manifest } from '@/types';
import { calculatePaperPages } from '@/lib/folderUtils';
import { FileText, X, ChevronRight, ExternalLink } from 'lucide-react';
import { useNavigationProgress } from '@/components/navigation/NavigationProgress';

interface PaperJumpModalProps {
  isOpen: boolean;
  manifest: Manifest | null;
  onClose: () => void;
}

export function PaperJumpModal({
  isOpen,
  manifest,
  onClose,
}: PaperJumpModalProps) {
  const router = useRouter();
  const { startNavigation } = useNavigationProgress();

  if (!isOpen || !manifest) return null;

  const { totalPages, pageRanges } = calculatePaperPages(manifest.total_items);

  const handleSelectPage = (page: number) => {
    startNavigation(`正在前往「${manifest.name}」第 ${page} 頁...`);
    onClose();
    router.push(`/scan?manifestId=${manifest.id}&page=${page}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-md bg-[#0d1d3a] border border-slate-700/80 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl flex flex-col box-border max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 手機頂端下滑拖動指示條 */}
        <div className="w-10 h-1 bg-slate-700/70 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#00f2fe]/10 border border-[#00f2fe]/30 flex items-center justify-center text-[#00f2fe] flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white truncate">
                紙本分頁對位直達
              </h3>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {manifest.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 說明區塊 */}
        <div className="py-2.5 px-3 my-3 rounded-xl bg-slate-900/70 border border-slate-800 text-xs text-slate-300 flex items-center justify-between flex-shrink-0">
          <span>實體紙本清單（每頁 44 項）</span>
          <span className="font-mono text-[#00f2fe] font-semibold">
            共 {totalPages} 頁 / {manifest.total_items} 項
          </span>
        </div>

        {/* 頁面清單列表 */}
        <div className="overflow-y-auto space-y-2 pr-1 flex-1 py-1">
          {totalPages === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs">
              此清單暫無藥品項目
            </div>
          ) : (
            pageRanges.map((range) => (
              <button
                key={range.page}
                type="button"
                onClick={() => handleSelectPage(range.page)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-800/80 hover:bg-[#162a56] border border-slate-700/70 hover:border-[#00f2fe]/50 transition-all text-left group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-xs font-mono font-bold text-[#00f2fe] group-hover:border-[#00f2fe]/40">
                    P.{range.page}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-200 group-hover:text-white">
                      第 {range.page} 頁
                    </div>
                    <div className="text-xs text-slate-400">
                      項目編號 {range.start} ~ {range.end}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-400 group-hover:text-[#00f2fe] font-medium">
                  <span>直達</span>
                  <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
