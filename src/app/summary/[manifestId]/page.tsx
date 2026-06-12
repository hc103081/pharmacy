'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeft, 
  Package, 
  FileText,
  Loader2,
  CheckCircle
} from 'lucide-react';
import Link from 'next/link';
import { archiveManifest } from '@/app/actions/manifests/archive';

interface DrugItem {
  id: string;
  barcode: string;
  name: string;
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
        // 1. 獲取清單資訊
        const { data: mData } = await supabase
          .from('manifests')
          .select('*')
          .eq('id', manifestId)
          .single();
        
        setManifest(mData);

        // 2. 獲取所有藥品狀態
        const { data: dData } = await supabase
          .from('drug_items')
          .select('id, barcode, name, counted_status')
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
  const pendingCount = allDrugs.length - completedCount;
  const progress = manifest ? Math.round((completedCount / manifest.total_items) * 100) : 0;
  const missingItems = allDrugs.filter(d => d.counted_status !== 'completed');

  const handleArchive = async () => {
    if (!confirm('確定要封存此清單並標記為已完成嗎？')) return;
    
    setArchiving(true);
    try {
      const result = await archiveManifest(manifestId);
      if (result.success) {
        alert('清單已封存！');
        router.push('/manifests');
      } else {
        alert(`封存失敗: ${result.error}`);
      }
    } catch (error) {
      alert('發生未知錯誤');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/scan?manifestId=${manifestId}`} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">清點總結報告</h1>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <p className="text-gray-500">計算統計數據中...</p>
          </div>
        ) : (
          <>
            {/* 概覽卡片 */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{manifest?.name}</h2>
                  <p className="text-sm text-gray-500">清點進度概覽</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-blue-600">{progress}%</div>
                  <div className="text-xs text-gray-400 uppercase font-bold">Completion</div>
                </div>
              </div>

              {/* 進度條 */}
              <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-500 ease-out" 
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-gray-50 rounded-xl text-center space-y-1">
                  <div className="text-xs text-gray-500">總項數</div>
                  <div className="text-lg font-bold text-gray-900">{manifest?.total_items || 0}</div>
                </div>
                <div className="p-3 bg-green-50 rounded-xl text-center space-y-1 border border-green-100">
                  <div className="text-xs text-green-600">已完成</div>
                  <div className="text-lg font-bold text-green-700">{completedCount}</div>
                </div>
                <div className="p-3 bg-red-50 rounded-xl text-center space-y-1 border border-red-100">
                  <div className="text-xs text-red-600">待清點</div>
                  <div className="text-lg font-bold text-red-700">{pendingCount}</div>
                </div>
              </div>
            </div>

            {/* 缺項檢查列表 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold">缺項檢查列表 ({pendingCount})</h3>
              </div>

              {pendingCount === 0 ? (
                <div className="p-8 bg-green-50 border border-green-200 rounded-2xl text-center space-y-3">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
                  <div className="text-green-800 font-bold">完美！所有項目已清點完成</div>
                  <p className="text-sm text-green-600">您可以放心封存此清單</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b text-gray-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">藥品名稱</th>
                        <th className="px-4 py-3 font-medium">條碼</th>
                        <th className="px-4 py-3 font-medium text-right">狀態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {missingItems.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                          <td className="px-4 py-3 font-mono text-gray-500">{item.barcode}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="px-2 py-1 bg-red-100 text-red-600 rounded-full text-xs font-bold">
                              Pending
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
                className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-black disabled:bg-gray-400 transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                {archiving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                {pendingCount === 0 ? '確認封存清單' : '強行封存 (仍有缺項)'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
