'use client';

import { useCallback } from 'react';
import { deleteManifest } from '@/app/actions/manifests/archive';
import type { Manifest } from '@/types';

interface OperationProgress {
  manifestId: string;
  status: 'archiving' | 'restoring' | 'completed' | 'error';
  message: string;
  progress?: number;
}

interface UseManifestOperationsProps {
  manifests: Manifest[];
  fetchManifests: () => Promise<void>;

  // state setters
  setOperationProgress: (progress: OperationProgress | null) => void;
  setShowProgressModal: (show: boolean) => void;
  setArchiveAllLoading: (loading: boolean) => void;
  setConfirmDeleteId: (id: string | null) => void;
}

export function useManifestOperations({
  manifests,
  fetchManifests,
  setOperationProgress,
  setShowProgressModal,
  setArchiveAllLoading,
  setConfirmDeleteId,
}: UseManifestOperationsProps) {
  const startOperation = useCallback(
    async (manifestId: string, operation: 'archive' | 'restore') => {
      setOperationProgress({
        manifestId,
        status: operation === 'archive' ? 'archiving' : 'restoring',
        message: operation === 'archive' ? '封存中...' : '還原中...',
      });
      setShowProgressModal(true);

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
        setShowProgressModal(false);

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
        setShowProgressModal(false);

        setTimeout(() => {
          fetchManifests();
          setOperationProgress(null);
        }, 3000);
      }
    },
    [fetchManifests, setOperationProgress, setShowProgressModal]
  );

  const handleArchive = useCallback(
    async (manifestId: string) => {
      await startOperation(manifestId, 'archive');
    },
    [startOperation]
  );

  const handleRestore = useCallback(
    async (manifestId: string) => {
      await startOperation(manifestId, 'restore');
    },
    [startOperation]
  );

  const handleArchiveAll = useCallback(async () => {
    setArchiveAllLoading(true);
    try {
      const response = await fetch(`${window.location.origin}/api/archive-cron`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

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
  }, [fetchManifests, setArchiveAllLoading]);

  const handleDeleteAll = useCallback(async () => {
    const activeManifests = manifests.filter((m) => m.status === 'active');
    if (activeManifests.length === 0) {
      alert('目前沒有可刪除的 active 清單');
      return;
    }

    const confirmed = confirm(
      `確定要永久刪除所有 ${activeManifests.length} 個 active 清單嗎？\n此操作不可恢復！`
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
  }, [manifests, fetchManifests]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const result = await deleteManifest(id);
        if (result.success) {
          // Note: fetchManifests will be called by parent
        } else {
          alert(`刪除失敗: ${result.error}`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '未知錯誤';
        alert(`刪除過程中發生錯誤: ${message}`);
      }
    },
    []
  );

  return {
    startOperation,
    handleArchive,
    handleRestore,
    handleArchiveAll,
    handleDeleteAll,
    handleDelete,
  };
}