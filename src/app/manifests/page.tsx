'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { TeachingButton } from '@/components/teaching';
import {
  Package,
  Calendar,
  ChevronRight,
  Save,
  Trash2,
  HardDrive,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cloud,
  Folder,
  FolderPlus,
  Sparkles,
  FolderInput,
} from 'lucide-react';
import { Manifest, ManifestFolder } from '@/types';
import { useManifestOperations } from './hooks/useManifestOperations';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog';
import { OperationProgressModal } from './components/OperationProgressModal';
import { B2UsageModal } from './components/B2UsageModal';
import { FolderBreadcrumb } from './components/FolderBreadcrumb';
import { FolderCard } from './components/FolderCard';
import { MoveToFolderModal } from './components/MoveToFolderModal';
import { AiOrganizeDrawer } from './components/AiOrganizeDrawer';
import { CreateFolderDialog } from './components/CreateFolderDialog';
import {
  getFolders,
  getBreadcrumbPath,
  createFolder,
  renameFolder,
  deleteFolder,
  moveManifestsToFolder,
  analyzeAndSuggestFolders,
  applyAiOrganization,
  BreadcrumbItem,
  AiOrganizeSuggestion,
} from '@/app/actions/manifests/folders';
import { Toaster, toast } from 'sonner';

/** 格式化儲存容量大小 */
function formatStorageSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function ManifestsPage() {
  const supabase = createClient();
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [operationProgress, setOperationProgress] = useState<{
    manifestId: string;
    status: 'archiving' | 'restoring' | 'gdrive_pull' | 'completed' | 'error';
    message: string;
    progress?: number;
  } | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [archiveAllLoading, setArchiveAllLoading] = useState(false);
  const [batchActionMode, setBatchActionMode] = useState<'archive' | 'delete'>('archive');
  const [gdriveConnected, setGdriveConnected] = useState<boolean | null>(null);
  const [gdriveDropdownOpen, setGdriveDropdownOpen] = useState(false);
  const [gdriveDetails, setGdriveDetails] = useState<{
    email: string;
    storageQuota: { limit: string; usage: string } | null;
    rootFolderId: string | null;
    storageQuotaError: string | null;
  } | null>(null);
  const [gdriveLoading, setGdriveLoading] = useState(false);

  // B2 容量 Modal 狀態
  const [b2UsageModalOpen, setB2UsageModalOpen] = useState(false);
  const [b2UsageManifestId, setB2UsageManifestId] = useState<string | null>(null);

  // --- 資料夾與樹狀導航狀態 ---
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolders, setCurrentFolders] = useState<ManifestFolder[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);

  // 移動清單 Modal 狀態
  const [moveToModalOpen, setMoveToModalOpen] = useState(false);
  const [targetMoveManifestIds, setTargetMoveManifestIds] = useState<string[]>([]);

  // 新增 / 編輯資料夾 Dialog 狀態
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<'create' | 'rename'>('create');
  const [editingFolder, setEditingFolder] = useState<ManifestFolder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<ManifestFolder | null>(null);

  // AI 智慧整理 Drawer 狀態
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiOrganizeSuggestion[]>([]);
  const [aiTotalUnclassified, setAiTotalUnclassified] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 檢查 Google Drive 連線狀態
  const checkGdriveConnection = useCallback(async (showToast = false) => {
    setGdriveLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('user_gdrive_connections')
        .select('refresh_token, google_email, access_token, token_expires_at, gdrive_root_folder_id')
        .eq('user_id', user.id)
        .single();

      const isConnected = !!data?.refresh_token && !data.refresh_token.startsWith('fake_');
      setGdriveConnected(isConnected);

      if (isConnected && data) {
        let storageQuota = null;
        let storageQuotaError = null;
        let rootFolderId = data.gdrive_root_folder_id;

        if (data.access_token) {
          try {
            const expiresAt = data.token_expires_at
              ? new Date(data.token_expires_at).getTime()
              : 0;
            const isTokenValid = expiresAt > Date.now() + 5 * 60 * 1000;

            let accessToken = data.access_token;
            if (!isTokenValid) {
              try {
                const refreshResponse = await fetch(
                  `${window.location.origin}/api/gdrive/refresh-token`,
                  { method: 'POST' }
                );
                if (refreshResponse.ok) {
                  const refreshData = await refreshResponse.json();
                  accessToken = refreshData.access_token;
                }
              } catch {
                // Ignore refresh error
              }
            }

            if (accessToken) {
              try {
                const quotaResponse = await fetch(
                  'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
                  { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                if (quotaResponse.ok) {
                  const quotaData = await quotaResponse.json();
                  storageQuota = quotaData.storageQuota;
                } else {
                  storageQuotaError = '無法取得儲存空間用量';
                }
              } catch {
                storageQuotaError = '儲存空間用量載入失敗';
              }

              if (!rootFolderId) {
                try {
                  const rootFolderRes = await fetch(
                    `${window.location.origin}/api/gdrive/ensure-root-folder`,
                    { method: 'POST' }
                  );
                  if (rootFolderRes.ok) {
                    const rootFolderData = await rootFolderRes.json();
                    rootFolderId = rootFolderData.root_folder_id;
                  }
                } catch {
                  // Ignore root folder fetch error
                }
              }
            }
          } catch {
            storageQuotaError = '儲存空間用量載入失敗';
          }
        }

        setGdriveDetails({
          email: data.google_email || '',
          storageQuota,
          rootFolderId,
          storageQuotaError,
        });

        if (showToast) {
          toast.success('已連線至 Google Drive', {
            description: `帳號: ${data.google_email || '已授權'}`,
          });
        }
      } else {
        setGdriveDetails(null);
      }
    } catch (error) {
      console.error('Failed to check GDrive status:', error);
      setGdriveConnected(false);
      setGdriveDetails(null);
    } finally {
      setGdriveLoading(false);
    }
  }, [supabase]);

  const executeDisconnect = async () => {
    try {
      const response = await fetch(`${window.location.origin}/api/gdrive/disconnect`, {
        method: 'POST',
      });
      if (response.ok) {
        setGdriveConnected(false);
        setGdriveDetails(null);
        setGdriveDropdownOpen(false);
        toast.success('已中斷 Google Drive 連線');
      } else {
        toast.error('中斷連線失敗，請稍後再試');
      }
    } catch {
      toast.error('中斷連線失敗，請稍後再試');
    } finally {
      setConfirmDisconnect(false);
    }
  };

  useEffect(() => {
    checkGdriveConnection(false);
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('gdrive_connected') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
      checkGdriveConnection(true);
    }
    intervalRef.current = setInterval(() => {
      checkGdriveConnection(false);
    }, 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkGdriveConnection]);

  // 格式化容量
  const localStorageUsage = manifests
    .filter(m => m.status === 'active' || (m.status === 'archived' && !m.cloud_backup))
    .reduce((sum, m) => sum + (m.storage_size_bytes || 0), 0);

  const STORAGE_WARNING_THRESHOLD_MB = 8000;
  const STORAGE_CRITICAL_THRESHOLD_MB = 9500;
  const storageWarningLevel = localStorageUsage >= STORAGE_CRITICAL_THRESHOLD_MB * 1024 * 1024
    ? 'critical'
    : localStorageUsage >= STORAGE_WARNING_THRESHOLD_MB * 1024 * 1024
      ? 'warning'
      : 'none';

  // 取得清單資料
  const fetchManifests = useCallback(async () => {
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
  }, [supabase]);

  // 取得資料夾列表與路徑導航
  const fetchFolders = useCallback(async (folderId: string | null) => {
    setFoldersLoading(true);
    try {
      const [foldersRes, breadcrumbRes] = await Promise.all([
        getFolders(folderId),
        getBreadcrumbPath(folderId),
      ]);

      if (foldersRes.success && foldersRes.folders) {
        setCurrentFolders(foldersRes.folders);
        if (foldersRes.unclassifiedCount !== undefined) {
          setUnclassifiedCount(foldersRes.unclassifiedCount);
        }
      }

      if (breadcrumbRes.success) {
        setBreadcrumbs(breadcrumbRes.breadcrumbs);
      }
    } catch (err) {
      console.error('[fetchFolders] Error:', err);
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchManifests();
  }, [fetchManifests]);

  useEffect(() => {
    fetchFolders(currentFolderId);
  }, [currentFolderId, fetchFolders]);

  const {
    startOperation,
    handleArchive,
    handleRestore,
    handleArchiveAll,
    handleDeleteAll,
    handleDelete,
  } = useManifestOperations({
    manifests,
    fetchManifests,
    setOperationProgress,
    setShowProgressModal,
    setArchiveAllLoading,
    setConfirmDeleteId,
  });

  // --- 資料夾動作處理 ---
  const handleOpenFolder = (folderId: string) => {
    setCurrentFolderId(folderId);
  };

  const handleNavigateBreadcrumb = (folderId: string | null) => {
    setCurrentFolderId(folderId);
  };

  const handleCreateOrRenameFolder = async (name: string) => {
    if (folderDialogMode === 'create') {
      const res = await createFolder(name, currentFolderId, 'custom');
      if (!res.success) {
        toast.error(res.error || '建立資料夾失敗');
        throw new Error(res.error);
      }
      toast.success(`資料夾「${name}」已建立`);
      await fetchFolders(currentFolderId);
    } else if (folderDialogMode === 'rename' && editingFolder) {
      const res = await renameFolder(editingFolder.id, name);
      if (!res.success) {
        toast.error(res.error || '重新命名失敗');
        throw new Error(res.error);
      }
      toast.success('資料夾名稱已更新');
      await fetchFolders(currentFolderId);
    }
  };

  const handleConfirmDeleteFolder = async () => {
    if (!deletingFolder) return;
    const res = await deleteFolder(deletingFolder.id);
    if (!res.success) {
      toast.error(res.error || '刪除資料夾失敗');
      return;
    }
    toast.success(`已刪除資料夾「${deletingFolder.name}」，內含清單已移至未分類`);
    setDeletingFolder(null);
    await fetchFolders(currentFolderId);
    await fetchManifests();
  };

  // --- 清單移動動作處理 ---
  const handleOpenMoveModal = (manifestId: string) => {
    setTargetMoveManifestIds([manifestId]);
    setMoveToModalOpen(true);
  };

  const handleConfirmMove = async (targetFolderId: string | null) => {
    const res = await moveManifestsToFolder(targetMoveManifestIds, targetFolderId);
    if (!res.success) {
      toast.error(res.error || '移動清單失敗');
      return;
    }
    toast.success(`成功移動 ${targetMoveManifestIds.length} 份清單`);
    await fetchManifests();
    await fetchFolders(currentFolderId);
  };

  // --- AI 智慧整理動作處理 ---
  const handleStartAiScan = async () => {
    setAiScanning(true);
    try {
      const res = await analyzeAndSuggestFolders();
      if (!res.success || !res.suggestions) {
        toast.error(res.error || 'AI 掃描失敗');
        return;
      }
      setAiSuggestions(res.suggestions);
      setAiTotalUnclassified(res.totalUnclassified || 0);
      setAiDrawerOpen(true);
    } finally {
      setAiScanning(false);
    }
  };

  const handleApplyAiSuggestions = async (suggestions: AiOrganizeSuggestion[]) => {
    const res = await applyAiOrganization(suggestions);
    if (!res.success) {
      toast.error(res.error || 'AI 歸檔套用失敗');
      return;
    }
    toast.success(`AI 智慧整理完成！已成功歸檔 ${res.appliedCount} 份清單`, {
      description: `新建了 ${res.createdFoldersCount} 個「年/月/日」目錄`,
    });
    await fetchManifests();
    await fetchFolders(currentFolderId);
  };

  // 目前目錄下的清單過濾
  const displayedManifests = manifests
    .filter((m) => m.status === tab)
    .filter((m) => {
      if (currentFolderId === null) {
        return !m.folder_id; // 根目錄顯示未分類清單
      }
      return m.folder_id === currentFolderId; // 子資料夾顯示所屬清單
    });

  const currentFolderObj = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1] : null;

  return (
    <>
      <div className="h-dvh overflow-hidden flex flex-col bg-[#07142b]">
        {/* Fixed Header */}
        <header className="fixed top-0 left-0 right-0 z-40 bg-[#07142b]/95 backdrop-blur-xl border-b border-slate-800/50">
          <div className="max-w-3xl mx-auto p-4 lg:p-6">
            <div className="flex items-center gap-3">
              <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6 text-slate-400" />
              </Link>
              <h1 className="text-xl lg:text-2xl font-bold text-white">選擇清點清單</h1>
              <TeachingButton module="manifest-management" variant="inline" className="ml-2" />

              {/* B2 容量按鈕 */}
              {manifests.length > 0 && (
                <button
                  onClick={() => {
                    const firstManifest = manifests[0];
                    setB2UsageManifestId(firstManifest.id);
                    setB2UsageModalOpen(true);
                  }}
                  aria-label="查看 B2 容量總覽"
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 bg-slate-800 text-[#00f2fe] border border-[#00f2fe]/30 hover:bg-[#00f2fe]/10 hover:shadow-[0_0_12px_rgba(0,242,254,0.4)] cursor-pointer mr-1"
                >
                  <HardDrive className="w-4 h-4" />
                </button>
              )}

              {/* Google Drive 狀態指示器 */}
              {gdriveConnected === true && gdriveDetails && (
                <div className="relative ml-auto">
                  <button
                    onClick={() => setGdriveDropdownOpen(!gdriveDropdownOpen)}
                    aria-label={`已連線至 Google Drive: ${gdriveDetails.email}`}
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 bg-[#00f2fe]/10 text-[#00f2fe] border border-[#00f2fe]/30 hover:bg-[#00f2fe]/20 hover:shadow-[0_0_12px_rgba(0,242,254,0.4)]"
                  >
                    <Cloud className="w-4 h-4" />
                  </button>

                  {gdriveDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setGdriveDropdownOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-[#0d1d3a] border border-slate-700/80 shadow-2xl p-4 z-50 text-xs backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                          <Cloud className="w-4 h-4 text-[#00f2fe]" />
                          <span className="font-semibold text-white truncate">Google Drive 連線中</span>
                        </div>
                        <div className="py-2.5 space-y-1.5 text-slate-300">
                          <p className="truncate"><span className="text-slate-500">帳號：</span>{gdriveDetails.email}</p>
                          {gdriveDetails.storageQuota && (
                            <p>
                              <span className="text-slate-500">雲端空間：</span>
                              {formatStorageSize(parseInt(gdriveDetails.storageQuota.usage, 10))} / {formatStorageSize(parseInt(gdriveDetails.storageQuota.limit, 10))}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setGdriveDropdownOpen(false);
                            setConfirmDisconnect(true);
                          }}
                          className="w-full mt-2 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium transition-colors border border-red-500/20"
                        >
                          中斷連線
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 min-h-0 overflow-y-auto pt-20 pb-8 lg:pt-24 px-4 lg:px-6">
          <div className="max-w-3xl mx-auto space-y-4 lg:space-y-5">
            {/* Tabs (Active vs Archived) */}
            <div className="flex bg-slate-900/80 rounded-xl p-1 border border-slate-800">
              <button
                onClick={() => setTab('active')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === 'active'
                    ? 'bg-[#00f2fe]/20 text-[#00f2fe] hover:bg-[#00f2fe]/30 shadow-[0_0_10px_rgba(0,242,254,0.15)]'
                    : 'bg-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                active ({manifests.filter((m) => m.status === 'active').length})
              </button>
              <button
                onClick={() => setTab('archived')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === 'archived'
                    ? 'bg-[#00f2fe]/20 text-[#00f2fe] hover:bg-[#00f2fe]/30 shadow-[0_0_10px_rgba(0,242,254,0.15)]'
                    : 'bg-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                archived ({manifests.filter((m) => m.status === 'archived').length})
              </button>
            </div>

            {/* Storage Warning Banner */}
            {storageWarningLevel !== 'none' && (
              <div
                className={`flex items-center gap-3 p-4 rounded-xl border ${
                  storageWarningLevel === 'critical'
                    ? 'bg-[#ff4b5c]/10 border-[#ff4b5c]/30 text-[#ff4b5c]'
                    : 'bg-[#fbbf24]/10 border-[#fbbf24]/30 text-[#fbbf24]'
                } animate-in slide-in-from-top-2 duration-300`}
              >
                <div className="flex-shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    {storageWarningLevel === 'critical' ? '儲存空間接近上限' : '儲存空間即將滿載'}
                  </p>
                  <p className="text-xs opacity-80 mt-0.5">
                    B2 雲端儲存佔用 {formatStorageSize(localStorageUsage)} / 10 GB
                    {storageWarningLevel === 'critical' ? '，請盡快封存其他清單釋放空間' : ''}
                  </p>
                </div>
              </div>
            )}

            {/* --- 雲端硬碟樹狀導航列 (Breadcrumbs & Action Toolbar) --- */}
            <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md space-y-3">
              {/* 頂部麵包屑路徑列 */}
              <FolderBreadcrumb
                breadcrumbs={breadcrumbs}
                onNavigate={handleNavigateBreadcrumb}
              />

              {/* 工具按鈕列 */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60 flex-wrap">
                <div className="flex items-center gap-2">
                  {/* 新增資料夾按鈕 */}
                  <button
                    onClick={() => {
                      setFolderDialogMode('create');
                      setEditingFolder(null);
                      setFolderDialogOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/60 transition-all active:scale-95 hover:border-[#00f2fe]/40"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-[#00f2fe]" />
                    <span>新增目錄</span>
                  </button>

                  {/* AI 智慧整理按鈕 */}
                  <button
                    onClick={handleStartAiScan}
                    disabled={aiScanning}
                    className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00f2fe]/10 hover:bg-[#00f2fe]/20 text-[#00f2fe] text-xs font-semibold border border-[#00f2fe]/30 transition-all active:scale-95 shadow-[0_0_12px_rgba(0,242,254,0.15)] disabled:opacity-50"
                  >
                    {aiScanning ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    )}
                    <span>AI 智慧整理</span>
                    {manifests.filter(m => !m.folder_id).length > 0 && currentFolderId === null && (
                      <span className="ml-1 px-1.5 py-0.2 rounded-full bg-[#00f2fe] text-slate-950 text-[10px] font-bold">
                        {manifests.filter(m => !m.folder_id).length}
                      </span>
                    )}
                  </button>
                </div>

                {/* 批次動作切換（封存 vs 垃圾桶） */}
                <div className="flex items-center bg-slate-950/60 rounded-xl p-0.5 border border-slate-800">
                  <button
                    onClick={() => setBatchActionMode('archive')}
                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      batchActionMode === 'archive'
                        ? 'bg-[#00f2fe]/20 text-[#00f2fe] shadow-[0_0_8px_rgba(0,242,254,0.2)]'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Save className="w-3 h-3" />
                    <span>{tab === 'active' ? '封存' : '還原'}</span>
                  </button>
                  <button
                    onClick={() => setBatchActionMode('delete')}
                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      batchActionMode === 'delete'
                        ? 'bg-[#ff4b5c]/20 text-[#ff4b5c] shadow-[0_0_8px_rgba(255,75,92,0.2)]'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>刪除</span>
                  </button>
                </div>
              </div>
            </div>

            {/* --- 資料夾區塊 (當前目錄下的子資料夾) --- */}
            {currentFolders.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-semibold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-[#00f2fe]" />
                    <span>目錄分類 ({currentFolders.length})</span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {currentFolders.map((f) => (
                    <FolderCard
                      key={f.id}
                      folder={f}
                      onOpen={handleOpenFolder}
                      onRename={(folder) => {
                        setFolderDialogMode('rename');
                        setEditingFolder(folder);
                        setFolderDialogOpen(true);
                      }}
                      onDelete={(folder) => setDeletingFolder(folder)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* --- 清單列表區塊 --- */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-[#00f2fe]" />
                  <span>
                    {currentFolderId === null
                      ? `未分類清單 (${displayedManifests.length})`
                      : `清單項目 (${displayedManifests.length})`}
                  </span>
                </h2>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <Loader2 className="w-8 h-8 text-[#00f2fe] animate-spin" />
                  <p className="text-slate-400 text-xs">載入清單中...</p>
                </div>
              ) : displayedManifests.length === 0 ? (
                <div className="text-center py-12 tech-card border-dashed border-slate-700/80 rounded-2xl space-y-3">
                  <Package className="w-10 h-10 text-slate-600 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-slate-300 text-sm font-medium">
                      {currentFolderId === null
                        ? currentFolders.length > 0
                          ? '根目錄無未分類清單（所有清單皆已歸入資料夾）'
                          : '目前沒有可用的清單'
                        : '此資料夾內暫無清單'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {currentFolderId === null
                        ? '可點選上方「新增目錄」或前往「匯入清單」'
                        : '可將其他目錄清單移動至此處'}
                    </p>
                  </div>
                  {currentFolderId === null && currentFolders.length === 0 && (
                    <Link
                      href="/import"
                      className="tech-button tech-button-primary inline-flex px-5 py-2 text-xs"
                    >
                      立即匯入清單
                    </Link>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {displayedManifests.map((m) => {
                    const isOperationInProgress =
                      operationProgress?.manifestId === m.id &&
                      (operationProgress.status === 'archiving' ||
                        operationProgress.status === 'restoring' ||
                        operationProgress.status === 'gdrive_pull');
                    const isOperationCompleted =
                      operationProgress?.manifestId === m.id &&
                      operationProgress.status === 'completed';
                    const operationAnimClass = isOperationInProgress
                      ? operationProgress?.status === 'archiving'
                        ? 'animate-archive-scan'
                        : 'animate-restore-scan'
                      : '';

                    return (
                      <div
                        key={m.id}
                        className={`tech-card p-3.5 sm:p-4 group hover:border-[#00f2fe]/50 flex items-center justify-between relative ${
                          isOperationCompleted ? 'border-green-400/60 shadow-[0_0_12px_rgba(74,222,128,0.4)]' : ''
                        } ${operationAnimClass}`}
                      >
                        {/* 操作進行中的覆蓋層 */}
                        {isOperationInProgress && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#162a56]/60 backdrop-blur-sm overflow-hidden">
                            <div className="relative z-10 flex items-center gap-3 px-5 py-2.5 bg-slate-900/80 rounded-xl border border-[#00f2fe]/40 shadow-[0_0_20px_rgba(0,242,254,0.3)]">
                              <Loader2 className="w-5 h-5 text-[#00f2fe] animate-spin drop-shadow-[0_0_6px_rgba(0,242,254,0.6)]" />
                              <span className="text-sm font-bold text-[#00f2fe] animate-text-shimmer">
                                {operationProgress?.message}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* 操作完成覆蓋層 */}
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

                        {/* 清單卡片主體 */}
                        <Link
                          href={`/scan?manifestId=${m.id}`}
                          className={`flex items-center gap-3.5 flex-1 min-w-0 ${
                            isOperationInProgress ? 'pointer-events-none' : ''
                          }`}
                        >
                          <div className="p-2.5 bg-blue-500/10 rounded-xl group-hover:bg-[#00f2fe]/20 transition-all duration-300 shadow-[0_0_15px_rgba(0,242,254,0.15)] flex-shrink-0">
                            {m.status === 'archived' ? (
                              m.cloud_backup ? (
                                <Cloud className="w-5 h-5 text-[#00f2fe]" />
                              ) : (
                                <Package className="w-5 h-5 text-[#ff4b5c]" />
                              )
                            ) : (
                              <Package className="w-5 h-5 text-[#00f2fe]" />
                            )}
                          </div>
                          <div className="space-y-1 min-w-0 flex-1">
                            <h3 className="font-semibold text-white text-sm sm:text-base truncate group-hover:text-[#00f2fe] transition-colors">
                              {m.name}
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-500" />
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
                                  {m.cloud_backup ? (
                                    <span className="flex items-center gap-1 text-[#00f2fe]">
                                      <Cloud className="w-3 h-3" />
                                      已封存（雲端）
                                    </span>
                                  ) : (
                                    <span className="text-[#ff4b5c]">已封存（本地）</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </Link>

                        {/* 右側操作按鈕群 */}
                        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                          {m.storage_size_bytes !== undefined && (
                            <span
                              className={`hidden sm:flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-slate-900/60 ${
                                m.status === 'active' ? 'text-[#00f2fe]' : 'text-gray-400'
                              }`}
                            >
                              <HardDrive className="w-3 h-3" />
                              {formatStorageSize(m.storage_size_bytes)}
                            </span>
                          )}

                          {/* 移動至資料夾按鈕 */}
                          {!isOperationInProgress && (
                            <button
                              onClick={() => handleOpenMoveModal(m.id)}
                              className="p-2 rounded-lg text-slate-400 hover:text-[#00f2fe] hover:bg-[#00f2fe]/10 transition-all active:scale-90"
                              title="移動至資料夾"
                            >
                              <FolderInput className="w-4 h-4" />
                            </button>
                          )}

                          {/* 封存 / 還原 / 刪除按鈕 */}
                          {m.status === 'active' && !isOperationInProgress && batchActionMode === 'archive' && (
                            <button
                              onClick={() => handleArchive(m.id)}
                              className="p-2 rounded-lg text-[#00f2fe]/70 bg-[#00f2fe]/5 border border-[#00f2fe]/10 hover:text-[#00f2fe] hover:bg-[#00f2fe]/15 hover:border-[#00f2fe]/40 hover:shadow-[0_0_8px_rgba(0,242,254,0.2)] transition-all active:scale-90"
                              title="封存清單"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                          )}
                          {m.status === 'active' && !isOperationInProgress && batchActionMode === 'delete' && (
                            <button
                              onClick={() => setConfirmDeleteId(m.id)}
                              className="p-2 rounded-lg text-[#ff4b5c]/70 bg-[#ff4b5c]/5 border border-[#ff4b5c]/10 hover:text-[#ff4b5c] hover:bg-[#ff4b5c]/15 hover:border-[#ff4b5c]/40 hover:shadow-[0_0_8px_rgba(255,75,92,0.3)] transition-all active:scale-90"
                              title="永久刪除清單"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {m.status === 'archived' && !isOperationInProgress && batchActionMode === 'archive' && (
                            <button
                              onClick={() => handleRestore(m.id)}
                              className="p-2 rounded-lg text-[#00f2fe]/70 bg-[#00f2fe]/5 border border-[#00f2fe]/10 hover:text-[#00f2fe] hover:bg-[#00f2fe]/15 hover:border-[#00f2fe]/40 hover:shadow-[0_0_8px_rgba(0,242,254,0.2)] transition-all active:scale-90"
                              title="解壓還原"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}
                          {m.status === 'archived' && !isOperationInProgress && batchActionMode === 'delete' && (
                            <button
                              onClick={() => setConfirmDeleteId(m.id)}
                              className="p-2 rounded-lg text-[#ff4b5c]/70 bg-[#ff4b5c]/5 border border-[#ff4b5c]/10 hover:text-[#ff4b5c] hover:bg-[#ff4b5c]/15 hover:border-[#ff4b5c]/40 hover:shadow-[0_0_8px_rgba(255,75,92,0.3)] transition-all active:scale-90"
                              title="永久刪除清單"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                          {!isOperationInProgress && (
                            <Link
                              href={`/scan?manifestId=${m.id}`}
                              className="p-1.5 text-slate-500 group-hover:text-[#00f2fe] transition-colors"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* --- 對話框與彈窗組件 --- */}

            {/* 移動清單 Modal */}
            <MoveToFolderModal
              isOpen={moveToModalOpen}
              onClose={() => setMoveToModalOpen(false)}
              manifestIds={targetMoveManifestIds}
              currentFolderId={currentFolderId}
              onConfirmMove={handleConfirmMove}
            />

            {/* 新增 / 編輯資料夾 Dialog */}
            <CreateFolderDialog
              isOpen={folderDialogOpen}
              onClose={() => setFolderDialogOpen(false)}
              mode={folderDialogMode}
              initialName={editingFolder ? editingFolder.name : ''}
              parentFolderName={currentFolderObj?.name}
              onSubmit={handleCreateOrRenameFolder}
            />

            {/* 刪除資料夾確認 Dialog */}
            <DeleteConfirmDialog
              isOpen={!!deletingFolder}
              onClose={() => setDeletingFolder(null)}
              onConfirm={handleConfirmDeleteFolder}
              loading={false}
              title={`確定刪除目錄「${deletingFolder?.name}」？`}
              message="刪除後，該目錄及其子目錄下的所有清單將自動移回「未分類」，不會刪除實體藥品清單資料。"
              confirmText="確定刪除目錄"
              variant="danger"
            />

            {/* AI 智慧整理 Drawer */}
            <AiOrganizeDrawer
              isOpen={aiDrawerOpen}
              onClose={() => setAiDrawerOpen(false)}
              suggestions={aiSuggestions}
              totalUnclassified={aiTotalUnclassified}
              onApply={handleApplyAiSuggestions}
            />

            {/* 單張清單刪除確認 Dialog */}
            <DeleteConfirmDialog
              isOpen={!!confirmDeleteId}
              onClose={() => setConfirmDeleteId(null)}
              onConfirm={async () => {
                if (!confirmDeleteId) return;
                await handleDelete(confirmDeleteId);
                setConfirmDeleteId(null);
                fetchManifests();
              }}
              loading={false}
            />

            {/* 斷開 Google Drive 確認 Dialog */}
            <DeleteConfirmDialog
              isOpen={confirmDisconnect}
              onClose={() => setConfirmDisconnect(false)}
              onConfirm={executeDisconnect}
              loading={false}
              title="確定斷開 Google Drive？"
              message="斷開後將無法自動備份清單到雲端，本地資料不受影響。"
              confirmText="斷開連線"
              variant="danger"
            />

            {/* Operation Progress Modal */}
            <OperationProgressModal
              isOpen={showProgressModal}
              onClose={() => setShowProgressModal(false)}
              status={operationProgress?.status ?? 'archiving'}
              message={operationProgress?.message ?? ''}
              progress={operationProgress?.progress}
            />

            {/* B2 容量總覽 Modal */}
            <B2UsageModal
              isOpen={b2UsageModalOpen}
              onClose={() => setB2UsageModalOpen(false)}
              manifestId={b2UsageManifestId || ''}
            />

            {/* Toast 通知 */}
            <Toaster position="bottom-right" theme="dark" />
          </div>
        </main>
      </div>
    </>
  );
}
