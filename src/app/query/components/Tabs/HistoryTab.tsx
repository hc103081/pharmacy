'use client';

import React, { useState, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useOfflineCache } from '@/app/query/hooks/useOfflineCache';
import { format, formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Search, Clock, Bell, TrendingUp, Upload, CheckCircle2, XCircle, Loader2, AlertTriangle, CircleHelp, List, Users, Calendar, MapPin, BarChart3 } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';

interface ManifestHistoryItem {
  id: string;
  name: string;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  total_items: number;
  counted_items: number;
  error_items: number;
  skipped_items: number;
  completion_rate: number;
  last_counted_by: string | null;
  storage_locations: string[];
  categories: string[];
}

interface DrugHistoryItem {
  id: string;
  manifest_id: string;
  manifest_name: string;
  barcode: string | null;
  product_code: string | null;
  name: string;
  expected_quantity: number;
  actual_quantity: number | null;
  counted_status: 'pending' | 'counted' | 'error' | 'skipped';
  last_updated: string;
  storage_location: string | null;
  category: string | null;
  discrepancy: number;
  counted_by: string | null;
  counted_at: string | null;
}

export default function HistoryTab() {
  const [viewMode, setViewMode] = useState<'manifests' | 'drugs'>('manifests');
  const [manifestFilters, setManifestFilters] = useState({
    searchText: '',
    status: [] as ('active' | 'archived')[],
    dateFrom: null as string | null,
    dateTo: null as string | null,
    minCompletionRate: null as number | null,
  });
  
  const [drugFilters, setDrugFilters] = useState({
    searchText: '',
    manifestId: null as string | null,
    barcode: null as string | null,
    productCode: null as string | null,
    countedStatus: [] as ('pending' | 'counted' | 'error' | 'skipped')[],
    dateFrom: null as string | null,
    dateTo: null as string | null,
  });
  
  // Manifests query
  const {
    data: manifestData = [],
    error: manifestError,
    isLoading: manifestIsLoading,
    isFetching: manifestIsFetching,
    hasNextPage: manifestHasNextPage,
    fetchNextPage: manifestFetchNextPage,
    refetch: manifestRefetch
  } = useInfiniteQuery({
    queryKey: ['manifestHistory', manifestFilters],
    queryFn: async ({ pageParam = 0 }) => {
      // In a real implementation, this would call a Supabase function
      // For now, we'll return mock data
      return mockManifests(pageParam);
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 20 ? allPages.length : undefined;
    },
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
  
  // Drugs query
  const {
    data: drugData = [],
    error: drugError,
    isLoading: drugIsLoading,
    isFetching: drugIsFetching,
    hasNextPage: drugHasNextPage,
    fetchNextPage: drugFetchNextPage,
    refetch: drugRefetch
  } = useInfiniteQuery({
    queryKey: ['drugHistory', drugFilters],
    queryFn: async ({ pageParam = 0 }) => {
      // In a real implementation, this would call a Supabase function
      // For now, we'll return mock data
      return mockDrugs(pageParam);
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 20 ? allPages.length : undefined;
    },
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
  
  const { isCached } = useOfflineCache();
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  
  // Mock data functions
  function mockManifests(page: number): ManifestHistoryItem[] {
    const manifests = [];
    const start = page * 20;
    
    for (let i = 0; i < 20; i++) {
      const id = start + i + 1;
      const status = i % 3 === 0 ? 'archived' : 'active';
      const totalItems = 44 + (i % 5) * 4; // 44, 48, 52, 56, 60
      const countedItems = Math.floor(totalItems * (0.7 + Math.random() * 0.25)); // 70-95%
      const errorItems = Math.floor(totalItems * 0.05); // ~5%
      const skippedItems = Math.floor(totalItems * 0.02); // ~2%
      
      manifests.push({
        id: `manifest-${id}`,
        name: `2026-10-${String(id % 28 + 1).padStart(2, '0')} 清單`,
        status,
        created_at: new Date(Date.now() - id * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - id * 12 * 60 * 60 * 1000).toISOString(),
        total_items: totalItems,
        counted_items: countedItems,
        error_items: errorItems,
        skipped_items: skippedItems,
        completion_rate: Math.round((countedItems / totalItems) * 100),
        last_counted_by: `藥師${String(id % 3 + 1)}`,
        storage_locations: ['A1', 'A2', 'B1', 'B2'].slice(0, 2 + (i % 3)),
        categories: ['西藥', '中藥', '保健品'].slice(0, 2 + (i % 2))
      });
    }
    
    return manifests as ManifestHistoryItem[];
  }
  
  function mockDrugs(page: number): DrugHistoryItem[] {
    const drugs = [];
    const start = page * 20;
    
    for (let i = 0; i < 20; i++) {
      const id = start + i + 1;
      const manifestId = Math.floor(id / 10) + 1;
      const statusOptions = ['pending', 'counted', 'error', 'skipped'];
      const status = statusOptions[i % 4];
      const expectedQuantity = 10 + (i % 50);
      const actualQuantity = status === 'counted' || status === 'error' 
        ? expectedQuantity + Math.floor(Math.random() * 20) - 10 
        : null;
      const discrepancy = actualQuantity !== null ? actualQuantity - expectedQuantity : null;
      
      drugs.push({
        id: `drug-item-${id}`,
        manifest_id: `manifest-${manifestId}`,
        manifest_name: `2026-10-${String(manifestId % 28 + 1).padStart(2, '0')} 清單`,
        barcode: `1234567890${String(id % 100).padStart(2, '0')}`,
        product_code: `PDT-${String(id % 1000).padStart(3, '0')}`,
        name: `藥品名稱 ${String(id % 100 + 1).padStart(3, '0')}`,
        expected_quantity: expectedQuantity,
        actual_quantity: actualQuantity,
        counted_status: status as any,
        last_updated: new Date(Date.now() - id * 6 * 60 * 60 * 1000).toISOString(),
        storage_location: ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2'][i % 8],
        category: ['西藥', '中藥', '保健品', '醫療材料'][i % 4],
        discrepancy: discrepancy !== null ? discrepancy : 0,
        counted_by: status === 'counted' || status === 'error' ? `藥師${String(id % 3 + 1)}` : null,
        counted_at: (status === 'counted' || status === 'error') 
          ? new Date(Date.now() - id * 3 * 60 * 60 * 1000).toISOString() 
          : null
      });
    }
    
    return drugs as DrugHistoryItem[];
  }
  
  const handleViewModeChange = (mode: 'manifests' | 'drugs') => {
    setViewMode(mode);
  };
  
  const handleManifestSearchChange = (value: string) => {
    setManifestFilters(prev => ({ ...prev, searchText: value }));
  };
  
  const handleDrugSearchChange = (value: string) => {
    setDrugFilters(prev => ({ ...prev, searchText: value }));
  };
  
  const handleResetManifestFilters = () => {
    setManifestFilters({
      searchText: '',
      status: [],
      dateFrom: null,
      dateTo: null,
      minCompletionRate: null,
    });
  };
  
  const handleResetDrugFilters = () => {
    setDrugFilters({
      searchText: '',
      manifestId: null,
      barcode: null,
      productCode: null,
      countedStatus: [],
      dateFrom: null,
      dateTo: null,
    });
  };
  
  const handleExportManifests = async () => {
    alert('匯出清單歷史功能開發中');
  };
  
  const handleExportDrugs = async () => {
    alert('匯出藥品歷史功能開發中');
  };
  
  const handleViewManifestDetails = (manifest: ManifestHistoryItem) => {
    setSelectedItem(manifest);
  };
  
  const handleViewDrugDetails = (drug: DrugHistoryItem) => {
    setSelectedItem(drug);
  };
  
  const handleCloseDetails = () => {
    setSelectedItem(null);
  };
  
  if ((viewMode === 'manifests' && manifestError) || (viewMode === 'drugs' && drugError)) {
    const error = viewMode === 'manifests' ? manifestError : drugError;
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4 p-4 bg-[#ff4b5c]/20 rounded-lg border border-[#ff4b5c]/50">
          <AlertTriangle className="w-5 h-5 text-[#ff4b5c]" />
          <div>
            <h3 className="font-medium text-[#ff4b5c]">載入失敗</h3>
            <p className="text-sm text-slate-400">{(error as Error).message}</p>
          </div>
        </div>
        <button 
          onClick={() => viewMode === 'manifests' ? manifestRefetch : drugRefetch}
          className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
        >
          重試
        </button>
      </div>
    );
  }
  
  const manifestItems = viewMode === 'manifests' ? manifestData : [];
  const drugItems = viewMode === 'drugs' ? drugData : [];
  const isLoading = viewMode === 'manifests' ? manifestIsLoading : drugIsLoading;
  const isFetching = viewMode === 'manifests' ? manifestIsFetching : drugIsFetching;
  const hasNextPage = viewMode === 'manifests' ? manifestHasNextPage : drugHasNextPage;
  const fetchNextPage = viewMode === 'manifests' ? manifestFetchNextPage : drugFetchNextPage;
  
  return (
    <div className="p-6">
      {/* View Mode Toggle */}
      <div className="mb-6 flex items-center gap-4 pb-3 border-b border-slate-800">
        <button 
          onClick={() => handleViewModeChange('manifests')}
          className={`px-4 py-2 text-sm font-medium ${
            viewMode === 'manifests' 
              ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]' 
              : 'text-slate-400 hover:bg-slate-800/50'
          } rounded-lg transition-colors`}
        >
          清單歷史
        </button>
        <button 
          onClick={() => handleViewModeChange('drugs')}
          className={`px-4 py-2 text-sm font-medium ${
            viewMode === 'drugs' 
              ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]' 
              : 'text-slate-400 hover:bg-slate-800/50'
          } rounded-lg transition-colors`}
        >
          藥品歷史
        </button>
      </div>
      
      {/* Search and Filters */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-medium text-slate-400 mb-1">
              {viewMode === 'manifests' ? '搜尋清單' : '搜尋藥品'}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={viewMode === 'manifests' ? manifestFilters.searchText : drugFilters.searchText}
                onChange={(e) => {
                  if (viewMode === 'manifests') {
                    handleManifestSearchChange(e.target.value);
                  } else {
                    handleDrugSearchChange(e.target.value);
                  }
                }}
                placeholder={viewMode === 'manifests' 
                  ? '清單名稱、建立人...' 
                  : '條碼、品名、商品代碼...'}
                className="pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-[#00f2fe] focus:bg-slate-800 text-white"
              />
            </div>
          </div>
          
          <button 
            onClick={() => viewMode === 'manifests' ? handleResetManifestFilters() : handleResetDrugFilters()}
            className="px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-800 transition-colors text-sm"
          >
            重置
          </button>
          
          <button 
            onClick={() => viewMode === 'manifests' ? handleExportManifests() : handleExportDrugs()}
            className="px-4 py-3 bg-[#00f2fe]/20 border border-[#00f2fe] rounded-xl hover:bg-[#00f2fe]/30 transition-colors text-sm"
          >
            <Upload className="w-4 h-4 mr-2" />
            {viewMode === 'manifests' ? '匯出清單' : '匯出藥品'}
          </button>
        </div>
      </div>
      
      {/* Results Count and Status */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>共 {((viewMode === 'manifests' ? (manifestData as any).pages?.flat().length ?? 0 : (drugData as any).pages?.flat().length ?? 0))} 項結果</span>
          {isCached && (
            <span className="flex items-center gap-1">
              <CircleHelp className="w-3 h-3 text-[#00f2fe]" />
              <span>顯示快取資料</span>
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {isFetching && (
            <Loader2 className="w-4 h-4 text-[#00f2fe] animate-spin" />
          )}
          
          {!isFetching && hasNextPage && (
            <button 
              onClick={() => fetchNextPage()}
              className="px-3 py-1 bg-slate-800/50 border border-slate-700 rounded hover:bg-slate-800 transition-colors text-xs"
            >
              載入更多
            </button>
          )}
        </div>
      </div>
      
      {/* Results Table */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-800 overflow-hidden">
        {(viewMode === 'manifests' ? (manifestData as any).pages?.flat().length ?? 0 : (drugData as any).pages?.flat().length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800">
              <thead>
                <tr className="bg-slate-800/70">
                  {viewMode === 'manifests' ? (
                    <React.Fragment>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">清單名稱</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">建立日期</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">狀態</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">總項數</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">已清點</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">錯誤項</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">完成率</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">最後清點</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">操作</th>
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">條碼</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">品名</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">所屬清單</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">預期量</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">實際量</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">差異</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">狀態</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">清點人</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">清點時間</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">操作</th>
                    </React.Fragment>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {((viewMode === 'manifests' ? (manifestData as any).pages?.flat() ?? [] : (drugData as any).pages?.flat() ?? [])).map((item: any, index: number) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-800/30 cursor-pointer"
                    onClick={() => {
                      if (viewMode === 'manifests') {
                        handleViewManifestDetails(item);
                      } else {
                        handleViewDrugDetails(item);
                      }
                    }}
                  >
                    {viewMode === 'manifests' ? (
                      <React.Fragment>
                        <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                          {item.name}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                          {format(new Date(item.created_at), 'MM-dd HH:mm', { locale: zhTW })}
                        </td>
                        <td className="px-6 py-4 text-sm whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            item.status === 'active' 
                              ? 'bg-[#00f2fe]/20 text-[#00f2fe]' 
                              : 'bg-slate-600/20 text-slate-400'
                          }`}>
                            {item.status === 'active' ? '進行中' : '已封存'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                          {item.total_items}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                          {item.counted_items}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                          {item.error_items}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            item.completion_rate >= 95 
                              ? 'bg-[#00f2fe]' + '/20 text-[#00f2fe]' 
                              : item.completion_rate >= 80 
                                ? 'bg-slate-600' + '/20 text-slate-300' 
                                : 'bg-[#ff4b5c]' + '/20 text-[#ff4b5c]'
                          }`}>
                            {item.completion_rate}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-400 whitespace-nowrap">
                          {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true, locale: zhTW })}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-400 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button 
                              className="text-slate-400 hover:text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewManifestDetails(item);
                              }}
                            >
                              <Search className="w-4 h-4" />
                            </button>
                            <button 
                              className="text-slate-400 hover:text-[#00f2fe]"
                              onClick={(e) => {
                                e.stopPropagation();
                                // TODO: Implement actual manifest restoration
                                alert('還原功能開發中');
                              }}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </React.Fragment>
                    ) : (
                      <React.Fragment>
                        <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                          {item.barcode || '無條碼'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-200">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-slate-600 rounded" />
                            <span className="font-medium">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                          {item.manifest_name}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                          {item.expected_quantity}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                          {item.actual_quantity !== null ? item.actual_quantity : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            item.discrepancy > 0 ? 'bg-[#ff4b5c]' + '/20 text-[#ff4b5c]' :
                            item.discrepancy < 0 ? 'bg-[#00f2fe]' + '/20 text-[#00f2fe]' :
                            'bg-slate-600' + '/20 text-slate-300'
                          }`}>
                            {item.discrepancy !== null ? item.discrepancy : '0'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            item.counted_status === 'counted' ? 'bg-[#00f2fe]' + '/20 text-[#00f2fe]' :
                            item.counted_status === 'error' ? 'bg-[#ff4b5c]' + '/20 text-[#ff4b5c]' :
                            item.counted_status === 'skipped' ? 'bg-slate-600' + '/20 text-slate-400' :
                            'bg-slate-600' + '/20 text-slate-300'
                          }`}>
                            {item.counted_status === 'counted' ? '已清點' :
                              item.counted_status === 'error' ? '錯誤' :
                              item.counted_status === 'skipped' ? '跳過' :
                              '待清點'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                          {item.counted_by || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-400 whitespace-nowrap">
                          {item.counted_at 
                            ? formatDistanceToNow(new Date(item.counted_at), { addSuffix: true, locale: zhTW })
                            : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-400 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button 
                              className="text-slate-400 hover:text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewDrugDetails(item);
                              }}
                            >
                              <Search className="w-4 h-4" />
                            </button>
                            <button 
                              className="text-slate-400 hover:text-[#00f2fe]"
                              onClick={(e) => {
                                e.stopPropagation();
                                // TODO: Implement actual discrepancy reporting
                                alert('舉報功能開發中');
                              }}
                            >
                              <Bell className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </React.Fragment>
                    )}
                  </tr>
                ))
              }
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            {viewMode === 'manifests' ? (
              <>
                <List className="w-12 h-12 mx-auto mb-4 text-slate-500" />
                <h3 className="text-lg font-medium text-slate-400 mb-2">無清單歷史記錄</h3>
                <p className="text-sm text-slate-500">
                  嘗試調整搜尋條件或使用不同的關鍵字
                </p>
                <button 
                  onClick={handleResetManifestFilters}
                  className="mt-4 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  重置搜尋條件
                </button>
              </>
            ) : (
              <>
                <Users className="w-12 h-12 mx-auto mb-4 text-slate-500" />
                <h3 className="text-lg font-medium text-slate-400 mb-2">無藥品歷史記錄</h3>
                <p className="text-sm text-slate-500">
                  嘗試調整搜尋條件或使用不同的關鍵字
                </p>
                <button 
                  onClick={handleResetDrugFilters}
                  className="mt-4 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  重置搜尋條件
                </button>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Selected Item Details Panel */}
      {selectedItem && (
        <div className="mt-6 bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <h2 className="text-xl font-bold text-white">
              {viewMode === 'manifests' ? '清單詳細資訊' : '藥品詳細資訊'}
            </h2>
            <button 
              onClick={handleCloseDetails}
              className="text-slate-400 hover:text-white"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 gap-6 px-6 py-6">
            {viewMode === 'manifests' ? (
              <>
                {/* Basic Info */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-600 rounded flex items-center justify-center">
                      <List className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{selectedItem.name}</h3>
                      <p className="text-sm text-slate-400">
                        建立時間：{format(new Date(selectedItem.created_at), 'yyyy-MM-dd HH:mm', { locale: zhTW })} •
                        最後更新：{format(new Date(selectedItem.updated_at), 'yyyy-MM-dd HH:mm', { locale: zhTW })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-400">清單狀態</p>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        selectedItem.status === 'active' 
                          ? 'bg-[#00f2fe]/20 text-[#00f2fe]' 
                          : 'bg-slate-600/20 text-slate-400'
                      }`}>
                        {selectedItem.status === 'active' ? '進行中' : '已封存'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-400">最後清點人</p>
                      <p className="text-lg text-white">{selectedItem.last_counted_by || '無'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-400">儲位分布</p>
                      <p className="text-sm text-slate-400">{selectedItem.storage_locations.join(', ') || '未指定'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-400">類別分布</p>
                      <p className="text-sm text-slate-400">{selectedItem.categories.join(', ') || '未分類'}</p>
                    </div>
                  </div>
                </div>
                
                {/* Statistics */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-400">總項數</p>
                      <p className="text-2xl font-bold text-[#00f2fe]">{selectedItem.total_items}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-400">已清點項數</p>
                      <p className="text-2xl font-bold text-[#00f2fe]">{selectedItem.counted_items}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-400">錯誤項數</p>
                      <p className="text-2xl font-bold text-[#ff4b5c]">{selectedItem.error_items}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-400">跳過項數</p>
                      <p className="text-2xl font-bold text-slate-400">{selectedItem.skipped_items}</p>
                    </div>
                  </div>
                  
                  <div className="border-t border-slate-800 pt-4">
                    <p className="text-sm font-medium text-slate-400 mb-2">完成率</p>
                    <div className="flex items-center">
                      <div className="w-3/4 bg-slate-800/30 h-4 rounded overflow-hidden">
                        <div 
                          className={`h-full bg-[#00f2fe] transition-all duration-500`} 
                          style={{ width: `${selectedItem.completion_rate}%` }}
                        ></div>
                      </div>
                      <span className="ml-3 text-lg font-bold text-white">{selectedItem.completion_rate}%</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Basic Info */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-600 rounded flex items-center justify-center">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{selectedItem.name}</h3>
                      <p className="text-sm text-slate-400">
                        {selectedItem.barcode || '無條碼'} • 
                        {selectedItem.product_code || '無商品代碼'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-400">所屬清單</p>
                      <p className="text-lg text-white">{selectedItem.manifest_name}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-400">儲位</p>
                      <p className="text-lg text-white">{selectedItem.storage_location || '未指定'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-400">類別</p>
                      <p className="text-lg text-white">{selectedItem.category || '未分類'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-400">最後更新時間</p>
                      <p className="text-lg text-white">
                        {format(new Date(selectedItem.last_updated), 'yyyy-MM-dd HH:mm', { locale: zhTW })}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Quantities and Status */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-400">預期數量</p>
                      <p className="text-2xl font-bold text-[#00f2fe]">{selectedItem.expected_quantity}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-400">實際數量</p>
                      <p className={`text-2xl font-bold ${
                        selectedItem.actual_quantity !== null 
                          ? selectedItem.actual_quantity === selectedItem.expected_quantity 
                            ? 'text-[#00f2fe]' 
                            : selectedItem.actual_quantity > selectedItem.expected_quantity 
                              ? 'text-[#ff4b5c]' 
                              : 'text-[#00f2fe]' 
                          : 'text-slate-400'
                      }`}>
                        {selectedItem.actual_quantity !== null ? selectedItem.actual_quantity : '-'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-400">差異</p>
                      <p className={`text-2xl font-bold ${
                        selectedItem.discrepancy > 0 ? 'text-[#ff4b5c]' :
                        selectedItem.discrepancy < 0 ? 'text-[#00f2fe]' :
                        'text-slate-400'
                      }`}>
                        {selectedItem.discrepancy !== null ? selectedItem.discrepancy : '0'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-400">清點狀態</p>
                      <span className={`px-3 py-1 rounded ${
                        selectedItem.counted_status === 'counted' 
                          ? 'bg-[#00f2fe]/20 text-[#00f2fe]' :
                        selectedItem.counted_status === 'error' 
                          ? 'bg-[#ff4b5c]/20 text-[#ff4b5c]' :
                        selectedItem.counted_status === 'skipped' 
                          ? 'bg-slate-600/20 text-slate-400' :
                          'bg-slate-600/20 text-slate-300'
                      }`}>
                        {selectedItem.counted_status === 'counted' ? '已清點' :
                          selectedItem.counted_status === 'error' ? '錯誤' :
                          selectedItem.counted_status === 'skipped' ? '跳過' :
                          '待清點'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="border-t border-slate-800 pt-4">
                    <p className="text-sm font-medium text-slate-400 mb-2">清點資訊</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-400">清點人</p>
                        <p className="text-sm text-slate-200">{selectedItem.counted_by || '未清點'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-400">清點時間</p>
                        <p className="text-sm text-slate-200">
                          {selectedItem.counted_at 
                            ? format(new Date(selectedItem.counted_at), 'yyyy-MM-dd HH:mm', { locale: zhTW })
                            : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
            
            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:gap-3 pt-4">
              {viewMode === 'manifests' ? (
                <>
                  <button 
                    onClick={() => {
                      // TODO: Implement actual manifest restoration
                      alert('還原清單功能開發中');
                    }}
                    className="flex-1 px-4 py-3 bg-[#00f2fe]/20 border border-[#00f2fe] rounded-lg hover:bg-[#00f2fe]/30 transition-colors text-sm font-medium"
                  >
                    還原清單
                  </button>
                  
                  <button 
                    onClick={() => {
                      // TODO: Implement actual manifest export
                      alert('匯出清單功能開發中');
                    }}
                    className="flex-1 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
                  >
                    匯出此清單
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => {
                      // TODO: Implement actual count functionality
                      alert('清點功能開發中');
                    }}
                    className="flex-1 px-4 py-3 bg-[#00f2fe]/20 border border-[#00f2fe] rounded-lg hover:bg-[#00f2fe]/30 transition-colors text-sm font-medium"
                  >
                    重新清點
                  </button>
                  
                  <button 
                    onClick={() => {
                      // TODO: Implement actual discrepancy reporting
                      alert('舉報功能開發中');
                    }}
                    className="flex-1 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
                  >
                    舉報 discrepancy
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}