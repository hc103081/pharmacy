'use client';

import React from 'react';
import { Loader2, HardDrive, ExternalLink, RotateCcw } from 'lucide-react';
import { formatBytes } from '@/lib/utils';

interface B2UsageInfo {
  manifestUsage: number;
  manifestFileCount: number;
  bucketTotalUsage: number;
  bucketTotalFiles: number;
  bucketFreeSpace: number;
}

interface B2UsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  manifestId: string;
}

export function B2UsageModal({ isOpen, onClose, manifestId }: B2UsageModalProps) {
  const [data, setData] = React.useState<B2UsageInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchB2Usage = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/manifests/${manifestId}/b2-usage`);
      const result = await response.json();
      if (result.success && result.data) {
        setData(result.data);
      } else {
        setError(result.error || '取得 B2 容量資訊失敗');
      }
    } catch (err) {
      console.error('[B2UsageModal] Error:', err);
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, [manifestId]);

  React.useEffect(() => {
    if (isOpen) {
      fetchB2Usage();
    }
  }, [isOpen, fetchB2Usage]);

  if (!isOpen) return null;

  const B2_FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024; // 10GB
  const bucketUsedPercent = data ? (data.bucketTotalUsage / B2_FREE_TIER_BYTES) * 100 : 0;
  const bucketFreePercent = Math.max(100 - bucketUsedPercent, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="tech-card p-6 max-w-lg w-full mx-4 animate-in slide-in-from-bottom-4 duration-300 border-[#00f2fe]/50 shadow-[0_0_30px_rgba(0,242,254,0.15)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#00f2fe]/20 flex items-center justify-center">
              <HardDrive className="w-6 h-6 text-[#00f2fe]" />
            </div>
            <h3 className="text-lg font-bold text-white">B2 容量總覽</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors active:scale-95"
            aria-label="關閉 B2 容量總覽"
          >
            <ExternalLink className="w-5 h-5" />
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="w-10 h-10 text-[#00f2fe] animate-spin drop-shadow-[0_0_10px_rgba(0,242,254,0.5)]" />
            <p className="text-slate-400">正在載入 B2 容量資料...</p>
            <div className="w-full h-2 bg-slate-700/30 rounded-full overflow-hidden">
              <div className="w-full h-2 bg-gradient-to-r from-[#00f2fe] to-blue-500 animate-pulse" />
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-[#ff4b5c]/20 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-[#ff4b5c]" />
            </div>
            <p className="text-[#ff4b5c] font-medium">{error}</p>
            <button
              onClick={fetchB2Usage}
              className="px-4 py-2 rounded-lg bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]/30 hover:bg-[#00f2fe]/30 transition-colors active:scale-95 flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              重試
            </button>
          </div>
        )}

        {/* Data Display */}
        {data && !loading && (
          <div className="space-y-5">
            {/* Manifest Usage Card */}
            <div className="tech-card p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 mb-3">
                <HardDrive className="w-4 h-4 text-[#00f2fe]" />
                <span className="font-medium text-white">本清單佔用</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono font-bold text-white">{formatBytes(data.manifestUsage)}</span>
                <span className="text-sm text-slate-500">({data.manifestFileCount} 個檔案)</span>
              </div>
            </div>

            {/* Bucket Total Usage Card */}
            <div className="tech-card p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 mb-3">
                <HardDrive className="w-4 h-4 text-[#00f2fe]" />
                <span className="font-medium text-white">Bucket 總用量</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono font-bold text-white">{formatBytes(data.bucketTotalUsage)}</span>
                <span className="text-sm text-slate-500">({data.bucketTotalFiles} 個檔案)</span>
              </div>
            </div>

            {/* Free Tier Progress */}
            <div className="tech-card p-4 border border-slate-700/50">
              <div className="flex items-center justify-between text-slate-400 mb-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-[#00f2fe]" />
                  <span className="font-medium text-white">免費額度剩餘</span>
                </div>
                <span className={`font-mono ${bucketFreePercent > 20 ? 'text-green-400' : bucketFreePercent > 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {formatBytes(data.bucketFreeSpace)}
                </span>
              </div>
              <div className="w-full h-3 bg-slate-700/30 rounded-full overflow-hidden relative">
                <div
                  className="h-3 rounded-full transition-all duration-1000 relative shadow-[0_0_8px_rgba(0,242,254,0.4)]"
                  style={{
                    width: `${Math.min(bucketUsedPercent, 100)}%`,
                    background: bucketUsedPercent >= 90
                      ? 'linear-gradient(90deg, #ff4b5c, #ff6b7c)'
                      : bucketUsedPercent >= 70
                      ? 'linear-gradient(90deg, #fbbf24, #fcd34d)'
                      : 'linear-gradient(90deg, #00f2fe, #00d4ff)',
                  }}
                >
                  <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-2">
                <span>已使用 {bucketUsedPercent.toFixed(1)}%</span>
                <span>免費 10 GB</span>
              </div>
            </div>

            {/* Refresh Button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={fetchB2Usage}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#00f2fe]/10 text-[#00f2fe] border border-[#00f2fe]/30 hover:bg-[#00f2fe]/20 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-wait"
              >
                <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                重新整理
              </button>
            </div>
          </div>
        )}

        {/* Close Button */}
        <div className="flex justify-end mt-6 pt-4 border-t border-slate-700/30">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors active:scale-95"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}