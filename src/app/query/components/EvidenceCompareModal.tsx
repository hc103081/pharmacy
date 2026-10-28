'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { AuditNode } from '@/types/query';

interface EvidenceCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentNode: AuditNode | null;
  allHistory: AuditNode[];
  drugName: string;
  barcode: string;
  onJumpToScan: (node: AuditNode) => void;
}

export function EvidenceCompareModal({
  isOpen,
  onClose,
  currentNode,
  allHistory,
  drugName,
  barcode,
  onJumpToScan,
}: EvidenceCompareModalProps) {
  // Available other history nodes for comparison
  const otherHistory = useMemo(() => {
    if (!currentNode) return [];
    return allHistory.filter(
      (h) =>
        !(
          h.manifestId === currentNode.manifestId &&
          h.pageNumber === currentNode.pageNumber &&
          h.itemOrder === currentNode.itemOrder
        )
    );
  }, [currentNode, allHistory]);

  // Selected comparison node ID
  const [selectedCompareKey, setSelectedCompareKey] = useState<string>('');

  // Default to the first available other node
  useEffect(() => {
    if (otherHistory.length > 0) {
      setSelectedCompareKey(
        `${otherHistory[0].manifestId}_${otherHistory[0].pageNumber}_${otherHistory[0].itemOrder}`
      );
    } else {
      setSelectedCompareKey('');
    }
  }, [otherHistory, currentNode]);

  const compareNode = useMemo(() => {
    if (!selectedCompareKey) return null;
    return (
      otherHistory.find(
        (h) => `${h.manifestId}_${h.pageNumber}_${h.itemOrder}` === selectedCompareKey
      ) || null
    );
  }, [otherHistory, selectedCompareKey]);

  // Resolved Presigned URLs for B2 photos
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);
  const [comparePhotoUrl, setComparePhotoUrl] = useState<string | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Helper function to resolve key to signed url
  const resolvePhotoUrl = useCallback(
    async (manifestId: string, rawKey: string | null): Promise<string | null> => {
      if (!rawKey) return null;
      if (rawKey.startsWith('http://') || rawKey.startsWith('https://')) {
        return rawKey;
      }
      try {
        const res = await fetch('/api/scan/batch-view-urls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ manifestId, keys: [rawKey] }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.urls?.[rawKey] || null;
      } catch (e) {
        console.warn('Failed to resolve presigned photo url:', e);
        return null;
      }
    },
    []
  );

  // Fetch current photo
  useEffect(() => {
    if (!currentNode?.photoUrl) {
      setCurrentPhotoUrl(null);
      setLoadingCurrent(false);
      return;
    }
    let cancelled = false;
    setLoadingCurrent(true);
    resolvePhotoUrl(currentNode.manifestId, currentNode.photoUrl).then((url) => {
      if (!cancelled) {
        setCurrentPhotoUrl(url);
        setLoadingCurrent(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentNode, resolvePhotoUrl]);

  // Fetch compare photo
  useEffect(() => {
    if (!compareNode?.photoUrl) {
      setComparePhotoUrl(null);
      setLoadingCompare(false);
      return;
    }
    let cancelled = false;
    setLoadingCompare(true);
    resolvePhotoUrl(compareNode.manifestId, compareNode.photoUrl).then((url) => {
      if (!cancelled) {
        setComparePhotoUrl(url);
        setLoadingCompare(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [compareNode, resolvePhotoUrl]);

  if (!isOpen || !currentNode) return null;

  const currentIsDiscrepant = currentNode.discrepancy !== 0;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 transition-all duration-300">
      <div className="bg-[#162a56] border-2 border-slate-700 rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-4 shadow-2xl relative max-h-[90vh] flex flex-col overflow-y-auto scrollbar-none">
        
        {/* ========================================== */}
        {/* MODAL HEADER                              */}
        {/* ========================================== */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-700/80 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2 py-0.5 rounded bg-[#ff4b5c]/20 text-[#ff4b5c] font-bold border border-[#ff4b5c]/30">
                實拍存證對比
              </span>
              <span className="text-xs text-slate-400 font-mono">B2 Cloud Storage</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white mt-1">
              {drugName}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              條碼：{barcode} • 清單 #{currentNode.manifestId.slice(0, 8)}（P.{currentNode.pageNumber} #{currentNode.itemOrder}）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center font-bold text-sm shrink-0"
          >
            ✕
          </button>
        </div>

        {/* ========================================== */}
        {/* PHOTO COMPARISON GRID                     */}
        {/* ========================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 flex-1 min-h-0">
          
          {/* Current Node Photo (Left) */}
          <div className="rounded-2xl bg-slate-900 border-2 border-[#ff4b5c]/80 p-3 space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800">
                <span className="font-bold text-[#ff4b5c]">本次盤點存證</span>
                <span className="font-mono text-[#ff4b5c] font-bold">
                  {currentIsDiscrepant ? `差異 ${currentNode.discrepancy}` : '吻合'}
                </span>
              </div>

              {loadingCurrent ? (
                <div className="h-44 sm:h-52 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-center p-3 mt-2">
                  <div className="w-6 h-6 border-2 border-[#00f2fe] border-t-transparent rounded-full animate-spin mb-2" />
                  <span className="text-xs text-slate-400">正在自雲端載入存證照片...</span>
                </div>
              ) : currentPhotoUrl ? (
                <div className="h-44 sm:h-52 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center mt-2 overflow-hidden relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentPhotoUrl}
                    alt="本次實體盤點照片"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-[#00f2fe]">
                    本次存證
                  </div>
                </div>
              ) : (
                <div className="h-44 sm:h-52 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-center p-3 mt-2">
                  <span className="text-3xl mb-1">📷</span>
                  <span className="text-xs text-slate-300 font-medium">本次盤點未拍攝外觀照片</span>
                  <span className="text-[11px] text-slate-500 mt-1">實盤：{currentNode.actualQuantity} / 應收：{currentNode.expectedQuantity}</span>
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 flex justify-between items-center">
              <span>盤點人：{currentNode.counterName}</span>
              <span className="font-mono">{new Date(currentNode.countedAt).toLocaleDateString('zh-TW')}</span>
            </div>
          </div>

          {/* Historical Node Photo (Right) with Dropdown Selector */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3 space-y-2 flex flex-col justify-between">
            <div>
              {/* Dropdown Selector Header */}
              <div className="flex flex-col gap-1 pb-1 border-b border-slate-800">
                <div className="text-[11px] text-slate-400 font-medium">
                  選擇對比的歷史盤點清單：
                </div>
                {otherHistory.length > 0 ? (
                  <select
                    value={selectedCompareKey}
                    onChange={(e) => setSelectedCompareKey(e.target.value)}
                    className="w-full bg-[#0c1d3d] text-white border border-[#233d7a] rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#00f2fe]"
                  >
                    {otherHistory.map((h) => {
                      const dateStr = new Date(h.countedAt).toLocaleDateString('zh-TW');
                      return (
                        <option
                          key={`${h.manifestId}_${h.pageNumber}_${h.itemOrder}`}
                          value={`${h.manifestId}_${h.pageNumber}_${h.itemOrder}`}
                        >
                          {dateStr} - {h.manifestName} (實盤 {h.actualQuantity}/{h.expectedQuantity})
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <span className="text-xs text-slate-500 italic">尚無其他歷史清單可供對比</span>
                )}
              </div>

              {loadingCompare ? (
                <div className="h-44 sm:h-52 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-center p-3 mt-2">
                  <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-2" />
                  <span className="text-xs text-slate-400">正在自雲端載入歷史照片...</span>
                </div>
              ) : compareNode ? (
                comparePhotoUrl ? (
                  <div className="h-44 sm:h-52 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center mt-2 overflow-hidden relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={comparePhotoUrl}
                      alt="歷史盤點存證照片"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-emerald-400">
                      歷史存證
                    </div>
                  </div>
                ) : (
                  <div className="h-44 sm:h-52 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-center p-3 mt-2">
                    <span className="text-3xl mb-1">✓</span>
                    <span className="text-xs text-emerald-400 font-medium">
                      該次盤點未留存照片
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1">
                      盤點數量相符（實盤 {compareNode.actualQuantity} / 應收 {compareNode.expectedQuantity}），依規範免拍
                    </span>
                  </div>
                )
              ) : (
                <div className="h-44 sm:h-52 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-center p-3 mt-2 text-slate-500 text-xs">
                  此為首次盤點，無先前影像
                </div>
              )}
            </div>

            {compareNode && (
              <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 flex justify-between items-center">
                <span>盤點人：{compareNode.counterName}</span>
                <span className="font-mono">{new Date(compareNode.countedAt).toLocaleDateString('zh-TW')}</span>
              </div>
            )}
          </div>

        </div>

        {/* ========================================== */}
        {/* MODAL FOOTER ACTIONS                       */}
        {/* ========================================== */}
        <div className="pt-2 border-t border-slate-700/80 flex items-center justify-between gap-2 text-xs shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700 font-medium"
          >
            關閉
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onJumpToScan(currentNode);
            }}
            className="flex-1 py-2.5 px-4 rounded-xl bg-[#00f2fe] hover:bg-[#00f2fe]/90 text-[#07142b] font-bold active:scale-95 shadow-[0_0_12px_rgba(0,242,254,0.3)] flex items-center justify-center gap-1.5 transition-all"
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
            <span>直達該頁 (P.{currentNode.pageNumber}) 補盤</span>
          </button>
        </div>

      </div>
    </div>
  );
}
