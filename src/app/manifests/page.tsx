'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Package, Calendar, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';

interface Manifest {
  id: string;
  name: string;
  total_items: number;
  status: string;
  created_at: string;
}

export default function ManifestsPage() {
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [loading, setLoading] = useState(true);

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
              <Link 
                key={m.id} 
                href={`/scan?manifestId=${m.id}`}
                className="tech-card p-4 group hover:border-[#00f2fe]/50 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 text-[#00f2fe] rounded-lg group-hover:bg-[#00f2fe] group-hover:text-slate-900 transition-all duration-300 shadow-[0_0_15px_rgba(0,242,254,0.2)]">
                    <Package className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-white">{m.name}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(m.created_at).toLocaleDateString()}
                      </span>
                      <span>•</span>
                      <span>共 {m.total_items} 項藥品</span>
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-[#00f2fe] transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
