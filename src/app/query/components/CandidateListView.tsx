'use client';

import React from 'react';
import type { DrugAuditRecord } from '@/types/query';

interface CandidateListViewProps {
  records: DrugAuditRecord[];
  onSelectRecord: (record: DrugAuditRecord) => void;
  isLoading: boolean;
  query: string;
}

export function CandidateListView({
  records,
  onSelectRecord,
  isLoading,
  query,
}: CandidateListViewProps) {
  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-4 rounded-2xl bg-[#162a56]/50 border border-slate-800 animate-pulse space-y-2.5"
          >
            <div className="flex justify-between items-center">
              <div className="h-4 bg-slate-700/60 rounded w-28"></div>
              <div className="h-4 bg-slate-700/60 rounded w-16"></div>
            </div>
            <div className="h-5 bg-slate-700/80 rounded w-3/4"></div>
            <div className="h-3 bg-slate-800 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-[#162a56] border border-slate-700 flex items-center justify-center text-slate-400">
          <svg
            className="w-6 h-6 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div className="text-sm font-semibold text-white">查無符合藥品</div>
        <p className="text-xs text-slate-400 max-w-xs mx-auto">
          {query
            ? `找不到包含「${query}」的歷史盤點資料，請檢查品名或條碼是否正確。`
            : '請於上方輸入藥品品名、條碼或點擊相機掃碼。'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-3.5 sm:p-5 space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>共找到 {records.length} 筆相符品項</span>
        <span>點選項目進入跨期審計時間軸</span>
      </div>

      <div className="space-y-3">
        {records.map((drug) => {
          const isError = drug.currentDiscrepancy !== 0;
          return (
            <div
              key={drug.barcode}
              onClick={() => onSelectRecord(drug)}
              className="p-4 rounded-2xl bg-[#162a56] border border-slate-700/80 hover:border-[#00f2fe]/60 cursor-pointer shadow-lg active:scale-[0.98] transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isError ? (
                      <span className="px-2 py-0.5 rounded-md bg-[#ff4b5c]/20 text-[#ff4b5c] text-xs font-mono font-bold border border-[#ff4b5c]/30">
                        {drug.currentDiscrepancy < 0
                          ? `缺 ${Math.abs(drug.currentDiscrepancy)}`
                          : `盈 +${drug.currentDiscrepancy}`}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-mono font-bold border border-emerald-500/30">
                        全數吻合
                      </span>
                    )}

                    {drug.storageLocation && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 text-xs border border-amber-500/30">
                        儲位 {drug.storageLocation}
                      </span>
                    )}

                    <span className="px-2 py-0.5 rounded-md bg-[#00f2fe]/10 text-[#00f2fe] text-xs font-mono border border-[#00f2fe]/20">
                      {drug.barcode}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white truncate group-hover:text-[#00f2fe] transition-colors">
                    {drug.name}
                  </h3>

                  {drug.productCode && (
                    <p className="text-xs text-slate-400 font-mono">
                      健保代碼：{drug.productCode}
                    </p>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[11px] text-slate-400">目前實盤總計</div>
                  <div className="text-base sm:text-lg font-mono font-bold text-white mt-0.5">
                    <span className={isError ? 'text-[#ff4b5c]' : 'text-[#00f2fe]'}>
                      {drug.currentActual}
                    </span>{' '}
                    <span className="text-xs text-slate-400">/ {drug.currentExpected}</span>
                  </div>
                  <div className="text-xs text-[#00f2fe] mt-1 font-bold flex items-center justify-end gap-1">
                    <span>檢視審計</span>
                    <span>&rarr;</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
