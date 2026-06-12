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
      // 判斷是否為差異結案
      const hasErrors = allDrugs.some(d => d.counted_status === 'error');
      const conclusionType = hasErrors ? 'discrepancy' : 'normal';

      // 更新 Manifest 狀態與結案類型
      const { error: archiveError } = await supabase
        .from('manifests')
        .update({ 
          status: 'completed',
          conclusion_type: conclusionType 
        })
        .eq('id', manifestId);

      if (archiveError) throw archiveError;

      alert(`清單已封存！結案類型: ${conclusionType === 'normal' ? '正常結案' : '差異結案'}`);
      router.push('/manifests');
    } catch (error: any) {
      alert(`封存失敗: ${error.message}`);
    } finally {
      setArchiving(false);
    }
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
                <div className="tech-card overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900/50 border-b border-slate-800 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">藥品名稱</th>
                        <th className="px-4 py-3 font-medium">條碼</th>
                        <th className="px-4 py-3 font-medium text-center">預期/實際</th>
                        <th className="px-4 py-3 font-medium text-right">狀態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {exceptions.map(item => (
                        <tr key={item.id} className={`hover:bg-slate-800/50 transition-colors ${item.counted_status === 'error' ? 'bg-[#ff4b5c]/5' : ''}`}>
                          <td className="px-4 py-3 font-medium text-slate-200">{item.name}</td>
                          <td className="px-4 py-3 font-mono text-slate-500">{item.barcode}</td>
                          <td className="px-4 py-3 text-center font-mono">
                            <span className={item.counted_status === 'error' ? 'text-[#ff4b5c] font-bold' : 'text-slate-400'}>
                              {item.expected_quantity} / {item.actual_quantity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                              item.counted_status === 'error' ? 'bg-[#ff4b5c]/20 text-[#ff4b5c]' : 'bg-slate-700 text-slate-400'
                            }`}>
                              {item.counted_status === 'error' ? '數量不符' : '未清點'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 操作按鈕 */}
            <div className="pt-6">
              <button 
                onClick={handleArchive}
                disabled={archiving}
                className="tech-button w-full py-4 tech-button-primary shadow-[0_0_20px_rgba(0,242,254,0.3)]"
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
