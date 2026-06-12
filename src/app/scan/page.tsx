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
  Loader2
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
  counted_status: 'pending' | 'completed' | 'error';
  photo_url: string | null;
}

export default function ScanPage() {
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
        .order('barcode', { ascending: true });

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

  const handleBarcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBarcodeInput(e.target.value);
  };

  const matchingItem = drugs.find(d => d.barcode === barcodeInput);

  // 觸發相機拍照
  const triggerCamera = () => {
    if (!matchingItem) return;
    fileInputRef.current?.click();
  };

  // 處理文件上傳
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !matchingItem) return;

    const drugId = matchingItem.id;
    setUploadingId(drugId);

    try {
      // 1. 上傳照片至 Supabase Storage
      const filePath = `manifests/${manifestId}/${drugId}_${Date.now()}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('drug-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. 獲取公開 URL
      const { data: { publicUrl } } = supabase.storage
        .from('drug-photos')
        .getPublicUrl(filePath);

      // 3. 更新資料庫狀態
      const result = await updateDrugStatus(drugId, publicUrl);
      if (!result.success) throw new Error(result.error);

      // 4. 刷新當前頁面數據
      await fetchPageData();
      setBarcodeInput(''); // 清空條碼，準備下一個
    } catch (error: any) {
      console.error('Upload Error:', error);
      alert(`上傳失敗: ${error.message}`);
    } finally {
      setUploadingId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-10 p-4 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/manifests" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="font-bold text-gray-900 truncate max-w-[150px]">{manifestName || '載入中...'}</h1>
              <p className="text-xs text-gray-500">分頁清點模式</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1 hover:bg-white rounded disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium px-2">第 {currentPage} 頁</span>
            <button 
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="p-1 hover:bg-white rounded transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="w-5 h-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={barcodeInput}
            onChange={handleBarcodeChange}
            placeholder="掃描或輸入條碼..."
            className={`w-full pl-10 pr-4 py-3 bg-gray-50 border-2 rounded-xl outline-none transition-all text-lg font-mono ${
              matchingItem ? 'border-green-500 ring-2 ring-green-200 bg-green-50' : 'border-gray-200 focus:border-blue-500'
            }`}
            autoFocus
          />
          {matchingItem && (
            <div className="absolute inset-y-0 right-3 flex items-center text-green-600 font-bold text-sm animate-bounce">
              匹配成功!
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        {/* 隱藏的拍照輸入框 */}
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
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500">載入藥品項目...</p>
          </div>
        ) : drugs.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border space-y-4">
            <Package className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="text-gray-500">本頁沒有藥品項目</p>
          </div>
        ) : (
          <div className="space-y-3">
            {drugs.map((drug) => {
              const isMatched = drug.barcode === barcodeInput;
              const isCompleted = drug.counted_status === 'completed';
              const isUploading = uploadingId === drug.id;

              return (
                <div 
                  key={drug.id}
                  className={`p-4 bg-white border-2 rounded-xl transition-all flex items-center justify-between ${
                    isMatched ? 'border-green-500 shadow-md scale-[1.02] z-10' : 'border-transparent shadow-sm'
                  } ${isCompleted ? 'opacity-60 grayscale-[0.5]' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      isCompleted ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-xs font-bold">{drug.page_number}</span>}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">{drug.name}</div>
                      <div className="text-xs font-mono text-gray-500">{drug.barcode} | 預期: {drug.expected_quantity}</div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={triggerCamera}
                    disabled={!isMatched || isCompleted || !!uploadingId}
                    className={`p-3 rounded-lg flex items-center gap-2 transition-all ${
                      isMatched && !isCompleted 
                        ? 'bg-blue-600 text-white shadow-lg hover:bg-blue-700' 
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {isUploading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                    <span className="text-sm font-medium">{isUploading ? '上傳中...' : '拍照'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="p-4 bg-white border-t text-center">
        <p className="text-xs text-gray-400">
          請掃描條碼以激活「拍照」按鈕
        </p>
      </footer>
    </div>
  );
}
