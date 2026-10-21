'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ currentPage, totalPages, onPageChange, className = '' }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className={`flex items-center justify-center gap-1 ${className}`} aria-label="分頁導航">
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="flex items-center justify-center gap-1 px-3 py-1.5 bg-slate-800/50 text-slate-300 rounded-lg border border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-slate-700 active:scale-95"
        aria-label="上一頁"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-1">
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let pageNum: number;
          if (totalPages <= 5) {
            pageNum = i + 1;
          } else if (currentPage <= 3) {
            pageNum = i + 1;
          } else if (currentPage >= totalPages - 2) {
            pageNum = totalPages - 4 + i;
          } else {
            pageNum = currentPage - 2 + i;
          }
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all font-medium ${
                pageNum === currentPage
                  ? 'bg-[#00f2fe] text-slate-950 shadow-[0_0_10px_rgba(0,242,254,0.5)]'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700'
              }`}
              aria-label={`第 ${pageNum} 頁`}
              aria-current={pageNum === currentPage ? 'page' : undefined}
            >
              {pageNum}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="flex items-center justify-center gap-1 px-3 py-1.5 bg-slate-800/50 text-slate-300 rounded-lg border border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-slate-700 active:scale-95"
        aria-label="下一頁"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}