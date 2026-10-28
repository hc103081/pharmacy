'use client';

import React, { useState } from 'react';
import type { DrugAuditRecord, AuditNode } from '@/types/query';

interface DrugAuditTreeProps {
  record: DrugAuditRecord;
  onBack: () => void;
  onOpenPhotoModal: (node: AuditNode) => void;
  onJumpToScan: (node: AuditNode) => void;
}

export function DrugAuditTree({
  record,
  onBack,
  onOpenPhotoModal,
  onJumpToScan,
}: DrugAuditTreeProps) {
  // Default first month open, others collapsed
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});

  const toggleMonth = (monthKey: string) => {
    setCollapsedMonths((prev) => ({
      ...prev,
      [monthKey]: !prev[monthKey],
    }));
  };

  const isCurrentDiscrepant = record.currentDiscrepancy !== 0;

  return (
    <div className="space-y-4 pb-12">
      {/* ========================================== */}
      {/* TOP STICKY DRUG IDENTITY BAR               */}
      {/* ========================================== */}
      <div className="p-4 sm:p-5 bg-slate-900/95 border-b border-slate-800 sticky top-0 z-20 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-[#00f2fe] hover:underline font-semibold"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            返回藥品候選列表
          </button>

          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            共 {record.allHistory.length} 次盤點歷程
          </span>
        </div>

        <div className="mt-2.5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base sm:text-lg font-bold text-white truncate">
              {record.name}
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded-md text-xs font-mono font-bold shrink-0 ${
                isCurrentDiscrepant
                  ? 'bg-[#ff4b5c]/20 text-[#ff4b5c] border border-[#ff4b5c]/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {isCurrentDiscrepant
                ? record.currentDiscrepancy < 0
                  ? `總缺 ${Math.abs(record.currentDiscrepancy)} 盒`
                  : `總盈 +${record.currentDiscrepancy} 盒`
                : '帳實全數相符'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
            <span className="font-mono text-[#00f2fe]">{record.barcode}</span>
            {record.storageLocation && (
              <>
                <span>•</span>
                <span className="text-amber-300">儲位 {record.storageLocation}</span>
              </>
            )}
            {record.productCode && (
              <>
                <span>•</span>
                <span>健保碼 {record.productCode}</span>
              </>
            )}
            <span>•</span>
            <span>
              總應收：
              <span className="font-mono text-white">{record.currentExpected}</span>
            </span>
            <span>•</span>
            <span>
              總實盤：
              <span className="font-mono text-white">{record.currentActual}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* MONTHLY ACCORDION GROUPS                  */}
      {/* ========================================== */}
      <div className="p-3.5 sm:p-5 space-y-4">
        {record.monthlyGroups.map((group, index) => {
          // By default: index 0 (latest month) is open, unless explicitly toggled
          const isCollapsed =
            collapsedMonths[group.monthKey] !== undefined
              ? collapsedMonths[group.monthKey]
              : index !== 0;

          return (
            <div
              key={group.monthKey}
              className="rounded-2xl bg-[#162a56] border border-slate-700/80 overflow-hidden shadow-xl"
            >
              {/* Accordion Header */}
              <div
                onClick={() => toggleMonth(group.monthKey)}
                className="px-4 py-3.5 bg-slate-900/90 hover:bg-slate-900 flex items-center justify-between cursor-pointer border-b border-slate-800 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[#00f2fe] text-xs transition-transform duration-200">
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                  <span className="font-bold text-white text-sm sm:text-base">
                    {group.monthLabel}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    {group.totalAudits} 次盤點
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
                    <span>相符率</span>
                    <div className="w-16 bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          group.matchRate === 100 ? 'bg-emerald-400' : 'bg-amber-400'
                        }`}
                        style={{ width: `${group.matchRate}%` }}
                      ></div>
                    </div>
                    <span className="font-mono text-slate-200">{group.matchRate}%</span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                      group.netDiscrepancy === 0
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-[#ff4b5c]/20 text-[#ff4b5c]'
                    }`}
                  >
                    {group.netDiscrepancy === 0
                      ? '0 差異'
                      : `${group.netDiscrepancy > 0 ? '+' : ''}${group.netDiscrepancy} 盒`}
                  </span>
                </div>
              </div>

              {/* Accordion Body (Nodes) */}
              {!isCollapsed && (
                <div className="p-3.5 sm:p-4 space-y-3.5 bg-[#07142b]/60">
                  {group.nodes.map((node, nodeIdx) => {
                    const isError = node.discrepancy !== 0;
                    const dateFormatted = new Date(node.countedAt).toLocaleString(
                      'zh-TW',
                      {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      }
                    );

                    return (
                      <div
                        key={`${node.manifestId}-${node.pageNumber}-${node.itemOrder}-${nodeIdx}`}
                        className={`p-3.5 sm:p-4 rounded-2xl bg-[#162a56] border space-y-3 shadow-md ${
                          isError ? 'border-[#ff4b5c]/50' : 'border-slate-700/80'
                        }`}
                      >
                        {/* 1. Node Header */}
                        <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-700/70">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  isError ? 'bg-[#ff4b5c] animate-pulse' : 'bg-emerald-400'
                                }`}
                              ></span>
                              <span className="font-mono text-xs font-bold text-white">
                                {dateFormatted}
                              </span>
                              <span className="text-xs text-slate-300 truncate max-w-[140px] sm:max-w-none">
                                {node.manifestName}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#00f2fe] font-mono mt-0.5">
                              清單 #{node.manifestId.slice(0, 8)}（頁碼：P.{node.pageNumber} / 序號：#{node.itemOrder}）
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            {isError ? (
                              <span className="px-2 py-0.5 rounded bg-[#ff4b5c] text-white font-mono font-bold text-xs">
                                盤虧 {node.discrepancy}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs border border-emerald-500/30">
                                吻合 (OK)
                              </span>
                            )}
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              盤點人：{node.counterName}
                            </div>
                          </div>
                        </div>

                        {/* 2. Core Metrics Strip: Big Numbers Highlight */}
                        <div className="bg-slate-950/90 rounded-xl p-3 border border-slate-800 flex items-center justify-around text-center">
                          <div>
                            <div className="text-[11px] text-slate-400">紙本應收</div>
                            <div className="text-base sm:text-lg font-mono font-bold text-slate-200 mt-0.5">
                              {node.expectedQuantity}
                            </div>
                          </div>
                          <div className="text-slate-600 text-lg font-bold">&rarr;</div>
                          <div>
                            <div
                              className={`text-[11px] font-medium ${
                                isError ? 'text-[#ff4b5c]' : 'text-emerald-400'
                              }`}
                            >
                              實際盤點
                            </div>
                            <div
                              className={`text-xl sm:text-2xl font-mono font-black mt-0.5 ${
                                isError ? 'text-[#ff4b5c]' : 'text-emerald-400'
                              }`}
                            >
                              {node.actualQuantity}
                            </div>
                          </div>
                          <div className="h-8 w-px bg-slate-800"></div>
                          <div>
                            <div className="text-[11px] text-slate-400">單次差異</div>
                            <div
                              className={`text-base sm:text-lg font-mono font-bold mt-0.5 ${
                                isError ? 'text-[#ff4b5c]' : 'text-emerald-400'
                              }`}
                            >
                              {node.discrepancy === 0
                                ? '0'
                                : `${node.discrepancy > 0 ? '+' : ''}${node.discrepancy}`}
                            </div>
                          </div>
                        </div>

                        {/* 3. Sync & OCR Status */}
                        <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            {node.photoUrl ? '實體存證照片已留存' : '當時數量吻合（未拍照）'}
                          </span>
                          <span className="font-mono text-slate-500">固定每頁 44 項版面</span>
                        </div>

                        {/* 4. Touch Action Buttons (50% / 50%) */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => onOpenPhotoModal(node)}
                            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 hover:border-[#00f2fe] text-[#00f2fe] font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            <span>檢視存證對比</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onJumpToScan(node)}
                            className="py-2.5 px-3 rounded-xl bg-[#00f2fe] hover:bg-[#00f2fe]/90 text-[#07142b] font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 shadow-[0_0_12px_rgba(0,242,254,0.3)] transition-all"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                            <span>直達 P.{node.pageNumber} 補盤</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
