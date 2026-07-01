'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  Package,
  Calendar,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Save,
  HardDrive,
  CheckCircle2,
} from 'lucide-react';
import { deleteManifest } from '@/app/actions/manifests/archive';
import type { Manifest } from '@/types';
import { TeachingButton } from '@/components/teaching';

/** 格式化儲存容量大小 */
function formatStorageSize(bytes: number): string {
  if (bytes === 0) return '0 MB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ManifestsPage() {
  const supabase = createClient();
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [operationProgress, setOperationProgress] = useState<{
    manifestId: string;
    status: 'archiving' | 'restoring' | 'completed' | 'error';
    message: string;
    progress?: number;
  } | null>(null);
  const [archiveAllLoading, setArchiveAllLoading] = useState(false);
  const [batchActionMode, setBatchActionMode] = useState<'archive' | 'delete'>('archive');

  useEffect(() => {
    fetchManifests();
  }, []);

  const fetchManifests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('manifests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setManifests(data || []);
    } catch (error) {
      console.error('Error fetching manifests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const result = await deleteManifest(id);
      if (result.success) {
        setManifests(prev => prev.filter(m => m.id !== id));
        setConfirmDeleteId(null);
      } else {
        alert(`刪除失敗: ${result.error}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知錯誤';
      alert(`刪除過程中發生錯誤: ${message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const startOperation = async (manifestId: string, operation: 'archive' | 'restore') => {
    setOperationProgress({
      manifestId,
      status: operation === 'archive' ? 'archiving' : 'restoring',
      message: operation === 'archive' ? '封存中...' : '還原中...',
    });

    try {
      const res = await fetch(`/api/manifest-operation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, manifestId }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || '操作請求失敗');
      }

      const result = await res.json();
      if (result.status === 'error') {
        throw new Error(result.message || '操作失敗');
      }

      setOperationProgress({
        manifestId,
        status: 'completed',
        message: result.message || (operation === 'archive' ? '封存完成' : '還原完成'),
      });

      setTimeout(() => {
        fetchManifests();
        setOperationProgress(null);
      }, 1500);
    } catch (err) {
      console.error('Failed to start operation:', err);
      setOperationProgress({
        manifestId,
        status: 'error',
        message: err instanceof Error ? err.message : '未知錯誤',
      });
      setTimeout(() => {
        fetchManifests();
        setOperationProgress(null);
      }, 3000);
    }
  };

  const handleArchive = async (manifestId: string) => {
    await startOperation(manifestId, 'archive');
  };

  const handleRestore = async (manifestId: string) => {
    await startOperation(manifestId, 'restore');
  };

  const handleBatchAction = async () => {
    if (batchActionMode === 'archive') {
      await handleArchiveAll();
    } else {
      await handleDeleteAll();
    }
  };

  const handleArchiveAll = async () => {
    setArchiveAllLoading(true);
    try {
      const response = await fetch(
        `${window.location.origin}/api/archive-cron`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Archive all failed: ${errorText}`);
      }

      const result = await response.json();
      console.log('Archive all result:', result);
    } catch (error) {
      console.error('Archive all error:', error);
      const message = error instanceof Error ? error.message : '未知錯誤';
      alert(`封存失敗: ${message}`);
    } finally {
      setArchiveAllLoading(false);
      await fetchManifests();
    }
  };

  const handleDeleteAll = async () => {
    const activeManifests = manifests.filter(m => m.status === 'active');
    if (activeManifests.length === 0) {
      alert('目前沒有可刪除的 active 清單');
      return;
    }

    const confirmed = confirm(
      `確定要永久刪除所有 ${activeManifests.length} 個 active 清單嗎？\n此操作不可恢復！`,
    );
    if (!confirmed) return;

    setArchiveAllLoading(true);
    try {
      for (const m of activeManifests) {
        await deleteManifest(m.id);
      }
      await fetchManifests();
    } catch (error) {
      console.error('Delete all error:', error);
      const message = error instanceof Error ? error.message : '未知錯誤';
      alert(`刪除失敗: ${message}`);
    } finally {
      setArchiveAllLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-[#07142b] text-slate-200 p-4 lg:p-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-5 lg:space-y-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6 text-slate-400" />
            </Link>
            <h1 className="text-xl lg:text-2xl font-bold text-white">選擇清點清單</h1>
            <TeachingButton module="manifest-management" variant="inline" className="ml-3" />
          </div>

          {/* Tabs */}
          <div className="flex bg-slate-900/80 rounded-xl p-1">
            <button
              onClick={() => setTab('active')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === 'active'
                  ? 'bg-[#00f2fe]/20 text-[#00f2fe] hover:bg-[#00f2fe]/30'
                  : 'bg-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              active ({manifests.filter(m => m.status === 'active').length})
            </button>
            <button
              onClick={() => setTab('archived')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === 'archived'
                  ? 'bg-[#00f2fe]/20 text-[#00f2fe] hover:bg-[#00f2fe]/30'
                  : 'bg-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              archived ({manifests.filter(m => m.status === 'archived').length})
            </button>
          </div>

          {/* Batch action toggle (active tab) */}
          {tab === 'active' && (
            <div className="flex justify-end mb-4">
              <div className="flex items-center bg-slate-900/80 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setBatchActionMode('archive')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    batchActionMode === 'archive'
                      ? 'bg-[#00f2fe]/20 text-[#00f2fe] shadow-[0_0_8px_rgba(0,242,254,0.2)]'
                      : 'bg-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>封存</span>
                </button>
                <button
                  onClick={() => setBatchActionMode('delete')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    batchActionMode === 'delete'
                      ? 'bg-[#ff4b5c]/20 text-[#ff4b5c] shadow-[0_0_8px_rgba(255,75,92,0.2)]'
                      : 'bg-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>垃圾桶</span>
                </button>
              </div>
            </div>
          )}

          {/* Archived tab: 切換按鈕（還原/刪除） */}
          {tab === 'archived' && manifests.filter(m => m.status === 'archived').length > 0 && (
            <div className="flex justify-end mb-4">
              <div className="flex items-center bg-slate-900/80 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setBatchActionMode('archive')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    batchActionMode === 'archive'
                      ? 'bg-[#00f2fe]/20 text-[#00f2fe] shadow-[0_0_8px_rgba(0,242,254,0.2)]'
                      : 'bg-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>解壓還原</span>
                </button>
                <button
                  onClick={() => setBatchActionMode('delete')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    batchActionMode === 'delete'
                      ? 'bg-[#ff4b5c]/20 text-[#ff4b5c] shadow-[0_0_8px_rgba(255,75,92,0.2)]'
                      : 'bg-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>垃圾桶</span>
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <Loader2 className="w-10 h-10 text-[#00f2fe] animate-spin" />
              <p className="text-slate-400">載入清單中...</p>
            </div>
          ) : manifests.length === 0 ? (
            <div className="text-center py-20 tech-card border-dashed border-slate-700 space-y-4">
              <Package className="w-12 h-12 text-slate-600 mx-auto" />
              <div className="space-y-1">
                <p className="text-slate-300 font-medium">目前沒有可用的清單</p>
                <p className="text-sm text-slate-500">請先前往「匯入清單」頁面建立新清單</p>
              </div>
              <Link
                href="/import"
                className="tech-button tech-button-primary inline-flex px-6 py-2"
              >
                立即匯入
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {manifests
                .filter(m => m.status === tab)
                .map((m) => {
                  const isOperationInProgress =
                    operationProgress?.manifestId === m.id &&
                    (operationProgress.status === 'archiving' ||
                      operationProgress.status === 'restoring');
                  const isOperationCompleted =
                    operationProgress?.manifestId === m.id &&
                    operationProgress.status === 'completed';
                  const operationAnimClass = isOperationInProgress
                    ? (operationProgress?.status === 'archiving'
                        ? 'animate-archive-scan'
                        : 'animate-restore-scan')
                    : '';
                  return (
                    <div
                      key={m.id}
                      className={`tech-card p-4 group hover:border-[#00f2fe]/50 flex items-center justify-between relative ${
                          isOperationCompleted ? 'border-green-400/60 shadow-[0_0_12px_rgba(74,222,128,0.4)]' : ''
                        } ${operationAnimClass}`}
                    >
                      {/* 操作進行中的覆蓋層 */}
                      {isOperationInProgress && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#162a56]/60 backdrop-blur-sm">
                          <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-900/80 rounded-xl border border-[#00f2fe]/40 shadow-[0_0_20px_rgba(0,242,254,0.3)]">
                            <Loader2 className="w-5 h-5 text-[#00f2fe] animate-spin drop-shadow-[0_0_6px_rgba(0,242,254,0.6)]" />
                            <span className="text-sm font-bold text-[#00f2fe] animate-text-shimmer">
                              {operationProgress?.message}
                            </span>
                          </div>
                        </div>
                      )}
                      {/* 操作完成的覆蓋層 */}
                      {isOperationCompleted && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#162a56]/60 backdrop-blur-sm animate-in fade-in zoom-in duration-300">
                          <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-900/80 rounded-xl border border-green-400/40 shadow-[0_0_20px_rgba(74,222,128,0.3)]">
                            <CheckCircle2 className="w-5 h-5 text-green-400 animate-check-pop" />
                            <span className="text-sm font-bold text-green-400">
                              {operationProgress?.message}
                            </span>
                          </div>
                        </div>
                      )}
                      <Link
                        href={`/scan?manifestId=${m.id}`}
                        className={`flex items-center gap-4 flex-1 ${
                          isOperationInProgress ? 'pointer-events-none' : ''
                        }`}
                      >
                        <div className="p-3 bg-blue-500/10 rounded-lg group-hover:bg-[#00f2fe]/20 transition-all duration-300 shadow-[0_0_15px_rgba(0,242,254,0.2)]">
                          {m.status === 'archived' ? (
                            <Package className="w-6 h-6 text-[#ff4b5c]" />
                          ) : (
                            <Package className="w-6 h-6 text-[#00f2fe]" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <h3 className="font-semibold text-white">{m.name}</h3>
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {m.created_at &&
                                new Date(m.created_at).toLocaleDateString('zh-TW', {
                                  timeZone: 'Asia/Taipei',
                                })}
                            </span>
                            <span>•</span>
                            <span>共 {m.total_items} 項藥品</span>
                            {m.status === 'archived' && (
                              <>
                                <span>•</span>
                                <span className="text-[#ff4b5c]">已封存</span>
                              </>
                            )}
                          </div>
                        </div>
                      </Link>
                      <div className="flex items-center gap-2">
                        {m.storage_size_bytes !== undefined && (
                          <span className={`flex items-center gap-1 text-xs ${
                            m.status === 'active' ? 'text-[#00f2fe]' : 'text-gray-400'
                          }`}>
                            <HardDrive className="w-3.5 h-3.5" />
                            {formatStorageSize(m.storage_size_bytes)}
                          </span>
                        )}
                        {m.status === 'active' && !isOperationInProgress && batchActionMode === 'archive' && (
                          <button
                            onClick={() => handleArchive(m.id)}
                            className="p-2 rounded-lg text-[#00f2fe]/60 bg-[#00f2fe]/5 border border-[#00f2fe]/10 hover:text-[#00f2fe] hover:bg-[#00f2fe]/15 hover:border-[#00f2fe]/40 hover:shadow-[0_0_8px_rgba(0,242,254,0.2)] transition-all active:scale-90"
                            title="封存清單"
                          >
                            <Save className="w-5 h-5" />
                          </button>
                        )}
                        {m.status === 'active' && !isOperationInProgress && batchActionMode === 'delete' && (
                          <button
                            onClick={() => setConfirmDeleteId(m.id)}
                            className="p-2 rounded-lg text-[#ff4b5c]/60 bg-[#ff4b5c]/5 border border-[#ff4b5c]/10 hover:text-[#ff4b5c] hover:bg-[#ff4b5c]/15 hover:border-[#ff4b5c]/40 hover:shadow-[0_0_8px_rgba(255,75,92,0.3)] transition-all active:scale-90"
                            title="永久刪除清單"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                        {m.status === 'archived' && !isOperationInProgress && batchActionMode === 'archive' && (
                          <button
                            onClick={() => handleRestore(m.id)}
                            className="p-2 rounded-lg text-[#00f2fe]/60 bg-[#00f2fe]/5 border border-[#00f2fe]/10 hover:text-[#00f2fe] hover:bg-[#00f2fe]/15 hover:border-[#00f2fe]/40 hover:shadow-[0_0_8px_rgba(0,242,254,0.2)] transition-all active:scale-90"
                            title="解壓還原"
                          >
                            <RefreshCw className="w-5 h-5" />
                          </button>
                        )}
                        {m.status === 'archived' && !isOperationInProgress && batchActionMode === 'delete' && (
                          <button
                            onClick={() => setConfirmDeleteId(m.id)}
                            className="p-2 rounded-lg text-[#ff4b5c]/60 bg-[#ff4b5c]/5 border border-[#ff4b5c]/10 hover:text-[#ff4b5c] hover:bg-[#ff4b5c]/15 hover:border-[#ff4b5c]/40 hover:shadow-[0_0_8px_rgba(255,75,92,0.3)] transition-all active:scale-90"
                            title="永久刪除清單"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                        {!isOperationInProgress && (
                          <Link
                            href={`/scan?manifestId=${m.id}`}
                            className="p-2 text-slate-500 group-hover:text-[#00f2fe] transition-colors"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </Link>
                        )}

            </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* 刪除確認 Dialog */}
          {confirmDeleteId && manifests.some(m => m.id === confirmDeleteId) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="tech-card p-6 max-w-sm w-full space-y-4 animate-in zoom-in duration-200">
                <div className="flex items-center gap-3 text-red-400">
                  <AlertTriangle className="w-6 w-6" />
                  <h3 className="font-bold text-lg">確認刪除清單</h3>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  刪除後將永久移除此清單及其所有清點記錄與照片，此操作不可恢復。
                </p>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="flex-1 py-2 bg-slate-800 text-slate-400 rounded-xl font-medium hover:bg-slate-700 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => handleDelete(confirmDeleteId)}
                    disabled={deletingId !== null}
                    className="flex-1 py-2 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all disabled:opacity-50"
                  >
                    {deletingId ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> 刪除中...
                      </div>
                    ) : (
                      '確定刪除'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Operation Progress Modal */}
          {operationProgress && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="tech-card p-6 max-w-md w-full space-y-4 animate-in zoom-in duration-200 border-[#00f2fe]/50">
                <div className="flex items-center gap-3 text-[#00f2fe]">
                  {operationProgress.status === 'completed' ? (
                    <CheckCircle2 className="w-6 h-6 animate-check-pop" />
                  ) : (
                    <Loader2 className="w-7 h-7 text-[#00f2fe] animate-spin drop-shadow-[0_0_8px_rgba(0,242,254,0.6)]" />
                  )}
                  <h3 className="font-bold text-lg">
                    {operationProgress.status === 'completed' 
                      ? '操作成功' 
                      : (operationProgress.status === 'archiving' ? '封存中' : '還原中')}
                  </h3>
                </div>
                <p className={`text-sm leading-relaxed ${operationProgress.status === 'completed' ? 'text-white' : 'text-slate-400'}`}>
                  {operationProgress.message}
                </p>
                {operationProgress.progress !== undefined && operationProgress.status !== 'completed' && (
                  <div className="mt-4">
                    <div className="w-full bg-slate-700/30 rounded-full h-2.5 overflow-hidden relative">
                      <div
                        className="bg-gradient-to-r from-[#00f2fe] to-blue-500 h-2.5 rounded-full transition-all duration-500 relative shadow-[0_0_10px_rgba(0,242,254,0.5)]"
                        style={{ width: `${operationProgress.progress}%` }}
                      >
                        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 flex justify-between">
                      <span>處理進度</span>
                      <span>{operationProgress.progress}% 完成</span>
                    </p>
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setOperationProgress(null)}
                    className="px-4 py-2 bg-slate-800 text-slate-400 rounded-xl hover:bg-slate-700 transition-colors"
                  >
                    關閉
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
