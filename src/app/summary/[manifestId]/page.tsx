'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeft, 
  Package, 
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { archiveManifest } from '@/app/actions/manifests/archive';
import { Download } from 'lucide-react';

interface DrugItem {
  id: string;
  barcode: string;
  name: string;
  expected_quantity: number;
  actual_quantity: number;
  counted_status: 'pending' | 'completed' | 'error';
}

interface Manifest {
  id: string;
  name: string;
  total_items: number;
}

export default function SummaryPage() {
  const params = useParams();
  const manifestId = params.manifestId as string;
  const router = useRouter();

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [allDrugs, setAllDrugs] = useState<DrugItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);

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
          .select('id, barcode, name, expected_quantity, actual_quantity, counted_status')
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

  const completedCount = allDrugs.filter(d => d.counted_status === 'completed').length;
  const errorCount = allDrugs.filter(d => d.counted_status === 'error').length;
  const pendingCount = allDrugs.filter(d => d.counted_status === 'pending').length;
  const progress = manifest ? Math.round((completedCount / manifest.total_items) * 100) : 0;
  
  // 異常覆核清單：包含所有 status !== 'completed' 的項目
  const exceptions = allDrugs.filter(d => d.counted_status !== 'completed');

  const handleArchive = async () => {
    if (!confirm('確定要封存此清單並提交最終結果嗎？')) return;
    
    setArchiving(true);
    try {
      // 1. 計算總差異 (實際總量 - 預期總量)
      const totalExpected = allDrugs.reduce((sum, d) => sum + d.expected_quantity, 0);
      const totalActual = allDrugs.reduce((sum, d) => sum + (d.actual_quantity || 0), 0);
      const totalDiff = totalActual - totalExpected;

      // 2. 判斷是否為差異結案
      const hasErrors = allDrugs.some(d => d.counted_status === 'error');
      const conclusionType = hasErrors ? 'discrepancy' : 'normal';

      // 3. 更新 Manifest 狀態、結案類型與總差異
      const { error: archiveError } = await supabase
        .from('manifests')
        .update({ 
          status: 'completed',
          conclusion_type: conclusionType,
          total_diff: totalDiff
        })
        .eq('id', manifestId);

      if (archiveError) throw archiveError;

      alert(`清單已封存！結案類型: ${conclusionType === 'normal' ? '正常結案' : '差異結案'}\n總差異數量: ${totalDiff}`);
      router.push('/manifests');
    } catch (error: any) {
      alert(`封存失敗: ${error.message}`);
    } finally {
      setArchiving(false);
    }
  };

  const handleExportCSV = () => {
    if (!manifest || allDrugs.length === 0) return;

    // CSV 表頭
    const headers = ['藥品名稱', '條碼', '預期數量', '實際數量', '差異', '狀態'];
    const rows = allDrugs.map(item => [
      item.name,
      item.barcode,
      item.expected_quantity,
      item.actual_quantity,
      item.actual_quantity - item.expected_quantity,
      item.counted_status === 'error' ? '數量不符' : item.counted_status === 'completed' ? '正確' : '未清點'
    ]);

    // 轉換為 CSV 字串 (處理逗號與引號)
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\\n');

    // 建立 Blob 並下載
    const blob = new Blob([`\\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
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
    <div className="min-h-screen bg-[#07142b] text-slate-200 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/scan?manifestId=${manifestId}`} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-slate-400" />
          </Link>
          <h1 className="text-2xl font-bold text-white">清點總結報告</h1>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-10 h-10 text-[#00f2fe] animate-spin" />
            <p className="text-slate-500">計算統計數據中...</p>
          </div>
        ) : (
          <>
            {/* 概覽卡片 */}
            <div className="tech-card p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">{manifest?.name}</h2>
                  <p className="text-sm text-slate-500">清點進度概覽</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-[#00f2fe]">{progress}%</div>
                  <div className="text-xs text-slate-500 uppercase font-bold">Completion</div>
                </div>
              </div>

              <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#00f2fe] to-blue-500 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(0,242,254,0.5)]" 
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-slate-900/50 rounded-xl text-center space-y-1 border border-slate-800">
                  <div className="text-xs text-slate-500">總項數</div>
                  <div className="text-lg font-bold text-white">{manifest?.total_items || 0}</div>
                </div>
                <div className="p-3 bg-green-500/10 rounded-xl text-center space-y-1 border border-green-500/20">
                  <div className="text-xs text-green-400">已完成</div>
                  <div className="text-lg font-bold text-green-400">{completedCount}</div>
                </div>
                <div className="p-3 bg-red-500/10 rounded-xl text-center space-y-1 border border-red-500/20">
                  <div className="text-xs text-red-400">異常/未完</div>
                  <div className="text-lg font-bold text-red-400">{pendingCount + errorCount}</div>
                </div>
              </div>
            </div>

            {/* 異常覆核面板 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[#ff4b5c]">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold">異常覆核清單 ({exceptions.length})</h3>
              </div>

              {exceptions.length === 0 ? (
                <div className="p-8 tech-card border-dashed border-slate-700 text-center space-y-3">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto animate-pulse" />
                  <div className="text-green-400 font-bold">完美！所有項目均已正確清點</div>
                  <p className="text-sm text-slate-500">您可以放心封存此清單</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {exceptions.map(item => {
                    const diff = item.actual_quantity - item.expected_quantity;
                    return (
                      <div 
                        key={item.id} 
                        className={`tech-card p-4 flex items-center justify-between gap-4 transition-all ${
                          item.counted_status === 'error' ? 'border-[#ff4b5c] bg-[#ff4b5c]/5' : 'border-slate-700'
                        }`}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${item.counted_status === 'error' ? 'bg-[#ff4b5c]' : 'bg-slate-500'}`} />
                            <div className="font-bold text-white truncate">{item.name}</div>
                          </div>
                          <div className="text-xs font-mono text-slate-500 truncate">{item.barcode}</div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right space-y-1">
                            <div className="text-[10px] text-slate-500 uppercase font-bold">預期 / 實際</div>
                            <div className={`font-mono text-sm ${item.counted_status === 'error' ? 'text-[#ff4b5c] font-bold' : 'text-slate-300'}`}>
                              {item.expected_quantity} / {item.actual_quantity}
                              {item.counted_status === 'error' && (
                                <span className="ml-1 text-[10px] opacity-80">({diff > 0 ? `+${diff}` : diff})</span>
                              )}
                            </div>
                          </div>
                          
                          <Link 
                            href={`/scan?manifestId=${manifestId}`}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors"
                            title="前往清點"
                          >
                            <FileText className="w-4 h-4" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 操作按鈕 */}
            <div className="pt-6 flex gap-4">
              <button 
                onClick={handleExportCSV}
                className="tech-button flex-1 py-4 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all flex items-center justify-center gap-2 border border-slate-700"
              >
                <Download className="w-5 h-5" />
                <span className="text-sm font-bold">匯出 CSV</span>
              </button>
              <button 
                onClick={handleArchive}
                disabled={archiving}
                className="tech-button flex-[2] py-4 tech-button-primary shadow-[0_0_20px_rgba(0,242,254,0.3)] flex items-center justify-center gap-2"
              >
                {archiving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                {exceptions.length === 0 ? '確認封存清單' : '提交差異結案'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
