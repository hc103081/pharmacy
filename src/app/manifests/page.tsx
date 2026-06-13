'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { Package, Calendar, ChevronRight, ArrowLeft, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { deleteManifest } from '@/app/actions/manifests/archive';
import type { Manifest } from '@/types';

export default function ManifestsPage() {
  const supabase = createClient();
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchManifests() {
      try {
        const { data, error } = await supabase
          .from('manifests')
          .select('*')
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setManifests(data || []);
      } catch (error) {
        console.error('Error fetching manifests:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchManifests();
  }, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const result = await deleteManifest(id);
      if (result.success) {
        setManifests(prev => prev.filter(m => m.id !== id));
        setConfirmDeleteId(null);
      } else {
        alert(`刪除失敗: ${result.error}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知錯誤';
      alert(`刪除過程中發生錯誤: ${message}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#07142b] text-slate-200 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-slate-400" />
          </Link>
          <h1 className="text-2xl font-bold text-white">選擇清點清單</h1>
        </div>

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
            {manifests.map((m) => (
              <div 
                key={m.id} 
                className="tech-card p-4 group hover:border-[#00f2fe]/50 flex items-center justify-between"
              >
                <Link 
                  href={`/scan?manifestId=${m.id}`}
                  className="flex items-center gap-4 flex-1"
                >
                  <div className="p-3 bg-blue-500/10 text-[#00f2fe] rounded-lg group-hover:bg-[#00f2fe] group-hover:text-slate-900 transition-all duration-300 shadow-[0_0_15px_rgba(0,242,254,0.2)]">
                    <Package className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-white">{m.name}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {m.created_at && new Date(m.created_at).toLocaleDateString()}
                      </span>
                      <span>•</span>
                      <span>共 {m.total_items} 項藥品</span>
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      setConfirmDeleteId(m.id);
                    }}
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                    title="刪除清單"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <Link href={`/scan?manifestId=${m.id}`} className="p-2 text-slate-500 group-hover:text-[#00f2fe] transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 刪除確認 Dialog */}
        {confirmDeleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="tech-card p-6 max-w-sm w-full space-y-4 animate-in zoom-in duration-200">
              <div className="flex items-center gap-3 text-red-400">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="font-bold text-lg">確認刪除清單</h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                刪除後將永久移除此清單及其所有清點記錄與照片，此操作不可恢復。
              </p>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2 bg-slate-800 text-slate-400 rounded-xl font-medium hover:bg-slate-700 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={() => handleDelete(confirmDeleteId)}
                  disabled={deletingId !== null}
                  className="flex-1 py-2 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all disabled:opacity-50"
                >
                  {deletingId ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> 刪除中...
                    </div>
                  ) : '確定刪除'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
