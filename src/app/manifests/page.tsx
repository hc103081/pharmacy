'use client';

import React, { useEffect, useState, useRef } from 'react';
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
} from 'lucide-react';
import { deleteManifest } from '@/app/actions/manifests/archive';
import type { Manifest } from '@/types';
import { TeachingButton } from '@/components/teaching';

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
  const operationEventSourceRef = useRef<EventSource | null>(null);
  const [archiveAllLoading, setArchiveAllLoading] = useState(false);

  useEffect(() => {
    fetchManifests();
  }, [tab]);

  const fetchManifests = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('manifests')
        .select('*')
        .order('created_at', { ascending: false });

      if (tab === 'active') {
        query = query.eq('status', 'active');
      } else if (tab === 'archived') {
        query = query.eq('status', 'archived');
      }

      const { data, error } = await query;
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

  const startOperation = async (
    manifestId: string,
    operation: 'archive' | 'restore'
  ) => {
    // Close any existing event source
    if (operationEventSourceRef.current) {
      operationEventSourceRef.current.close();
    }

    // Set initial progress
    setOperationProgress({
      manifestId,
      status: operation === 'archive' ? 'archiving' : 'restoring',
      message: operation === 'archive' ? '封存中...' : '還原中...',
    });

    try {
      const eventSource = new EventSource(
        `${window.location.origin}/api/manifest-operation?operation=${operation}&manifestId=${manifestId}`,
        { withCredentials: true }
      );
      operationEventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setOperationProgress(prev => {
            if (!prev || prev.manifestId !== manifestId) return prev;
            return {
              ...prev,
              status: data.status as any,
              message: data.message,
              progress: data.progress,
            };
          });

          if (data.status === 'completed' || data.status === 'error') {
            // Operation finished, refresh manifests after a short delay
            setTimeout(() => {
              fetchManifests();
              setOperationProgress(null);
            }, 1500);
            eventSource.close();
            operationEventSourceRef.current = null;
          }
        } catch (e) {
          console.error('Failed to parse SSE message:', e);
        }
      };

      eventSource.onerror = () => {
        console.error('EventSource error');
        setOperationProgress(prev => {
          if (!prev || prev.manifestId !== manifestId) return prev;
          return {
            ...prev,
            status: 'error',
            message: '連線錯誤',
          };
        });
        setTimeout(() => {
          fetchManifests();
          setOperationProgress(null);
        }, 1500);
        eventSource.close();
        operationEventSourceRef.current = null;
      };
    } catch (err) {
      console.error('Failed to start operation:', err);
      setOperationProgress(prev => {
        if (!prev || prev.manifestId !== manifestId) return prev;
        return {
          ...prev,
          status: 'error',
          message: err instanceof Error ? err.message : '未知錯誤',
        };
      });
      setTimeout(() => {
        fetchManifests();
        setOperationProgress(null);
      }, 1500);
    }
  };

  const handleArchive = async (manifestId: string) => {
    await startOperation(manifestId, 'archive');
  };

  const handleRestore = async (manifestId: string) => {
    await startOperation(manifestId, 'restore');
  };

  const handleArchiveAll = async () => {
    setArchiveAllLoading(true);
    try {
      // Call the archive-cron function directly
      const response = await fetch(
        `${window.location.origin}/api/archive-cron`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}), // Empty body
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Archive all failed: ${errorText}`);
      }

      const result = await response.json();
      // Optionally show a toast or notification
      console.log('Archive all result:', result);
    } catch (error) {
      console.error('Archive all error:', error);
      const message = error instanceof Error ? error.message : '未知錯誤';
      alert(`封存失敗: ${message}`);
    } finally {
      setArchiveAllLoading(false);
      // Refresh the manifests list
      await fetchManifests();
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
          <div className="flex bg-slate-800/50 rounded-xl p-1">
            <button
              onClick={() => setTab('active')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium ${
                tab === 'active'
                  ? 'bg-[#00f2fe]/20 text-[#00f2fe] hover:bg-[#00f2fe]/30'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              active ({manifests.filter(m => m.status === 'active').length})
            </button>
            <button
              onClick={() => setTab('archived')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium ${
                tab === 'archived'
                  ? 'bg-[#00f2fe]/20 text-[#00f2fe] hover:bg-[#00f2fe]/30'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              archived ({manifests.filter(m => m.status === 'archived').length})
            </button>
          </div>

          {/* Archive all button (only for active tab) */}
          {tab === 'active' && (
            <div className="flex justify-end mb-4">
              <button
                onClick={handleArchiveAll}
                disabled={archiveAllLoading}
                className={`px-4 py-2 bg-[#00f2fe]/20 text-[#00f2fe] hover:bg-[#00f2fe]/30 rounded-lg transition-colors ${
                  archiveAllLoading ? 'opacity-50' : ''
                }`}
              >
                {archiveAllLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4" />
                    <span>封存中...</span>
                  </div>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>封存符合條件的所有清單</span>
                  </>
                )}
              </button>
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
              {manifests.map((m) => {
                const isOperationInProgress =
                  operationProgress?.manifestId === m.id &&
                  (operationProgress.status === 'archiving' ||
                    operationProgress.status === 'restoring');
                return (
                  <div
                    key={m.id}
                    className="tech-card p-4 group hover:border-[#00f2fe]/50 flex items-center justify-between"
                  >
                    <Link
                      href={`/scan?manifestId=${m.id}`}
                      className={`flex items-center gap-4 flex-1 ${
                        isOperationInProgress ? 'pointer-events-none opacity-50' : ''
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
                            {m.created_at && new Date(m.created_at).toLocaleDateString()}
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
                      {m.status === 'active' && !isOperationInProgress && (
                        <button
                          onClick={() => setConfirmDeleteId(m.id)}
                          className="p-2 rounded-lg text-[#ff4b5c]/60 bg-[#ff4b5c]/5 border border-[#ff4b5c]/10 hover:text-[#ff4b5c] hover:bg-[#ff4b5c]/15 hover:border-[#ff4b5c]/40 hover:shadow-[0_0_8px_rgba(255,75,92,0.3)] transition-all active:scale-90"
                          title="永久刪除清單"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                      {m.status === 'archived' && !isOperationInProgress && (
                        <button
                          onClick={() => handleRestore(m.id)}
                          className="p-2 rounded-lg text-[#00f2fe]/60 bg-[#00f2fe]/5 border border-[#00f2fe]/10 hover:text-[#00f2fe] hover:bg-[#00f2fe]/15 hover:border-[#ff4b5c]/40 hover:shadow-[0_0_8px_rgba(0,242,254,0.2)] transition-all active:scale-90"
                          title="解壓還原"
                        >
                          <RefreshCw className="w-5 h-5" />
                        </button>
                      )}
                      {!isOperationInProgress && (
                        <Link href={`/scan?manifestId=${m.id}`} className="p-2 text-slate-500 group-hover:text-[#00f2fe] transition-colors">
                          <ChevronRight className="w-5 h-5" />
                        </Link>
                      )}
                      {isOperationInProgress && (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-[#00f2fe] animate-spin" />
                          <span className="text-xs text-[#00f2fe]">
                            {operationProgress?.message}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 刪除確認 Dialog (only for active manifests) */}
          {confirmDeleteId && manifests.some(m => m.id === confirmDeleteId && m.status === 'active') && (
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

          {/* Operation Progress Modal (alternative to inline) */}
          {operationProgress && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="tech-card p-6 max-w-md w-full space-y-4 animate-in zoom-in duration-200">
                <div className="flex items-center gap-3 text-[#00f2fe]">
                  <Loader2 className="w-6 h-6" />
                  <h3 className="font-bold text-lg">{operationProgress.status === 'archiving' ? '封存中' : '還原中'}</h3>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {operationProgress.message}
                </p>
                {operationProgress.progress !== undefined && (
                  <div className="mt-4">
                    <div className="w-full bg-slate-700/30 rounded-full h-2.5">
                      <div
                        className={`bg-[#00f2fe] h-2.5 rounded-full transition-width duration-500`}
                        style={{ width: `${operationProgress.progress}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {operationProgress.progress}% 完成
                    </p>
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      if (operationEventSourceRef.current) {
                        operationEventSourceRef.current.close();
                      }
                      setOperationProgress(null);
                    }}
                    className="px-4 py-2 bg-slate-800 text-slate-400 rounded-xl hover:bg-slate-700"
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