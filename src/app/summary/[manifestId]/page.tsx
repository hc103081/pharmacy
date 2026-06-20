'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeft, 
  FileText,
  Loader2,
  CheckCircle
} from 'lucide-react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import type { SummaryDrugItem, Manifest } from '@/types';
import { TeachingButton } from '@/components/teaching';

export default function SummaryPage() {
  const params = useParams();
  const manifestId = params.manifestId as string;
  const router = useRouter();
  const supabase = createClient();

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [allDrugs, setAllDrugs] = useState<SummaryDrugItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [operationProgress, setOperationProgress] = useState<{
    manifestId: string;
    status: 'archiving' | 'restoring' | 'completed' | 'error';
    message: string;
    progress?: number;
  } | null>(null);
  const operationEventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!manifestId) return;
      setLoading(true);
      try {
        const { data: mData } = await supabase
          .from('manifests')
          .select('*')
          .eq('id', manifestId)
          .single();
        
        setManifest(mData);

        const { data: dData } = await supabase
          .from('drug_items')
          .select('id, barcode, name, expected_quantity, bonus_quantity, actual_quantity, counted_status')
          .eq('manifest_id', manifestId);
        
        setAllDrugs(dData || []);
      } catch (error) {
        console.error('Load Summary Error:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [manifestId]);

  const { completedCount, errorCount, pendingCount, exceptions } = allDrugs.reduce(
    (acc, d) => {
      if (d.counted_status === 'completed') {
        acc.completedCount++;
      } else {
        if (d.counted_status === 'error') acc.errorCount++;
        else acc.pendingCount++;
        acc.exceptions.push(d);
      }
      return acc;
    },
    { completedCount: 0, errorCount: 0, pendingCount: 0, exceptions: [] as SummaryDrugItem[] }
  );
  const progress = manifest ? Math.round((completedCount / manifest.total_items) * 100) : 0;

  const startZIPArchive = async () => {
    // Close any existing event source
    if (operationEventSourceRef.current) {
      operationEventSourceRef.current.close();
    }

    // Set initial progress
    setOperationProgress({
      manifestId,
      status: 'archiving',
      message: '封存中...',
    });

    try {
      const eventSource = new EventSource(
        `${window.location.origin}/api/manifest-operation?operation=archive&manifestId=${manifestId}`,
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
            // Operation finished, redirect to manifests list after a short delay
            setTimeout(() => {
              router.push('/manifests');
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
          router.push('/manifests');
          setOperationProgress(null);
        }, 1500);
        eventSource.close();
        operationEventSourceRef.current = null;
      };
    } catch (err) {
      console.error('Failed to start archive operation:', err);
      setOperationProgress(prev => {
        if (!prev || prev.manifestId !== manifestId) return prev;
        return {
          ...prev,
          status: 'error',
          message: err instanceof Error ? err.message : '未知錯誤',
        };
      });
      setTimeout(() => {
        router.push('/manifests');
        setOperationProgress(null);
      }, 1500);
    }
  };

  const handleArchive = async () => {
    if (!confirm('確定要封存此清單並提交最終結果嗎？')) return;
    
    try {
      // 1. 計算總差異 (實際總量 - 預期總量)
      const { totalExpected, totalActual } = allDrugs.reduce(
        (acc, d) => {
          acc.totalExpected += d.expected_quantity;
          acc.totalActual += (d.actual_quantity || 0);
          return acc;
        },
        { totalExpected: 0, totalActual: 0 }
      );
      const totalDiff = totalActual - totalExpected;

      // 2. 判斷是否為差異結案
      const hasErrors = errorCount > 0;
      const conclusionType = hasErrors ? 'discrepancy' : 'normal';

      // 3. 更新 Manifest 結案類型與總差異（保留舊版差異記錄邏輯）
      const { error: updateError } = await supabase
        .from('manifests')
        .update({ 
          conclusion_type: conclusionType,
          total_discrepancy: totalDiff
        })
        .eq('id', manifestId);

      if (updateError) throw updateError;

      // 4. 觸發 ZIP 封存流程
      await startZIPArchive();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知錯誤';
      alert(`操作失敗: ${message}`);
    }
  };

  const handleExportCSV = () => {
    if (!manifest || allDrugs.length === 0) return;

    // CSV 表頭
    const headers = ['藥品名稱', '條碼', '預期數量', '贈量', '實際數量', '差異', '狀態'];
    const rows = allDrugs.map(item => [
      item.name,
      item.barcode,
      item.expected_quantity,
      item.bonus_quantity,
      item.actual_quantity,
      item.actual_quantity - item.expected_quantity,
      item.counted_status === 'error' ? '數量不符' : item.counted_status === 'completed' ? '正確' : '未清點'
    ]);

    // 轉換為 CSV 字串 (處理逗號與引號)
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // 建立 Blob 並下載
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `PharmaCount_${manifest.name}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="fixed inset-0 bg-[#07142b] text-slate-200 flex flex-col min-h-0">
        {/* 頂部固定區：標題 */}
        <div className="shrink-0 px-4 lg:px-6 pt-4 lg:pt-6 pb-2">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3">
              <Link href={`/scan?manifestId=${manifestId}`} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6 text-slate-400" />
              </Link>
              <h1 className="text-xl lg:text-2xl font-bold text-white">清點總結報告</h1>
              <TeachingButton module="report-export" variant="inline" className="ml-3" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 text-[#00f2fe] animate-spin" />
            <p className="text-slate-500 mt-4">計算統計數據中...</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* 固定區：概覽卡片 */}
            <div className="shrink-0 px-4 lg:px-6 pb-3">
              <div className="max-w-3xl mx-auto">
                <div className="tech-card p-4 lg:p-6 space-y-5 lg:space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg lg:text-xl font-bold text-white">{manifest?.name}</h2>
                      <p className="text-xs lg:text-sm text-slate-500">清點進度概覽</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl lg:text-3xl font-black text-[#00f2fe]">{progress}%</div>
                      <div className="text-[10px] lg:text-xs text-slate-500 uppercase font-bold">Completion</div>
                    </div>
                  </div>

                  <div className="w-full h-3 lg:h-4 bg-slate-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#00f2fe] to-blue-500 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(0,242,254,0.5)]" 
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-2 lg:gap-4">
                    <div className="p-2 lg:p-3 bg-slate-900/50 rounded-xl text-center space-y-1 border border-slate-800">
                      <div className="text-[10px] lg:text-xs text-slate-500">總項數</div>
                      <div className="text-sm lg:text-lg font-bold text-white">{manifest?.total_items || 0}</div>
                    </div>
                    <div className="p-2 lg:p-3 bg-green-500/10 rounded-xl text-center space-y-1 border border-green-500/20">
                      <div className="text-[10px] lg:text-xs text-green-400">已完成</div>
                      <div className="text-sm lg:text-lg font-bold text-green-400">{completedCount}</div>
                    </div>
                    <div className="p-2 lg:p-3 bg-red-500/10 rounded-xl text-center space-y-1 border border-red-500/20">
                      <div className="text-[10px] lg:text-xs text-red-400">異常/未完</div>
                      <div className="text-sm lg:text-lg font-bold text-red-400">{pendingCount + errorCount}</div>
                    </div>
                    <div className="p-2 lg:p-3 bg-blue-500/10 rounded-xl text-center space-y-1 border border-blue-500/20">
                      <div className="text-[10px] lg:text-xs text-blue-400">總差異量</div>
                      <div className="text-sm lg:text-lg font-bold text-blue-400">{manifest?.total_discrepancy || 0}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 滾動區：異常覆核面板 */}
            <div className="flex-1 min-h-0 px-4 lg:px-6 overflow-y-auto">
              <div className="max-w-3xl mx-auto space-y-3 lg:space-y-4 pb-2">
                <div className="flex items-center gap-2 text-[#ff4b5c]">
                  <AlertTriangle className="w-4 h-4 lg:w-5 lg:h-5" />
                  <h3 className="font-bold text-sm lg:text-base">異常覆核清單 ({exceptions.length})</h3>
                </div>

                {exceptions.length === 0 ? (
                  <div className="p-6 lg:p-8 tech-card border-dashed border-slate-700 text-center space-y-3">
                    <CheckCircle className="w-10 h-10 lg:w-12 lg:h-12 text-green-500 mx-auto animate-pulse" />
                    <div className="text-green-400 font-bold text-sm lg:text-base">完美！所有項目均已正確清點</div>
                    <p className="text-xs lg:text-sm text-slate-500">您可以放心封存此清單</p>
                  </div>
                ) : (
                  <div className="grid gap-3 lg:gap-4">
                    {exceptions.map(item => (
                      <div 
                        key={item.id} 
                        className={`tech-card p-3 lg:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                          item.counted_status === 'error' ? 'border-[#ff4b5c] bg-[#ff4b5c]/5' : 'border-slate-700'
                        }`}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${item.counted_status === 'error' ? 'bg-[#ff4b5c]' : 'bg-slate-500'}`} />
                            <div className="font-bold text-white truncate text-sm lg:text-base">{item.name}</div>
                          </div>
                          <div className="text-[11px] lg:text-xs font-mono text-slate-500 truncate">{item.barcode}</div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 lg:gap-6">
                          <div className="text-left sm:text-right space-y-0.5 lg:space-y-1">
                            <div className="text-[10px] text-slate-500 uppercase font-bold">預期 / 實際</div>
                            <div className={`font-mono text-sm ${item.counted_status === 'error' ? 'text-[#ff4b5c] font-bold' : 'text-slate-300'}`}>
                              {item.expected_quantity} / {item.actual_quantity}
                              {item.counted_status === 'error' && (
                                <span className="ml-1 text-[10px] opacity-80">({item.actual_quantity - item.expected_quantity > 0 ? `+${item.actual_quantity - item.expected_quantity}` : item.actual_quantity - item.expected_quantity})</span>
                              )}
                            </div>
                          </div>
                          
                          <Link 
                            href={`/scan?manifestId=${manifestId}`}
                            className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors shrink-0"
                            title="前往清點"
                          >
                            <FileText className="w-4 h-4" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
              </div>
            </div>

            {/* 固定區：操作按鈕 */}
            <div className="shrink-0 px-4 lg:px-6 py-4 lg:py-6 border-t border-blue-500/20">
              <div className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-3 lg:gap-4">
                <button 
                  onClick={handleExportCSV}
                  className="tech-button flex-1 py-3 lg:py-4 bg-slate-700 text-slate-200 hover:bg-slate-600 transition-all flex items-center justify-center gap-2 border border-slate-600"
                >
                  <Download className="w-4 h-4 lg:w-5 lg:h-5" />
                  <span className="text-sm font-bold">匯出 CSV</span>
                </button>
                <button 
                  onClick={handleArchive}
                  disabled={!!operationProgress}
                  className="tech-button flex-1 sm:flex-[2] py-3 lg:py-4 tech-button-primary shadow-[0_0_20px_rgba(0,242,254,0.3)] flex items-center justify-center gap-2"
                >
                  {operationProgress ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 animate-spin" />
                      <span className="ml-2">{operationProgress.message}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 lg:w-5 lg:h-5" />
                      <span>{exceptions.length === 0 ? '確認封存清單' : '提交差異結案'}</span>
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}