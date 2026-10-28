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
  MoreVertical,
  Search,
  X,
  FileText,
  CheckSquare,
  Square,
  Globe,
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
import { FolderActionModal } from './components/FolderActionModal';
import { PaperJumpModal } from './components/PaperJumpModal';
import { BatchActionBar } from './components/BatchActionBar';
import { calculateRecursiveFolderCount, calculatePaperPages } from '@/lib/folderUtils';
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
const LAST_VISITED_FOLDER_KEY = 'phama_last_visited_folder_id';

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
  const [operationProgress, setOperationProgress] = useState<{
    manifestId: string;
    status: 'archiving' | 'restoring' | 'gdrive_pull' | 'completed' | 'error';
    message: string;
    progress?: number;
  } | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [archiveAllLoading, setArchiveAllLoading] = useState(false);
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

  // --- SWR 0ms 本地快取資料夾狀態 (支援記錄與自動恢復最近開啟路徑) ---
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlFolderId = params.get('folderId');
        if (urlFolderId) return urlFolderId;

        const saved = localStorage.getItem(LAST_VISITED_FOLDER_KEY);
        if (saved && saved !== 'null' && saved.trim() !== '') {
          return saved;
        }
      } catch {
        // ignore
      }
    }
    return null;
  });
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
  const [actionModalFolder, setActionModalFolder] = useState<ManifestFolder | null>(null);
  const [activeMenuManifestId, setActiveMenuManifestId] = useState<string | null>(null);

  // --- 新增四大功能狀態 ---
  // 1. 單號與條碼即時搜尋
  const [searchTerm, setSearchTerm] = useState('');
  const [searchScope, setSearchScope] = useState<'current' | 'all'>('current');

  // 2. 多選批次模式
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedManifestIds, setSelectedManifestIds] = useState<Set<string>>(new Set());

  // 3. 紙本對位頁次直達 Modal
  const [paperJumpManifest, setPaperJumpManifest] = useState<Manifest | null>(null);

  // 監聽全局點擊以立即收合清單更多操作選單 (解決 CSS containing block 與手機端遮罩失效問題)
  useEffect(() => {
    if (!activeMenuManifestId) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest('[data-manifest-menu]')) {
        setActiveMenuManifestId(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [activeMenuManifestId]);

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
                  if (quotaData.storageQuota) {
                    storageQuota = {
                      limit: quotaData.storageQuota.limit || '0',
                      usage: quotaData.storageQuota.usage || '0',
                    };
                  }
                }
              } catch {
                // Ignore quota error
              }
            }
          } catch {
            storageQuotaError = '無法取得儲存容量';
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

  // 1. 取得清單資料 (單次批次，支援聚合清點項目數)
  const fetchManifests = useCallback(async () => {
    setLoading(true);
    try {
      // 嘗試關聯查詢 drug_items(counted_status) 聚合進度
      const { data, error } = await supabase
        .from('manifests')
        .select('*, drug_items(counted_status)')
        .order('created_at', { ascending: false });

      if (error) {
        // 若關聯失敗，安全 Fallback 至基本查詢
        const fallbackRes = await supabase
          .from('manifests')
          .select('*')
          .order('created_at', { ascending: false });
        if (fallbackRes.error) throw fallbackRes.error;
        setManifests(fallbackRes.data || []);
      } else if (data) {
        const formatted = data.map((m: any) => {
          const completedCount = Array.isArray(m.drug_items)
            ? m.drug_items.filter((d: any) => d.counted_status === 'completed').length
            : (m.completed_items ?? 0);
          return {
            ...m,
            completed_items: completedCount,
          };
        });
        setManifests(formatted);
      }
    } catch (error) {
      console.error('Error fetching manifests:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // 2. 一次性取得所有資料夾 (SWR 優先直連 + 本地持久化快取)
  const fetchAllFolders = useCallback(async () => {
    try {
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

  // 當前層級下的子資料夾：直接從 allFolders 篩選並遞迴計算包含子樹狀的所有清單總數，0 毫秒即時響應
  const currentFolders = useMemo(() => {
    return allFolders
      .filter((f) => (currentFolderId === null ? !f.parent_id : f.parent_id === currentFolderId))
      .map((f) => {
        const recursiveItemCount = calculateRecursiveFolderCount(f.id, allFolders, manifests);
        const subfolderCount = allFolders.filter((sub) => sub.parent_id === f.id).length;
        return {
          ...f,
          item_count: recursiveItemCount,
          subfolder_count: subfolderCount,
        };
      });
  }, [allFolders, currentFolderId, manifests]);

  // 未分類清單數量
  const unclassifiedCount = useMemo(() => {
    return manifests.filter((m) => !m.folder_id).length;
  }, [manifests]);

  // 資料夾 Map (供全域搜尋時標註目錄名稱)
  const folderNameMap = useMemo(() => {
    return new Map(allFolders.map(f => [f.id, f.name]));
  }, [allFolders]);

  // 搜尋與篩選邏輯
  const trimmedSearch = searchTerm.trim().toLowerCase();

  const scopedManifests = useMemo(() => {
    if (trimmedSearch && searchScope === 'all') {
      return manifests;
    }
    if (currentFolderId === null) {
      return manifests.filter((m) => !m.folder_id);
    }
    return manifests.filter((m) => m.folder_id === currentFolderId);
  }, [manifests, currentFolderId, trimmedSearch, searchScope]);

  const displayedManifests = useMemo(() => {
    if (!trimmedSearch) return scopedManifests;
    return scopedManifests.filter((m) => {
      const nameMatch = m.name?.toLowerCase().includes(trimmedSearch);
      const orderMatch = m.order_number?.toLowerCase().includes(trimmedSearch);
      return nameMatch || orderMatch;
    });
  }, [scopedManifests, trimmedSearch]);

  // 全域符合搜尋的總數（當前目錄為 0 時提示引導）
  const globalSearchMatches = useMemo(() => {
    if (!trimmedSearch || searchScope === 'all') return 0;
    return manifests.filter((m) => {
      const nameMatch = m.name?.toLowerCase().includes(trimmedSearch);
      const orderMatch = m.order_number?.toLowerCase().includes(trimmedSearch);
      return nameMatch || orderMatch;
    }).length;
  }, [manifests, trimmedSearch, searchScope]);

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

  // --- 資料夾路徑統一處理 (同步持久化至 localStorage 與 URL query) ---
  const updateCurrentFolder = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
    if (typeof window !== 'undefined') {
      try {
        if (folderId) {
          localStorage.setItem(LAST_VISITED_FOLDER_KEY, folderId);
          const url = new URL(window.location.href);
          url.searchParams.set('folderId', folderId);
          window.history.replaceState({}, '', url.toString());
        } else {
          localStorage.removeItem(LAST_VISITED_FOLDER_KEY);
          const url = new URL(window.location.href);
          url.searchParams.delete('folderId');
          window.history.replaceState({}, '', url.toString());
        }
      } catch {
        // ignore
      }
    }
  }, []);

  // 驗證當前資料夾存在性：若記錄的資料夾已不存在，安全自動退回根目錄
  useEffect(() => {
    if (currentFolderId && allFolders.length > 0 && !foldersLoading) {
      const exists = allFolders.some((f) => f.id === currentFolderId);
      if (!exists) {
        updateCurrentFolder(null);
      }
    }
  }, [currentFolderId, allFolders, foldersLoading, updateCurrentFolder]);

  // --- 資料夾動作處理 (即時切換，零延遲) ---
  const handleOpenFolder = (folderId: string) => {
    updateCurrentFolder(folderId);
  };

  const handleNavigateBreadcrumb = (folderId: string | null) => {
    updateCurrentFolder(folderId);
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

  const handleTriggerRename = (folder: ManifestFolder) => {
    setEditingFolder(folder);
    setFolderDialogMode('rename');
    setFolderDialogOpen(true);
  };

  const handleTriggerDelete = (folder: ManifestFolder) => {
    setDeletingFolder(folder);
  };

  const handleConfirmDeleteFolder = async () => {
    if (!deletingFolder) return;
    const res = await deleteFolder(deletingFolder.id);
    if (!res.success) {
      toast.error(res.error || '刪除資料夾失敗');
      return;
    }
    toast.success(`已刪除資料夾「${deletingFolder.name}」，內含清單已移至未分類`);
    if (currentFolderId === deletingFolder.id) {
      updateCurrentFolder(deletingFolder.parent_id ?? null);
    }
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
    setSelectedManifestIds(new Set());
    setIsBatchMode(false);
    await fetchManifests();
    await fetchAllFolders();
  };

  // --- 多選批次動作處理 ---
  const handleToggleSelect = (id: string) => {
    setSelectedManifestIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAllSelected = displayedManifests.length > 0 && selectedManifestIds.size === displayedManifests.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedManifestIds(new Set());
    } else {
      setSelectedManifestIds(new Set(displayedManifests.map(m => m.id)));
    }
  };

  const handleBatchMove = () => {
    if (selectedManifestIds.size === 0) return;
    setTargetMoveManifestIds(Array.from(selectedManifestIds));
    setMoveToModalOpen(true);
  };

  const handleBatchArchive = async () => {
    const ids = Array.from(selectedManifestIds);
    const activeIds = manifests.filter(m => ids.includes(m.id) && m.status === 'active').map(m => m.id);
    if (activeIds.length === 0) {
      toast.info('所選清單中無在辦清單');
      return;
    }

    const toastId = toast.loading(`批次封存中 (0/${activeIds.length})...`);
    let successCount = 0;
    for (let i = 0; i < activeIds.length; i++) {
      try {
        const res = await fetch('/api/manifest-operation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'archive', manifestId: activeIds[i] }),
        });
        if (res.ok) successCount++;
      } catch (e) {
        console.error('Batch archive error:', e);
      }
      toast.loading(`批次封存中 (${i + 1}/${activeIds.length})...`, { id: toastId });
    }
    toast.success(`成功封存 ${successCount} 份清單`, { id: toastId });
    setSelectedManifestIds(new Set());
    setIsBatchMode(false);
    await fetchManifests();
  };

  const handleBatchRestore = async () => {
    const ids = Array.from(selectedManifestIds);
    const archivedIds = manifests.filter(m => ids.includes(m.id) && m.status === 'archived').map(m => m.id);
    if (archivedIds.length === 0) {
      toast.info('所選清單中無已封存清單');
      return;
    }

    const toastId = toast.loading(`批次還原中 (0/${archivedIds.length})...`);
    let successCount = 0;
    for (let i = 0; i < archivedIds.length; i++) {
      try {
        const res = await fetch('/api/manifest-operation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'restore', manifestId: archivedIds[i] }),
        });
        if (res.ok) successCount++;
      } catch (e) {
        console.error('Batch restore error:', e);
      }
      toast.loading(`批次還原中 (${i + 1}/${archivedIds.length})...`, { id: toastId });
    }
    toast.success(`成功還原 ${successCount} 份清單`, { id: toastId });
    setSelectedManifestIds(new Set());
    setIsBatchMode(false);
    await fetchManifests();
  };

  const selectedList = useMemo(() => {
    return manifests.filter(m => selectedManifestIds.has(m.id));
  }, [manifests, selectedManifestIds]);

  const hasActiveSelected = useMemo(() => {
    return selectedList.some(m => m.status === 'active');
  }, [selectedList]);

  const hasArchivedSelected = useMemo(() => {
    return selectedList.some(m => m.status === 'archived');
  }, [selectedList]);

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
  const currentFolder = allFolders.find((f) => f.id === currentFolderId) || null;

  return (
    <>
      <div className="h-dvh overflow-hidden flex flex-col bg-[#07142b]">
        {/* Header: 置頂於 Flex 容器頂部，不使用 fixed，確保自然排列且永遠不遮蔽下方 UI */}
        <header className="flex-shrink-0 z-30 bg-[#07142b]/95 backdrop-blur-xl border-b border-slate-800/50">
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

        {/* Scrollable Content (純滾動容器，水平 padding 移入內層，杜絕行動端捲軸吞噬 padding-right 導致切邊) */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="max-w-3xl mx-auto px-4 sm:px-5 lg:px-6 py-3.5 sm:py-4 pb-24 space-y-3">

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

            {/* --- 頂部路徑麵包屑 (全寬度 100% 展開，0ms 即時切換) --- */}
            <div className="p-2 sm:p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800/80 backdrop-blur-md flex items-center">
              <div className="min-w-0 flex-1 overflow-x-auto no-scrollbar">
                <FolderBreadcrumb
                  breadcrumbs={breadcrumbs}
                  onNavigate={handleNavigateBreadcrumb}
                />
              </div>
            </div>

            {/* --- 子目錄橫向膠囊滑動列 (高度僅 34px，釋放空間) --- */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-medium">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Folder className="w-3.5 h-3.5 text-[#00f2fe] flex-shrink-0" />
                  <span className="text-slate-300 truncate font-semibold">
                    {currentFolderId === null ? '主目錄分類' : `${currentFolderObj?.name || '當前'} 子目錄`}
                  </span>
                  <span className="text-slate-500 text-[11px] flex-shrink-0">
                    ({currentFolders.length})
                  </span>

                  {/* 若在子目錄中，提供當前目錄管理快捷按鈕 */}
                  {currentFolder && (
                    <button
                      onClick={() => setActionModalFolder(currentFolder)}
                      className="ml-1 p-1 rounded-md text-slate-400 hover:text-[#00f2fe] bg-slate-800/80 hover:bg-slate-700 transition-colors border border-slate-700/60"
                      title="管理當前目錄 (重新命名 / 刪除)"
                      aria-label="管理當前目錄"
                    >
                      <MoreVertical className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* 右側操作按鈕群 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      setFolderDialogMode('create');
                      setEditingFolder(null);
                      setFolderDialogOpen(true);
                    }}
                    className="flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-[#00f2fe] bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-700/60 transition-all active:scale-95 whitespace-nowrap"
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
                        className="group flex items-center rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 hover:border-[#00f2fe]/50 text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all shadow-sm overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenFolder(f.id)}
                          className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-transparent text-slate-200 active:scale-95 transition-transform"
                        >
                          <span className={isSystemDate ? 'text-[#00f2fe]' : 'text-indigo-400'}>
                            {isSystemDate ? '📅' : '📁'}
                          </span>
                          <span className="truncate max-w-[120px]">{f.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-700/80 text-slate-300 font-mono">
                            {f.item_count ?? 0}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionModalFolder(f);
                          }}
                          className="pr-2.5 pl-1.5 py-1.5 bg-transparent text-slate-400 hover:text-[#00f2fe] hover:bg-slate-700/80 transition-colors border-l border-slate-700/60"
                          title={`管理目錄「${f.name}」`}
                          aria-label={`管理目錄「${f.name}」`}
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
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

            {/* --- 即時搜尋與範圍切換列 (兩端精確對齊，搜尋範圍隨時可見，絕不撐破螢幕) --- */}
            <div className="space-y-1.5 pt-1 w-full min-w-0">
              <div className="flex items-center gap-2 w-full min-w-0">
                {/* 搜尋輸入框 */}
                <div className="relative min-w-0 flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜尋單號、清單名稱..."
                    className="w-full pl-8 pr-7 py-2 rounded-xl bg-slate-900/90 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00f2fe] focus:shadow-[0_0_15px_rgba(0,242,254,0.3)] transition-all box-border"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-white"
                      aria-label="清除搜尋關鍵字"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 常態顯示的搜尋範圍切換按鈕 (右側對齊，點擊即切換) */}
                <button
                  type="button"
                  onClick={() => setSearchScope((prev) => (prev === 'current' ? 'all' : 'current'))}
                  className={`flex-shrink-0 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-semibold transition-all active:scale-95 whitespace-nowrap ${
                    searchScope === 'all'
                      ? 'bg-[#00f2fe]/20 text-[#00f2fe] border-[#00f2fe]/50 shadow-[0_0_8px_rgba(0,242,254,0.25)]'
                      : 'bg-slate-800 text-slate-300 border-slate-700/80 hover:text-white'
                  }`}
                  title={searchScope === 'all' ? '切換為僅搜尋當前目錄' : '切換為搜尋全域所有清單'}
                >
                  <Globe className="w-3.5 h-3.5 text-[#00f2fe]" />
                  <span className="hidden sm:inline">{searchScope === 'all' ? '全域清單' : '當前目錄'}</span>
                  <span className="sm:hidden">{searchScope === 'all' ? '全域' : '目錄'}</span>
                </button>
              </div>

              {/* 跨目錄搜尋友善提示 */}
              {trimmedSearch && searchScope === 'current' && displayedManifests.length === 0 && globalSearchMatches > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 animate-in fade-in duration-200">
                  <span className="truncate">當前目錄無相符項目，其他目錄有 {globalSearchMatches} 筆</span>
                  <button
                    type="button"
                    onClick={() => setSearchScope('all')}
                    className="text-[#00f2fe] font-semibold underline underline-offset-2 ml-2 hover:text-white whitespace-nowrap flex-shrink-0"
                  >
                    切換全域
                  </button>
                </div>
              )}
            </div>

            {/* --- 清單列表區塊 --- */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold text-slate-400 tracking-wider uppercase flex items-center gap-1.5 min-w-0">
                  <Package className="w-3.5 h-3.5 text-[#00f2fe] flex-shrink-0" />
                  <span className="truncate">
                    {trimmedSearch
                      ? `搜尋結果 (${displayedManifests.length})`
                      : currentFolderId === null
                        ? `未分類清單 (${displayedManifests.length})`
                        : `清單項目 (${displayedManifests.length})`}
                  </span>
                </h2>

                {/* 右側：批次選取開關按鈕 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {displayedManifests.length > 0 && !isBatchMode && (
                    <span className="hidden sm:inline text-[11px] text-slate-500 font-mono">
                      共 {displayedManifests.reduce((sum, m) => sum + (m.total_items || 0), 0)} 項
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsBatchMode(!isBatchMode);
                      if (isBatchMode) setSelectedManifestIds(new Set());
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all active:scale-95 whitespace-nowrap ${
                      isBatchMode
                        ? 'bg-[#00f2fe] text-slate-950 border-[#00f2fe] shadow-[0_0_10px_rgba(0,242,254,0.4)]'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:text-white hover:border-slate-600'
                    }`}
                    title="切換多選批次管理模式"
                  >
                    <CheckSquare className="w-3 h-3" />
                    <span>{isBatchMode ? '退出批次' : '批次選取'}</span>
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
                      {trimmedSearch
                        ? `查無符合「${searchTerm}」的清單`
                        : currentFolderId === null
                          ? currentFolders.length > 0
                            ? '根目錄無未分類清單（所有清單皆已歸入目錄）'
                            : '目前沒有可用的清單'
                          : '此目錄內暫無清單'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {trimmedSearch
                        ? '請嘗試使用其他關鍵字搜尋或切換全域搜尋'
                        : currentFolderId === null
                          ? '可點上方膠囊標籤進入各目錄查看清單'
                          : '可將其他目錄清單移動至此處'}
                    </p>
                  </div>
                  {trimmedSearch && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs border border-slate-700 transition-colors"
                    >
                      清除搜尋關鍵字
                    </button>
                  )}
                  {!trimmedSearch && currentFolderId === null && currentFolders.length === 0 && (
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
                    const isArchived = m.status === 'archived';
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

                    // 實體紙本 44 項對位換算 (Requirement 4)
                    const { totalPages: paperPagesCount } = calculatePaperPages(m.total_items);

                    // 盤點進度百分比 (Requirement 3)
                    const totalDrugCount = m.total_items || 0;
                    const completedDrugCount = m.completed_items ?? 0;
                    const progressPercent =
                      totalDrugCount > 0
                        ? Math.min(100, Math.round((completedDrugCount / totalDrugCount) * 100))
                        : 0;
                    const isFullyCompleted = totalDrugCount > 0 && completedDrugCount >= totalDrugCount;

                    // 多選狀態
                    const isSelected = selectedManifestIds.has(m.id);

                    return (
                      <div
                        key={m.id}
                        className={`p-3 sm:p-3.5 group rounded-2xl flex flex-col gap-2 relative transition-all duration-300 ${
                          activeMenuManifestId === m.id ? 'z-30' : 'z-0'
                        } ${
                          isSelected
                            ? 'bg-[#162a56]/80 border-2 border-[#00f2fe] shadow-[0_0_15px_rgba(0,242,254,0.25)]'
                            : isArchived
                              ? 'bg-[repeating-linear-gradient(-45deg,#0b162c,#0b162c_8px,#091224_8px,#091224_16px)] border border-dashed border-slate-700/80 opacity-75 hover:opacity-100 hover:border-slate-600'
                              : 'tech-card hover:border-[#00f2fe]/50'
                        } ${
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

                        {/* 卡片上層：勾選框 + 主資訊 + 操作按鈕 */}
                        <div className="flex items-center justify-between gap-2.5">
                          {/* 多選模式勾選框 */}
                          {isBatchMode && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelect(m.id);
                              }}
                              className="p-1 flex-shrink-0 cursor-pointer"
                              aria-label={isSelected ? '取消選取' : '選取'}
                            >
                              <div
                                className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                                  isSelected
                                    ? 'bg-[#00f2fe] border-[#00f2fe] text-slate-950 shadow-[0_0_8px_rgba(0,242,254,0.5)]'
                                    : 'border-slate-600 bg-slate-800/80 hover:border-slate-400'
                                }`}
                              >
                                {isSelected && <CheckSquare className="w-3.5 h-3.5 stroke-[2.5]" />}
                              </div>
                            </button>
                          )}

                          {/* 清單卡片主體跳轉連結 */}
                          <Link
                            href={isBatchMode ? '#' : `/scan?manifestId=${m.id}`}
                            onClick={(e) => {
                              if (isBatchMode) {
                                e.preventDefault();
                                handleToggleSelect(m.id);
                              }
                            }}
                            className={`flex items-center gap-3 flex-1 min-w-0 ${
                              isOperationInProgress ? 'pointer-events-none' : ''
                            }`}
                          >
                            <div
                              className={`p-2.5 rounded-xl transition-all duration-300 flex-shrink-0 ${
                                isArchived
                                  ? 'bg-slate-800/80 text-slate-500 border border-slate-700/60'
                                  : 'bg-blue-500/10 text-[#00f2fe] group-hover:bg-[#00f2fe]/20 shadow-[0_0_12px_rgba(0,242,254,0.12)]'
                              }`}
                            >
                              {isArchived ? (
                                m.cloud_backup ? (
                                  <Cloud className="w-4 h-4 text-slate-400" />
                                ) : (
                                  <Package className="w-4 h-4 text-slate-500" />
                                )
                              ) : (
                                <Package className="w-4 h-4 text-[#00f2fe]" />
                              )}
                            </div>
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <h3
                                className={`font-semibold text-xs sm:text-sm truncate transition-colors ${
                                  isArchived
                                    ? 'text-slate-400 group-hover:text-slate-200'
                                    : 'text-white group-hover:text-[#00f2fe]'
                                }`}
                              >
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

                                {/* 紙本對位指示 (Requirement 4) */}
                                {paperPagesCount > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="text-slate-300 flex items-center gap-1">
                                      <FileText className="w-3 h-3 text-indigo-400" />
                                      紙本共 {paperPagesCount} 頁
                                    </span>
                                  </>
                                )}

                                {/* 全域搜尋時標註所屬資料夾名稱 */}
                                {searchScope === 'all' && m.folder_id && (
                                  <>
                                    <span>•</span>
                                    <span className="text-slate-400 flex items-center gap-1">
                                      <Folder className="w-3 h-3 text-[#00f2fe]" />
                                      {folderNameMap.get(m.folder_id) || '目錄'}
                                    </span>
                                  </>
                                )}

                                {isArchived && (
                                  <>
                                    <span>•</span>
                                    {m.cloud_backup ? (
                                      <span className="flex items-center gap-1 text-slate-400">
                                        <Cloud className="w-3 h-3" />
                                        已封存（雲端）
                                      </span>
                                    ) : (
                                      <span className="text-slate-500">已封存（本地）</span>
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
                                className={`hidden sm:flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-slate-900/80 ${
                                  isArchived ? 'text-gray-400' : 'text-[#00f2fe]'
                                }`}
                              >
                                <HardDrive className="w-3 h-3" />
                                {formatStorageSize(m.storage_size_bytes)}
                              </span>
                            )}

                            {/* 原地切換狀態膠囊按鈕 (在辦 vs 封存) */}
                            {!isOperationInProgress && !isBatchMode && (
                              <button
                                onClick={() => (isArchived ? handleRestore(m.id) : handleArchive(m.id))}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all active:scale-95 whitespace-nowrap ${
                                  isArchived
                                    ? 'bg-slate-800/90 text-slate-400 border border-slate-700 hover:text-[#00f2fe] hover:border-[#00f2fe]/40'
                                    : 'bg-[#00f2fe]/15 text-[#00f2fe] border border-[#00f2fe]/40 shadow-[0_0_8px_rgba(0,242,254,0.15)] hover:bg-[#00f2fe]/25'
                                }`}
                                title={isArchived ? '點擊還原為在辦清單' : '點擊封存此清單'}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isArchived ? 'bg-slate-500' : 'bg-[#00f2fe] shadow-[0_0_6px_#00f2fe]'
                                  }`}
                                />
                                <span>{isArchived ? '封存' : '在辦'}</span>
                              </button>
                            )}

                            {/* 3個點更多操作按鈕 */}
                            {!isOperationInProgress && !isBatchMode && (
                              <div className="relative" data-manifest-menu="true">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setActiveMenuManifestId(activeMenuManifestId === m.id ? null : m.id);
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-800/90 text-slate-400 hover:text-white border border-slate-700/80 hover:bg-slate-700 active:scale-95 transition-all"
                                  title="更多操作"
                                  aria-label="更多操作"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>

                                {activeMenuManifestId === m.id && (
                                  <div className="absolute right-0 top-full mt-1.5 w-40 py-1 bg-[#0d1d3a] border border-slate-700 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl">
                                    {/* 紙本對位分頁跳轉 (Requirement 4) */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setActiveMenuManifestId(null);
                                        setPaperJumpManifest(m);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors text-left"
                                    >
                                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                                      <span>紙本分頁直達</span>
                                    </button>

                                    {/* 移動目錄 */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setActiveMenuManifestId(null);
                                        handleOpenMoveModal(m.id);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors text-left border-t border-slate-800/80"
                                    >
                                      <FolderInput className="w-3.5 h-3.5 text-[#00f2fe]" />
                                      <span>移動目錄</span>
                                    </button>

                                    {/* 刪除清單 */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setActiveMenuManifestId(null);
                                        setConfirmDeleteId(m.id);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-left border-t border-slate-800/80"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                      <span>刪除清單</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {!isOperationInProgress && !isBatchMode && (
                              <Link
                                href={`/scan?manifestId=${m.id}`}
                                className="p-1 text-slate-500 group-hover:text-[#00f2fe] transition-colors"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </Link>
                            )}
                          </div>
                        </div>

                        {/* 卡片下層：微型進度條 (Mini Progress Bar, Requirement 2) */}
                        {totalDrugCount > 0 && (
                          <div className="pt-1 space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">
                                盤點進度{' '}
                                <span className="font-mono text-slate-200 font-semibold">
                                  {completedDrugCount}
                                </span>{' '}
                                / {totalDrugCount} 項
                              </span>
                              <span
                                className={`font-mono font-bold ${
                                  isFullyCompleted
                                    ? 'text-emerald-400'
                                    : progressPercent > 0
                                      ? 'text-[#00f2fe]'
                                      : 'text-slate-500'
                                }`}
                              >
                                {progressPercent}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-800/90 rounded-full overflow-hidden border border-slate-700/40">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  isFullyCompleted
                                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                                    : progressPercent > 0
                                      ? 'bg-gradient-to-r from-blue-500 to-[#00f2fe] shadow-[0_0_8px_rgba(0,242,254,0.4)]'
                                      : 'bg-transparent'
                                }`}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* --- 對話框與彈窗組件 --- */}

            {/* 紙本分頁跳轉直達 Modal (Requirement 4) */}
            <PaperJumpModal
              isOpen={!!paperJumpManifest}
              manifest={paperJumpManifest}
              onClose={() => setPaperJumpManifest(null)}
            />

            {/* 移動清單 Modal */}
            <MoveToFolderModal
              isOpen={moveToModalOpen}
              onClose={() => setMoveToModalOpen(false)}
              manifestIds={targetMoveManifestIds}
              currentFolderId={currentFolderId}
              onConfirmMove={handleConfirmMove}
            />

            {/* 資料夾操作選單 Modal (重新命名 / 刪除) */}
            <FolderActionModal
              isOpen={!!actionModalFolder}
              folder={actionModalFolder}
              isCurrentFolder={actionModalFolder?.id === currentFolderId}
              onClose={() => setActionModalFolder(null)}
              onOpenFolder={(folderId) => handleOpenFolder(folderId)}
              onRename={handleTriggerRename}
              onDelete={handleTriggerDelete}
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

        {/* 多選批次操作浮動列 (Requirement 3) */}
        {isBatchMode && (
          <BatchActionBar
            selectedCount={selectedManifestIds.size}
            totalCount={displayedManifests.length}
            isAllSelected={isAllSelected}
            onToggleSelectAll={handleToggleSelectAll}
            onMoveSelected={handleBatchMove}
            onArchiveSelected={handleBatchArchive}
            onRestoreSelected={handleBatchRestore}
            onExitBatchMode={() => {
              setIsBatchMode(false);
              setSelectedManifestIds(new Set());
            }}
            hasActiveSelected={hasActiveSelected}
            hasArchivedSelected={hasArchivedSelected}
          />
        )}
      </div>
    </>
  );
}
