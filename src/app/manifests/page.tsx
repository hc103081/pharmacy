'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  Package,
  Calendar,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Trash2,
  RefreshCw,
  Save,
  HardDrive,
  CheckCircle2,
  Cloud,
  AlertTriangle,
  ChevronDown,
  Mail,
  HardDrive as HardDriveIcon,
  Folder,
  LogOut,
  X,
  RotateCcw,
} from 'lucide-react';
import { deleteManifest } from '@/app/actions/manifests/archive';
import type { Manifest } from '@/types';
import { TeachingButton } from '@/components/teaching';
import { useManifestOperations } from './hooks/useManifestOperations';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog';
import { OperationProgressModal } from './components/OperationProgressModal';
import { Toaster, toast } from 'sonner';

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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 檢查 Google Drive 連線狀態 - 可重用的函式
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
      const wasConnected = gdriveConnected;
      setGdriveConnected(isConnected);
      
      if (isConnected && data) {
        // Fetch storage quota
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
                  `${window.location.origin}/api/gdrive/token-refresh`,
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
              // Fetch storage quota
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
              
              // If root folder ID is missing, try to ensure/create it
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
          email: data.google_email,
          storageQuota,
          rootFolderId,
          storageQuotaError,
        });
        
        if (showToast && wasConnected !== isConnected) {
          toast.success('Google Drive 連線已建立');
        }
      } else {
        setGdriveDetails(null);
        if (showToast && wasConnected !== isConnected) {
          toast.info('Google Drive 已斷開連線');
        }
      }
    } catch {
      setGdriveConnected(false);
      setGdriveDetails(null);
      if (showToast) {
        toast.error('Google Drive 連線狀態檢查失敗');
      }
    } finally {
      setGdriveLoading(false);
    }
  }, [supabase, gdriveConnected]);

  // 初始檢查
  useEffect(() => {
    checkGdriveConnection();
  }, [checkGdriveConnection]);

  // 定期自動重新整理用量（每 5 分鐘）
  useEffect(() => {
    if (!gdriveConnected) return;
    intervalRef.current = setInterval(() => {
      checkGdriveConnection();
    }, 5 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [gdriveConnected, checkGdriveConnection]);

  // 手動觸發 Google Drive 授權
  const handleGdriveConnect = () => {
        toast.info('正在導向 Google 授權頁面...');
    window.location.href = '/auth/gdrive/connect?prompt=consent';
  };

  // 斷開 Google Drive 連線 - 開啟確認對話框
  const handleGdriveDisconnect = () => {
    setConfirmDisconnect(true);
  };

  // 執行斷開連線
  const executeDisconnect = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setConfirmDisconnect(false);
        return;
      }
      
      const { error } = await supabase
        .from('user_gdrive_connections')
        .delete()
        .eq('user_id', user.id);
      
      if (error) {
        console.error('Disconnect error:', error);
        toast.error('斷開連線失敗');
        setConfirmDisconnect(false);
        return;
      }
      
      setGdriveConnected(false);
      setGdriveDetails(null);
      setGdriveDropdownOpen(false);
      setConfirmDisconnect(false); // 關閉確認對話框
      toast.success('已斷開 Google Drive 連線');
    } catch (error) {
      console.error('Disconnect error:', error);
      toast.error('斷開連線失敗');
      setConfirmDisconnect(false);
    }
  };

  // 關閉下拉選單（點擊外部時）
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (gdriveDropdownOpen) {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-gdrive-dropdown]')) {
          setGdriveDropdownOpen(false);
        }
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [gdriveDropdownOpen]);

  // 格式化儲存容量
  function formatBytes(bytes: string | number): string {
    const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (num === 0) return '0 B';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  // Calculate storage usage for active + local archived manifests
  const localStorageUsage = manifests
    .filter(m => m.status === 'active' || (m.status === 'archived' && !m.cloud_backup))
    .reduce((sum, m) => sum + (m.storage_size_bytes || 0), 0);

  const STORAGE_WARNING_THRESHOLD_MB = 800;
  const STORAGE_CRITICAL_THRESHOLD_MB = 950;
  const storageWarningLevel = localStorageUsage >= STORAGE_CRITICAL_THRESHOLD_MB * 1024 * 1024
    ? 'critical'
    : localStorageUsage >= STORAGE_WARNING_THRESHOLD_MB * 1024 * 1024
      ? 'warning'
      : 'none';

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

  useEffect(() => {
    fetchManifests();
  }, [fetchManifests]);

  return (
    <>
      <div className="h-dvh overflow-hidden flex flex-col bg-[#07142b]">
        {/* Fixed Header */}
        <header className="fixed top-0 left-0 right-0 z-40 bg-[#07142b]/95 backdrop-blur-xl border-b border-slate-800/50">
          <div className="max-w-2xl mx-auto p-4 lg:p-6">
            <div className="flex items-center gap-3">
            <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6 text-slate-400" />
            </Link>
            <h1 className="text-xl lg:text-2xl font-bold text-white">選擇清點清單</h1>
            <TeachingButton module="manifest-management" variant="inline" className="ml-3" />
            {/* Google Drive 狀態圓形按鈕 */}
            {gdriveConnected !== null && (
              <div className="relative ml-auto" data-gdrive-dropdown>
                <button
                  onClick={gdriveConnected
                    ? (e) => { e.stopPropagation(); setGdriveDropdownOpen(!gdriveDropdownOpen); }
                    : handleGdriveConnect}
                  disabled={gdriveConnected === null}
                  aria-label={gdriveConnected
                    ? `Google Drive 已連線（${gdriveDetails?.email}），點擊查看詳情`
                    : 'Google Drive 未連線，點擊授權'}
                  aria-expanded={gdriveDropdownOpen}
                  aria-haspopup="true"
                  className={`
                    flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                    transition-all duration-200 ease-out
                    active:scale-95
                    ${gdriveConnected
                      ? 'bg-[#00f2fe] text-[#07142b] hover:scale-105 hover:shadow-[0_0_12px_rgba(0,242,254,0.6)] cursor-pointer'
                      : 'bg-[#ff4b5c] text-white hover:scale-105 hover:shadow-[0_0_12px_rgba(255,75,92,0.6)] cursor-pointer'
                    }
                  `}
                >
                  <Cloud className="w-4 h-4" />
                  {gdriveConnected && gdriveDropdownOpen && <ChevronDown className="w-3 h-3 ml-1" />}
                </button>
                
                {/* 下拉選單 - 已連線時顯示 */}
                {gdriveConnected && gdriveDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 tech-card border border-[#00f2fe]/30 rounded-xl shadow-[0_0_20px_rgba(0,242,254,0.2)] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150 z-50">
                    <div className="p-3 border-b border-[#00f2fe]/20">
                      <div className="flex items-center gap-2 text-sm">
                        <Cloud className="w-4 h-4 text-[#00f2fe]" />
                        <span className="font-medium text-white">Google Drive 已連線</span>
                      </div>
                    </div>
                    {gdriveDetails ? (
                      <div className="p-3 space-y-3 text-sm">
                        <div className="flex items-center gap-2 text-slate-300">
                          <Mail className="w-4 h-4 text-[#00f2fe] flex-shrink-0" />
                          <span className="truncate">{gdriveDetails.email}</span>
                        </div>
                        {gdriveDetails.storageQuota && (
                          <div className="flex items-center gap-2 text-slate-300">
                            <HardDriveIcon className="w-4 h-4 text-[#00f2fe] flex-shrink-0" />
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <div>
                                <div className="text-xs text-slate-400">儲存空間用量</div>
                                <div className="font-mono text-white">
                                  {formatBytes(gdriveDetails.storageQuota.usage)} / {formatBytes(gdriveDetails.storageQuota.limit)}
                                </div>
                              </div>
                              <button
                                onClick={() => checkGdriveConnection(true)}
                                disabled={gdriveLoading}
                                className="text-xs text-[#00f2fe] hover:underline disabled:opacity-50 disabled:cursor-wait flex items-center gap-1"
                                title="重新整理用量"
                              >
                                <RotateCcw className={`w-3 h-3 ${gdriveLoading ? 'animate-spin' : ''}`} />
                                更新
                              </button>
                            </div>
                          </div>
                        )}
                        {gdriveDetails.storageQuotaError && !gdriveDetails.storageQuota && (
                          <div className="flex items-center gap-2 text-slate-300">
                            <AlertTriangle className="w-4 h-4 text-[#fbbf24] flex-shrink-0" />
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <div className="font-mono text-[#fbbf24] text-xs">{gdriveDetails.storageQuotaError}</div>
                              <button
                                onClick={async () => {
                                  const res = await fetch(`${window.location.origin}/api/gdrive/status`);
                                  if (res.ok) {
                                    const data = await res.json();
                                    setGdriveDetails(prev => prev ? { ...prev, storageQuota: data.storage_quota, storageQuotaError: null } : null);
                                    toast.success('儲存空間用量已更新');
                                  } else {
                                    toast.error('重試失敗');
                                  }
                                }}
                                className="text-xs text-[#00f2fe] hover:underline"
                              >
                                重試
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-slate-300">
                          <Folder className="w-4 h-4 text-[#00f2fe] flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-400">根資料夾 ID</div>
                            {gdriveDetails.rootFolderId ? (
                              <div className="font-mono text-xs text-slate-300 truncate">{gdriveDetails.rootFolderId}</div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-slate-500">尚未建立</span>
                                <button
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`${window.location.origin}/api/gdrive/ensure-root-folder`, { method: 'POST' });
                                      if (res.ok) {
                                        const data = await res.json();
                                        setGdriveDetails(prev => prev ? { ...prev, rootFolderId: data.root_folder_id } : null);
                                        toast.success('根資料夾已建立');
                                      } else {
                                        toast.error('建立根資料夾失敗');
                                      }
                                    } catch {
                                      toast.error('建立根資料夾失敗');
                                    }
                                  }}
                                  className="text-xs text-[#00f2fe] hover:underline"
                                >
                                  重試
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      // 載入骨架屏
                      <div className="p-3 space-y-3">
                        <div className="h-4 bg-slate-700/50 rounded w-3/4 animate-pulse" />
                        <div className="h-4 bg-slate-700/50 rounded w-1/2 animate-pulse" />
                        <div className="h-4 bg-slate-700/50 rounded w-1/3 animate-pulse" />
                      </div>
                    )}
                    <div className="p-3 border-t border-[#00f2fe]/20">
                      <button
                        onClick={handleGdriveDisconnect}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[#ff4b5c] bg-[#ff4b5c]/10 border border-[#ff4b5c]/20 hover:bg-[#ff4b5c]/20 hover:shadow-[0_0_8px_rgba(255,75,92,0.3)] transition-all"
                      >
                        <LogOut className="w-4 h-4" />
                        斷開連線
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {gdriveConnected === null && (
              <button
                disabled
                aria-label="Google Drive 連線狀態檢查中"
                className="ml-auto flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-slate-600 text-slate-400 cursor-wait"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
              </button>
            )}
          </div>
        </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 min-h-0 overflow-y-auto pt-20 pb-4 lg:pt-24 lg:pb-6 px-4 lg:px-6">
          <div className="max-w-2xl mx-auto space-y-5 lg:space-y-6">

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

          {/* Storage Warning Banner */}
          {storageWarningLevel !== 'none' && (
            <div className={`flex items-center gap-3 p-4 rounded-xl border ${
              storageWarningLevel === 'critical'
                ? 'bg-[#ff4b5c]/10 border-[#ff4b5c]/30 text-[#ff4b5c]'
                : 'bg-[#fbbf24]/10 border-[#fbbf24]/30 text-[#fbbf24]'
            } animate-in slide-in-from-top-2 duration-300`}>
              <div className="flex-shrink-0">
                {storageWarningLevel === 'critical' ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">
                  {storageWarningLevel === 'critical'
                    ? '儲存空間接近上限'
                    : '儲存空間即將滿載'}
                </p>
                <p className="text-xs opacity-80 mt-0.5">
                  本地佔用 {formatStorageSize(localStorageUsage)} / 1024 MB
                  {storageWarningLevel === 'critical' ? '，請盡快封存其他清單釋放空間' : ''}
                </p>
              </div>
            </div>
          )}

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
                      operationProgress.status === 'restoring' ||
                      operationProgress.status === 'gdrive_pull');
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
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#162a56]/60 backdrop-blur-sm overflow-hidden">
                {/* 掃描光帶 */}
                <div className={`scan-beam ${operationProgress?.status === 'archiving' ? 'scan-archive-beam' : 'scan-restore-beam'}`} />
                <div className="relative z-10 flex items-center gap-3 px-5 py-2.5 bg-slate-900/80 rounded-xl border border-[#00f2fe]/40 shadow-[0_0_20px_rgba(0,242,254,0.3)]">
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
                            m.cloud_backup ? (
                              <Cloud className="w-6 h-6 text-[#00f2fe]" />
                            ) : (
                              <Package className="w-6 h-6 text-[#ff4b5c]" />
                            )
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
          <DeleteConfirmDialog
            isOpen={!!confirmDeleteId}
            onClose={() => setConfirmDeleteId(null)}
            onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
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

          {/* Toast 通知 */}
          <Toaster position="bottom-right" theme="dark" />
        </div>
      </main>
    </div>
    </>
  );
}
