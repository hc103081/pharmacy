'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Camera, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft,
  Package,
  Loader2,
  FileText,
  ArrowRightLeft
} from 'lucide-react';
import Link from 'next/link';
import { updateDrugStatus } from '@/app/actions/scan/updatePhoto';

interface DrugItem {
  id: string;
  manifest_id: string;
  page_number: number;
  barcode: string;
  name: string;
  expected_quantity: number;
  actual_quantity: number;
  counted_status: 'pending' | 'completed' | 'error';
  photo_url: string | null;
}

export default function ScanContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const manifestId = searchParams.get('manifestId');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [drugs, setDrugs] = useState<DrugItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [manifestName, setManifestName] = useState('');
  
  // 新增：數量輸入狀態
  const [actualQuantity, setActualQuantity] = useState<string>('');
  // 新增：跨頁跳轉 Dialog 狀態
  const [jumpTarget, setJumpTarget] = useState<{ page: number, name: string } | null>(null);

  const fetchPageData = useCallback(async () => {
    if (!manifestId) return;
    
    setLoading(true);
    try {
      const { data: manifest } = await supabase
        .from('manifests')
        .select('name')
        .eq('id', manifestId)
        .single();
      
      if (manifest) setManifestName(manifest.name);

      const { data, error } = await supabase
        .from('drug_items')
        .select('*')
        .eq('manifest_id', manifestId)
        .eq('page_number', currentPage)
        .order('item_order', { ascending: true });

      if (error) throw error;
      setDrugs(data || []);
    } catch (error) {
      console.error('Error fetching page data:', error);
      alert('載入數據失敗，請刷新頁面');
    } finally {
      setLoading(false);
    }
  }, [manifestId, currentPage]);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  // 智慧條碼篩選邏輯
  const handleBarcodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setBarcodeInput(value);

    if (!value) return;

    // 1. 檢查當前頁面是否有匹配
    const localMatch = drugs.find(d => d.barcode === value);
    if (localMatch) return;

    // 2. 全域搜尋 (跨頁防呆)
    try {
      const { data: globalMatch, error } = await supabase
        .from('drug_items')
        .select('page_number, name')
        .eq('manifest_id', manifestId!)
        .eq('barcode', value)
        .single();

      if (error || !globalMatch) return;

      if (globalMatch.page_number !== currentPage) {
        setJumpTarget({
          page: globalMatch.page_number,
          name: globalMatch.name
        });
      }
    } catch (err) {
      console.error('Global search error:', err);
    }
  };

  const matchingItem = drugs.find(d => d.barcode === barcodeInput);

  const triggerCamera = () => {
    if (!matchingItem) return;
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !matchingItem) return;

    const drugId = matchingItem.id;
    setUploadingId(drugId);

    try {
      // 依照新路徑規則：/manifest_id/page_number/barcode_timestamp.jpg
      const filePath = `manifests/${manifestId}/${matchingItem.page_number}/${matchingItem.barcode}_${Date.now()}.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('drug-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('drug-photos')
        .getPublicUrl(filePath);

      // 更新狀態時同步更新實際數量
      const { error: updateError } = await updateDrugStatus(drugId, publicUrl, parseInt(actualQuantity || '0'));
      if (updateError) throw updateError;

      await fetchPageData();
      setBarcodeInput('');
      setActualQuantity('');
    } catch (error: any) {
      console.error('Upload Error:', error);
      alert(`上傳失敗: ${error.message}`);
    } finally {
      setUploadingId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 封裝更新狀態 API (內部使用)
  async function updateDrugStatus(id: string, url: string, qty: number) {
    const item = drugs.find(d => d.id === id);
    const expected = item?.expected_quantity || 0;
    const status = qty === expected ? 'completed' : 'error';

    const { error } = await supabase
      .from('drug_items')
      .update({
        actual_quantity: qty,
        counted_status: status,
        photo_url: url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    
    return { error };
  }

  return (
    <div className="min-h-screen bg-[#07142b] text-slate-200 flex flex-col">
      {/* 跨頁跳轉 Dialog */}
      {jumpTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="tech-card p-6 max-w-sm w-full space-y-4 animate-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-[#00f2fe]">
              <ArrowRightLeft className="w-6 h-6" />
              <h3 className="font-bold text-lg">發現藥品在其他分頁</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              藥品 <span className="text-white font-bold">「{jumpTarget.name}」</span> 位於 <span className="text-[#00f2fe] font-bold">第 {jumpTarget.page} 頁</span>。
            </p>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setJumpTarget(null)}
                className="flex-1 py-2 bg-slate-800 text-slate-400 rounded-xl font-medium hover:bg-slate-700 transition-colors"
              >
                留在本頁
              </button>
              <button 
                onClick={() => {
                  setCurrentPage(jumpTarget.page);
                  setJumpTarget(null);
                }}
                className="flex-1 py-2 bg-[#00f2fe] text-slate-900 rounded-xl font-bold hover:brightness-110 transition-all"
              >
                跳轉至該頁
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-[#162a56]/80 backdrop-blur-sm border-b border-blue-500/20 sticky top-0 z-10 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/manifests" className="p-2 hover:bg-slate-800 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div>
              <h1 className="font-bold text-white truncate max-w-[150px]">{manifestName || '載入中...'}</h1>
              <p className="text-xs text-slate-500">分頁清點模式</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-950/50 p-1 rounded-xl border border-slate-800">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1 hover:bg-slate-800 rounded disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-bold px-2 text-slate-300">第 {currentPage} 頁</span>
            <button 
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="p-1 hover:bg-slate-800 rounded transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="w-5 h-5 text-slate-500" />
          </div>
          <input
            type="text"
            value={barcodeInput}
            onChange={handleBarcodeChange}
            placeholder="掃描或輸入條碼..."
            className={`tech-input w-full pl-10 pr-4 text-lg font-mono ${
              matchingItem ? 'border-[#00f2fe] shadow-[0_0_15px_rgba(0,242,254,0.3)]' : ''
            }`}
            autoFocus
          />
          {matchingItem && (
            <div className="absolute inset-y-0 right-3 flex items-center text-[#00f2fe] font-bold text-sm animate-pulse">
              匹配成功!
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/*" 
          capture="environment" 
          className="hidden" 
        />

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-10 h-10 border-4 border-[#00f2fe] border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 animate-pulse">載入數據中...</p>
          </div>
        ) : drugs.length === 0 ? (
          <div className="text-center py-20 tech-card border-dashed border-slate-700 space-y-4">
            <Package className="w-12 h-12 text-slate-600 mx-auto" />
            <p className="text-slate-500">本頁沒有藥品項目</p>
          </div>
        ) : (
          <div className="space-y-4">
            {drugs.map((drug) => {
              const isMatched = drug.barcode === barcodeInput;
              const isCompleted = drug.counted_status === 'completed';
              const isError = drug.counted_status === 'error';
              const isUploading = uploadingId === drug.id;

              return (
                <div 
                  key={drug.id}
                  className={`tech-card p-4 transition-all flex flex-col gap-4 ${
                    isMatched ? 'border-[#00f2fe] shadow-[0_0_20px_rgba(0,242,254,0.2)] scale-[1.02] z-10' : ''
                  } ${isError ? 'border-[#ff4b5c] bg-[#ff4b5c]/5' : ''} ${isCompleted && !isMatched ? 'opacity-40 grayscale' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        isCompleted ? 'bg-[#00f2fe] text-slate-900' : isError ? 'bg-[#ff4b5c] text-white' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : isError ? <AlertCircle className="w-5 h-5" /> : drug.page_number}
                      </div>
                      <div>
                        <div className={`font-bold text-lg ${isMatched ? 'text-[#00f2fe]' : 'text-white'}`}>{drug.name}</div>
                        <div className="text-xs font-mono text-slate-500">{drug.barcode} | 預期: {drug.expected_quantity}</div>
                      </div>
                    </div>
                    
                    {isMatched && (
                      <div className="flex items-center gap-2 bg-slate-950/50 p-2 rounded-lg border border-slate-700">
                        <label className="text-xs font-bold text-slate-500">數量:</label>
                        <input 
                          type="number"
                          value={actualQuantity}
                          onChange={(e) => setActualQuantity(e.target.value)}
                          className="w-14 bg-transparent text-center font-mono text-sm text-[#00f2fe] outline-none"
                          placeholder="0"
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex justify-end">
                    <button 
                      onClick={triggerCamera}
                      disabled={!isMatched || !!uploadingId}
                      className={`tech-button px-6 py-2 ${
                        isMatched 
                          ? 'tech-button-primary' 
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {isUploading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Camera className="w-5 h-5" />
                      )}
                      <span className="text-sm font-bold">{isUploading ? '上傳中...' : '拍照確認'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="p-4 bg-[#07142b] border-t border-slate-800 text-center">
        <p className="text-xs text-slate-500 font-medium">
          請掃描條碼以激活數量輸入與拍照按鈕
        </p>
      </footer>
    </div>
  );
}
