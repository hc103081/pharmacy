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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">選擇清點清單</h1>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <p className="text-gray-500">載入清單中...</p>
          </div>
        ) : manifests.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300 space-y-4">
            <Package className="w-12 h-12 text-gray-300 mx-auto" />
            <div className="space-y-1">
              <p className="text-gray-600 font-medium">目前沒有可用的清單</p>
              <p className="text-sm text-gray-400">請先前往「匯入清單」頁面建立新清單</p>
            </div>
            <Link 
              href="/import" 
              className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
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
                className="p-4 bg-white border rounded-xl shadow-sm hover:shadow-md hover:border-blue-400 transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Package className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-gray-900">{m.name}</h3>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(m.created_at).toLocaleDateString()}
                      </span>
                      <span>•</span>
                      <span>共 {m.total_items} 項藥品</span>
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
