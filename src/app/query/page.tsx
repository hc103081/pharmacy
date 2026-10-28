'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useAuditSearch } from './hooks/useAuditSearch';
import { CandidateListView } from './components/CandidateListView';
import { DrugAuditTree } from './components/DrugAuditTree';
import { EvidenceCompareModal } from './components/EvidenceCompareModal';
import type { AuditNode, DrugAuditRecord } from '@/types/query';

function QueryMainContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const {
    query,
    setQuery,
    records,
    selectedRecord,
    setSelectedBarcode,
    isLoading,
    error,
    isOffline,
    isFromCache,
    executeSearch,
  } = useAuditSearch();

  // Active modal node
  const [modalNode, setModalNode] = useState<AuditNode | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Restore query state on mount / return from scan
  useEffect(() => {
    const qParam = searchParams.get('q');
    const returnParam = searchParams.get('return');

    if (qParam) {
      setQuery(qParam);
      executeSearch(qParam);
    } else if (returnParam === 'true') {
      const savedQuery = sessionStorage.getItem('phama_query_last_search');
      if (savedQuery) {
        setQuery(savedQuery);
        executeSearch(savedQuery);
      }
    }
  }, [searchParams, executeSearch, setQuery]);

  // Handle form submit / search trigger
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    sessionStorage.setItem('phama_query_last_search', query.trim());
    executeSearch(query.trim());
  };

  // Jump to scan page
  const handleJumpToScan = useCallback(
    (node: AuditNode) => {
      // Save current search state before leaving
      sessionStorage.setItem('phama_query_last_search', query.trim());
      const drugIdParam = node.drugItemId ? `&drugId=${encodeURIComponent(node.drugItemId)}` : '';
      const barcodeParam = selectedRecord?.barcode ? `&barcode=${encodeURIComponent(selectedRecord.barcode)}` : '';
      router.push(
        `/scan?manifestId=${encodeURIComponent(node.manifestId)}&page=${
          node.pageNumber
        }&highlightItem=${node.itemOrder}${drugIdParam}${barcodeParam}&from=query`
      );
    },
    [query, router, selectedRecord]
  );

  // Open photo compare modal
  const handleOpenPhotoModal = useCallback((node: AuditNode) => {
    setModalNode(node);
    setIsModalOpen(true);
  }, []);

  const handleClosePhotoModal = useCallback(() => {
    setIsModalOpen(false);
    setModalNode(null);
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07142b]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#00f2fe] border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-xs font-mono">身分驗證中...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07142b] p-4">
        <div className="text-center p-6 rounded-2xl bg-[#162a56] border border-slate-700 max-w-sm w-full space-y-3">
          <h2 className="text-lg font-bold text-white">請先登入系統</h2>
          <p className="text-xs text-slate-400">您需要登入藥局帳號才能使用藥品查詢系統</p>
          <button
            onClick={() => router.push('/login')}
            className="w-full py-2.5 rounded-xl bg-[#00f2fe] text-[#07142b] font-bold text-xs"
          >
            前往登入
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07142b] text-slate-100 flex flex-col font-sans antialiased">
      {/* Offline Status Bar */}
      {(isOffline || isFromCache) && (
        <div className="bg-[#ff4b5c]/90 text-white text-[11px] py-1 px-4 text-center font-bold tracking-wide sticky top-0 z-40 flex items-center justify-center gap-1.5 shadow-md">
          <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
          <span>離線模式：目前正在顯示 IndexedDB 本地快取之審計紀錄</span>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-3xl w-full mx-auto flex-1 flex flex-col">
        {/* ========================================== */}
        {/* TOP APP SEARCH HEADER                      */}
        {/* ========================================== */}
        <header className="p-3.5 sm:p-4 bg-slate-900/90 border-b border-slate-800/80 sticky top-0 z-30 backdrop-blur-md">
          <div className="flex items-center gap-2 mb-2.5">
            <button
              onClick={() => router.push('/manifests')}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 active:scale-95 transition-all shrink-0"
              title="返回清單列表"
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
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </button>

            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold text-white tracking-wide truncate">
                藥品跨期盤點審計系統
              </h1>
              <p className="text-[11px] text-slate-400 truncate">
                秒查儲位、歷史盤點差額與存證照片
              </p>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                {user.email?.split('@')[0]}
              </span>
            </div>
          </div>

          {/* Search Input Form */}
          <form onSubmit={handleSearchSubmit} className="grid grid-cols-[1fr_auto] gap-2.5 w-full items-center">
            <div className="relative w-full min-w-0">
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="輸入藥名、國際條碼或健保碼..."
                className="box-border w-full bg-[#0c1d3d] border border-[#233d7a] rounded-xl h-10 pl-9 pr-9 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-[#00f2fe] focus:ring-1 focus:ring-[#00f2fe]/40 transition-all font-mono"
              />
              <svg
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>

              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label="清空搜尋"
                  title="清空搜尋"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="box-border h-10 px-4 rounded-xl bg-[#00f2fe] hover:bg-[#00f2fe]/90 text-[#07142b] font-bold text-xs shrink-0 whitespace-nowrap active:scale-95 shadow-[0_0_10px_rgba(0,242,254,0.3)] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-[#07142b] border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              )}
              <span>搜尋</span>
            </button>
          </form>

          {error && (
            <div className="mt-2 text-xs text-[#ff4b5c] px-1">{error}</div>
          )}
        </header>

        {/* ========================================== */}
        {/* MAIN VIEW STATE MACHINE (MODE 2) */}
        {/* ========================================== */}
        <main className="flex-1">
          {selectedRecord ? (
            <DrugAuditTree
              record={selectedRecord}
              onBack={() => setSelectedBarcode(null)}
              onOpenPhotoModal={handleOpenPhotoModal}
              onJumpToScan={handleJumpToScan}
            />
          ) : (
            <CandidateListView
              records={records}
              onSelectRecord={(drug: DrugAuditRecord) => setSelectedBarcode(drug.barcode)}
              isLoading={isLoading}
              query={query}
            />
          )}
        </main>
      </div>

      {/* ========================================== */}
      {/* EVIDENCE COMPARE MODAL OVERLAY */}
      {/* ========================================== */}
      {selectedRecord && (
        <EvidenceCompareModal
          isOpen={isModalOpen}
          onClose={handleClosePhotoModal}
          currentNode={modalNode}
          allHistory={selectedRecord.allHistory}
          drugName={selectedRecord.name}
          barcode={selectedRecord.barcode}
          onJumpToScan={handleJumpToScan}
        />
      )}
    </div>
  );
}

export default function QueryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#07142b]">
          <div className="w-8 h-8 border-4 border-[#00f2fe] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <QueryMainContent />
    </Suspense>
  );
}
