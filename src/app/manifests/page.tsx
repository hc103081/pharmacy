'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
  getAllFolders,
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

const FOLDERS_CACHE_KEY = 'phama_folders_cache_v1';

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

  // --- SWR 0ms 本地快取資料夾狀態 ---
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [allFolders, setAllFolders] = useState<ManifestFolder[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(FOLDERS_CACHE_KEY);
        if (cached) return JSON.parse(cached);
      } catch {
        // ignore
      }
    }
    return [];
  });
  const [foldersLoading, setFoldersLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return !localStorage.getItem(FOLDERS_CACHE_KEY);
      } catch {
        // ignore
      }
    }
    return true;
  });

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

  // 1. 取得清單資料 (單次批次)
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

  // 2. 一次性取得所有資料夾 (SWR 優先直連 + 本地持久化快取)
  const fetchAllFolders = useCallback(async () => {
    try {
      // 優先使用已建立連線的客戶端 Supabase 實例直查（速度最快，免冷啟動）
      const { data, error } = await supabase
        .from('manifest_folders')
        .select('*')
        .order('name', { ascending: true });

      if (!error && data) {
        setAllFolders(data);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(FOLDERS_CACHE_KEY, JSON.stringify(data));
          } catch {}
        }
      } else {
        const res = await getAllFolders();
        if (res.success && res.folders) {
          setAllFolders(res.folders);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(FOLDERS_CACHE_KEY, JSON.stringify(res.folders));
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error('[fetchAllFolders] Error, falling back to server action:', err);
      try {
        const res = await getAllFolders();
        if (res.success && res.folders) {
          setAllFolders(res.folders);
        }
      } catch {
        // Ignore fallback error
      }
    } finally {
      setFoldersLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchManifests();
    fetchAllFolders();
  }, [fetchManifests, fetchAllFolders]);

  // --- 高性能即時計算 (純記憶體 0ms 運算，無任何網路等待) ---

  // 麵包屑路徑：由 currentFolderId 往上反查全域 allFolders 快取，0 毫秒即時產生
  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    if (!currentFolderId) return [];
    const folderMap = new Map(allFolders.map(f => [f.id, f]));
    const crumbs: BreadcrumbItem[] = [];
    let curr: string | null = currentFolderId;
    while (curr) {
      const folder = folderMap.get(curr);
      if (!folder) break;
      crumbs.unshift({
        id: folder.id,
        name: folder.name,
        parent_id: folder.parent_id,
      });
      curr = folder.parent_id;
    }
    return crumbs;
  }, [allFolders, currentFolderId]);

  // 當前層級下的子資料夾：直接從 allFolders 篩選並從本地 manifests 計算項目數，0 毫秒即時響應
  const currentFolders = useMemo(() => {
    return allFolders
      .filter((f) => (currentFolderId === null ? !f.parent_id : f.parent_id === currentFolderId))
      .map((f) => {
        const itemCount = manifests.filter((m) => m.folder_id === f.id && m.status === tab).length;
        const subfolderCount = allFolders.filter((sub) => sub.parent_id === f.id).length;
        return {
          ...f,
          item_count: itemCount,
          subfolder_count: subfolderCount,
        };
      });
  }, [allFolders, currentFolderId, manifests, tab]);

  // 未分類清單數量
  const unclassifiedCount = useMemo(() => {
    return manifests.filter((m) => !m.folder_id).length;
  }, [manifests]);

  // 目前目錄下的清單過濾 (同步 0ms 即時切換)
  const displayedManifests = useMemo(() => {
    return manifests
      .filter((m) => m.status === tab)
      .filter((m) => {
        if (currentFolderId === null) {
          return !m.folder_id; // 根目錄顯示未分類清單
        }
        return m.folder_id === currentFolderId; // 子資料夾顯示所屬清單
      });
  }, [manifests, tab, currentFolderId]);

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

  // --- 資料夾動作處理 (即時切換，零延遲) ---
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
      await fetchAllFolders();
    } else if (folderDialogMode === 'rename' && editingFolder) {
      const res = await renameFolder(editingFolder.id, name);
      if (!res.success) {
        toast.error(res.error || '重新命名失敗');
        throw new Error(res.error);
      }
      toast.success('資料夾名稱已更新');
      await fetchAllFolders();
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
    await fetchAllFolders();
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
    await fetchAllFolders();
  };

  const currentFolderObj = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1] : null;

  return (
    <>
      <div className="h-dvh overflow-hidden flex flex-col bg-[#07142b]">
        {/* Fixed Header */}
        <header className="fixed top-0 left-0 right-0 z-40 bg-[#07142b]/95 backdrop-blur-xl border-b border-slate-800/50">
          <div className="max-w-3xl mx-auto p-3.5 sm:p-4 lg:p-6">
            <div className="flex items-center gap-2.5">
              <Link href="/" className="p-1.5 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                <ArrowLeft className="w-5 h-5 text-slate-400" />
              </Link>
              <h1 className="text-lg lg:text-2xl font-bold text-white">選擇清點清單</h1>
              <TeachingButton module="manifest-management" variant="inline" className="ml-1" />

              {/* B2 容量按鈕 */}
              {manifests.length > 0 && (
                <button
                  onClick={() => {
                    const firstManifest = manifests[0];
                    setB2UsageManifestId(firstManifest.id);
                    setB2UsageModalOpen(true);
                  }}
                  aria-label="查看 B2 容量總覽"
                  className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 bg-slate-800 text-[#00f2fe] border border-[#00f2fe]/30 hover:bg-[#00f2fe]/10 hover:shadow-[0_0_12px_rgba(0,242,254,0.4)] cursor-pointer mr-1"
                >
                  <HardDrive className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              )}

              {/* Google Drive 狀態指示器 */}
              {gdriveConnected === true && gdriveDetails && (
                <div className="relative ml-auto">
                  <button
                    onClick={() => setGdriveDropdownOpen(!gdriveDropdownOpen)}
                    aria-label={`已連線至 Google Drive: ${gdriveDetails.email}`}
                    className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 bg-slate-800 text-[#00f2fe] border border-[#00f2fe]/30 hover:bg-[#00f2fe]/10"
                  >
                    <Cloud className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
        <main className="flex-1 min-h-0 overflow-y-auto pt-16 pb-8 lg:pt-20 px-3.5 sm:px-4 lg:px-6">
          <div className="max-w-3xl mx-auto space-y-3">

            {/* Storage Warning Banner */}
            {storageWarningLevel !== 'none' && (
              <div
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  storageWarningLevel === 'critical'
                    ? 'bg-[#ff4b5c]/10 border-[#ff4b5c]/30 text-[#ff4b5c]'
                    : 'bg-[#fbbf24]/10 border-[#fbbf24]/30 text-[#fbbf24]'
                } animate-in slide-in-from-top-2 duration-300`}
              >
                <div className="flex-shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-xs sm:text-sm">
                    {storageWarningLevel === 'critical' ? '儲存空間接近上限' : '儲存空間即將滿載'}
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    B2 雲端儲存佔用 {formatStorageSize(localStorageUsage)} / 10 GB
                  </p>
                </div>
              </div>
            )}

            {/* --- 版本 A 核心：頂部極簡單行卡片 (整合 Breadcrumbs + Tabs) --- */}
            <div className="p-2 sm:p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800/80 backdrop-blur-md flex items-center justify-between gap-2">
              {/* 麵包屑路徑 (0ms 即時切換) */}
              <div className="min-w-0 flex-1">
                <FolderBreadcrumb
                  breadcrumbs={breadcrumbs}
                  onNavigate={handleNavigateBreadcrumb}
                />
              </div>

              {/* 緊湊狀態分頁 (在辦 vs 封存) */}
              <div className="flex items-center bg-slate-950/80 rounded-xl p-0.5 border border-slate-800 flex-shrink-0">
                <button
                  onClick={() => setTab('active')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    tab === 'active'
                      ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]/40 shadow-[0_0_8px_rgba(0,242,254,0.15)]'
                      : 'bg-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  在辦 ({manifests.filter((m) => m.status === 'active').length})
                </button>
                <button
                  onClick={() => setTab('archived')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    tab === 'archived'
                      ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]/40 shadow-[0_0_8px_rgba(0,242,254,0.15)]'
                      : 'bg-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  封存 ({manifests.filter((m) => m.status === 'archived').length})
                </button>
              </div>
            </div>

            {/* --- 版本 A 核心：子目錄橫向膠囊滑動列 (高度僅 34px，釋放 220px 空間) --- */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-medium">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Folder className="w-3.5 h-3.5 text-[#00f2fe]" />
                  <span>
                    {currentFolderId === null ? '主目錄分類' : `${currentFolderObj?.name || '當前'} 子目錄`} ({currentFolders.length})
                  </span>
                </span>

                {/* 右側操作按鈕群 */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setFolderDialogMode('create');
                      setEditingFolder(null);
                      setFolderDialogOpen(true);
                    }}
                    className="flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-[#00f2fe] bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-700/60 transition-all active:scale-95"
                  >
                    <FolderPlus className="w-3 h-3 text-[#00f2fe]" />
                    <span>新增目錄</span>
                  </button>

                  <button
                    onClick={handleStartAiScan}
                    disabled={aiScanning}
                    className="flex items-center gap-1 text-[11px] font-semibold text-[#00f2fe] bg-[#00f2fe]/10 hover:bg-[#00f2fe]/20 px-2.5 py-1 rounded-lg border border-[#00f2fe]/30 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
                  >
                    {aiScanning ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>AI 整理</span>
                    {unclassifiedCount > 0 && currentFolderId === null && (
                      <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#00f2fe] text-slate-950 text-[9px] font-bold">
                        {unclassifiedCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* 橫向膠囊列 (Chips Slider) */}
              {foldersLoading ? (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 animate-pulse">
                  <div className="h-8 w-24 rounded-xl bg-slate-800/80 border border-slate-700/50 flex-shrink-0" />
                  <div className="h-8 w-24 rounded-xl bg-slate-800/80 border border-slate-700/50 flex-shrink-0" />
                  <div className="h-8 w-24 rounded-xl bg-slate-800/80 border border-slate-700/50 flex-shrink-0" />
                </div>
              ) : currentFolders.length > 0 ? (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                  {currentFolders.map((f) => {
                    const isSystemDate = f.folder_type === 'system_date';
                    return (
                      <div
                        key={f.id}
                        onClick={() => handleOpenFolder(f.id)}
                        className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 hover:border-[#00f2fe]/50 text-xs font-medium whitespace-nowrap active:scale-95 cursor-pointer flex-shrink-0 transition-all shadow-sm"
                      >
                        <span className={isSystemDate ? 'text-[#00f2fe]' : 'text-indigo-400'}>
                          {isSystemDate ? '📅' : '📁'}
                        </span>
                        <span className="truncate max-w-[120px]">{f.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-700/80 text-slate-300 font-mono">
                          {f.item_count ?? 0}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-2 px-3 rounded-xl bg-slate-900/50 border border-dashed border-slate-800 text-[11px] text-slate-500">
                  {currentFolderId === null ? '尚無分類目錄，可點右上方「+ 新增目錄」或「AI 整理」' : '此層級無子目錄'}
                </div>
              )}
            </div>

            {/* --- 清單列表區塊 (高度已釋放，首屏直接清晰可見) --- */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-[#00f2fe]" />
                  <span>
                    {currentFolderId === null
                      ? `未分類清單 (${displayedManifests.length})`
                      : `清單項目 (${displayedManifests.length})`}
                  </span>
                </h2>

                {/* 批次切換按鈕（封存/還原/刪除，規範深色背景，杜絕白底） */}
                <div className="flex items-center bg-slate-950/80 rounded-xl p-0.5 border border-slate-800">
                  <button
                    onClick={() => setBatchActionMode('archive')}
                    className={`flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-medium transition-all ${
                      batchActionMode === 'archive'
                        ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]/40 shadow-[0_0_8px_rgba(0,242,254,0.15)]'
                        : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <Save className="w-3 h-3" />
                    <span>{tab === 'active' ? '封存' : '還原'}</span>
                  </button>
                  <button
                    onClick={() => setBatchActionMode('delete')}
                    className={`flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-medium transition-all ${
                      batchActionMode === 'delete'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_8px_rgba(255,75,92,0.15)]'
                        : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>刪除</span>
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="w-7 h-7 text-[#00f2fe] animate-spin" />
                  <p className="text-slate-400 text-xs">載入清單中...</p>
                </div>
              ) : displayedManifests.length === 0 ? (
                <div className="text-center py-10 tech-card border-dashed border-slate-700/80 rounded-2xl space-y-2.5">
                  <Package className="w-9 h-9 text-slate-600 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-slate-300 text-xs sm:text-sm font-medium">
                      {currentFolderId === null
                        ? currentFolders.length > 0
                          ? '根目錄無未分類清單（所有清單皆已歸入目錄）'
                          : '目前沒有可用的清單'
                        : '此目錄內暫無清單'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {currentFolderId === null
                        ? '可點上方膠囊標籤進入各目錄查看清單'
                        : '可將其他目錄清單移動至此處'}
                    </p>
                  </div>
                  {currentFolderId === null && currentFolders.length === 0 && (
                    <Link
                      href="/import"
                      className="tech-button tech-button-primary inline-flex px-4 py-1.5 text-xs font-semibold"
                    >
                      立即匯入清單
                    </Link>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
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
                        className={`tech-card p-3 sm:p-3.5 group hover:border-[#00f2fe]/50 flex items-center justify-between relative ${
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
                          className={`flex items-center gap-3 flex-1 min-w-0 ${
                            isOperationInProgress ? 'pointer-events-none' : ''
                          }`}
                        >
                          <div className="p-2.5 bg-blue-500/10 rounded-xl group-hover:bg-[#00f2fe]/20 transition-all duration-300 shadow-[0_0_12px_rgba(0,242,254,0.12)] flex-shrink-0">
                            {m.status === 'archived' ? (
                              m.cloud_backup ? (
                                <Cloud className="w-4 h-4 text-[#00f2fe]" />
                              ) : (
                                <Package className="w-4 h-4 text-[#ff4b5c]" />
                              )
                            ) : (
                              <Package className="w-4 h-4 text-[#00f2fe]" />
                            )}
                          </div>
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <h3 className="font-semibold text-white text-xs sm:text-sm truncate group-hover:text-[#00f2fe] transition-colors">
                              {m.name}
                            </h3>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
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

                        {/* 右側操作按鈕群 (統一規範：深色背景，杜絕白底) */}
                        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                          {m.storage_size_bytes !== undefined && (
                            <span
                              className={`hidden sm:flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-slate-900/80 ${
                                m.status === 'active' ? 'text-[#00f2fe]' : 'text-gray-400'
                              }`}
                            >
                              <HardDrive className="w-3 h-3" />
                              {formatStorageSize(m.storage_size_bytes)}
                            </span>
                          )}

                          {/* 移動至資料夾按鈕 (顯式深色背景 bg-slate-800，杜絕白底) */}
                          {!isOperationInProgress && (
                            <button
                              onClick={() => handleOpenMoveModal(m.id)}
                              className="p-1.5 rounded-lg bg-slate-800/90 text-slate-300 border border-slate-700/80 hover:text-[#00f2fe] hover:bg-slate-700 active:scale-95 transition-all"
                              title="移動至資料夾"
                            >
                              <FolderInput className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* 封存 / 還原 / 刪除按鈕 */}
                          {m.status === 'active' && !isOperationInProgress && batchActionMode === 'archive' && (
                            <button
                              onClick={() => handleArchive(m.id)}
                              className="p-1.5 rounded-lg text-[#00f2fe] bg-[#00f2fe]/10 border border-[#00f2fe]/30 hover:bg-[#00f2fe]/20 active:scale-95 transition-all"
                              title="封存清單"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {m.status === 'active' && !isOperationInProgress && batchActionMode === 'delete' && (
                            <button
                              onClick={() => setConfirmDeleteId(m.id)}
                              className="p-1.5 rounded-lg text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 active:scale-95 transition-all"
                              title="永久刪除清單"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {m.status === 'archived' && !isOperationInProgress && batchActionMode === 'archive' && (
                            <button
                              onClick={() => handleRestore(m.id)}
                              className="p-1.5 rounded-lg text-[#00f2fe] bg-[#00f2fe]/10 border border-[#00f2fe]/30 hover:bg-[#00f2fe]/20 active:scale-95 transition-all"
                              title="解壓還原"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {m.status === 'archived' && !isOperationInProgress && batchActionMode === 'delete' && (
                            <button
                              onClick={() => setConfirmDeleteId(m.id)}
                              className="p-1.5 rounded-lg text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 active:scale-95 transition-all"
                              title="永久刪除清單"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {!isOperationInProgress && (
                            <Link
                              href={`/scan?manifestId=${m.id}`}
                              className="p-1 text-slate-500 group-hover:text-[#00f2fe] transition-colors"
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
