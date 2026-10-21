'use client';

import { useState, useEffect, useMemo } from 'react';
import { useDrugSearchSuspended } from '@/app/query/hooks/useDrugSearch';
import { useDrugTrendSuspended } from '@/app/query/hooks/useDrugTrend';
import { useOfflineCache } from '@/app/query/hooks/useOfflineCache';
import { format, formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Search, Clock, Bell, TrendingUp, Upload, CheckCircle2, XCircle, Loader2, AlertTriangle, CircleHelp } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';

interface DrugSearchResult {
  id: string;
  manifest_id: string;
  manifest_name: string;
  manifest_status: 'active' | 'archived';
  item_order: number;
  barcode: string | null;
  product_code: string | null;
  name: string;
  expected_quantity: number;
  actual_quantity: number | null;
  counted_status: 'pending' | 'counted' | 'error' | 'skipped';
  last_updated: string;
  storage_location: string | null;
  category: string | null;
  discrepancy: number; // actual - expected
}

export default function DrugSearchTab() {
  const [filters, setFilters] = useState({
    searchText: '',
    barcode: undefined as string | undefined,
    productCode: undefined as string | undefined,
    storageLocations: [] as string[],
    categories: [] as string[],
    dateFrom: undefined as string | undefined,
    dateTo: undefined as string | undefined,
    manifestStatus: ['active', 'archived'] as ('active' | 'archived')[],
    countedStatus: undefined as ('error' | 'pending' | 'completed')[] | undefined,
    hasDiscrepancy: null as boolean | null,
  });
  
  const { 
    data: searchResults = [], 
    error, 
    isLoading, 
    isFetching,
    hasNextPage,
    fetchNextPage,
    refetch
  } = useDrugSearchSuspended(filters);
  
  const { isCached } = useOfflineCache();
  const [selectedResult, setSelectedResult] = useState<DrugSearchResult | null>(null);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [isTrendLoading, setIsTrendLoading] = useState(false);

  const flatResults = useMemo((): DrugSearchResult[] => (searchResults as any).pages?.flat() ?? [], [searchResults]);

  // Handle result selection for trend view
  useEffect(() => {
    if (selectedResult) {
      setIsTrendLoading(true);
      // In a real implementation, we would fetch trend data here
      // For now, we'll simulate with mock data
      setTimeout(() => {
        const mockTrendData = Array.from({ length: 7 }, (_, i) => ({
          date: format(Date.now() - (6 - i) * 24 * 60 * 60 * 1000, 'yyyy-MM-dd'),
          expected_quantity: selectedResult.expected_quantity,
          actual_quantity: selectedResult.expected_quantity + Math.floor(Math.random() * 10) - 5,
          discrepancy: Math.floor(Math.random() * 10) - 5
        }));
        setTrendData(mockTrendData);
        setIsTrendLoading(false);
      }, 500);
    }
  }, [selectedResult]);
  
  const handleSearchChange = (value: string) => {
    setFilters(prev => ({ ...prev, searchText: value }));
  };
  
  const handleBarcodeScan = (barcode: string) => {
    setFilters(prev => ({ ...prev, barcode: barcode || undefined, searchText: barcode || '' }));
  };

  const handleResetFilters = () => {
    setFilters({
      searchText: '',
      barcode: undefined,
      productCode: undefined,
      storageLocations: [],
      categories: [],
      dateFrom: undefined,
      dateTo: undefined,
      manifestStatus: ['active', 'archived'],
      countedStatus: undefined,
      hasDiscrepancy: null,
    });
  };
  
  const handleExport = async () => {
    // TODO: Implement actual export functionality
    alert('Export functionality would be implemented here');
  };
  
  const handleViewDetails = (result: DrugSearchResult) => {
    setSelectedResult(result);
  };
  
  const handleCloseDetails = () => {
    setSelectedResult(null);
  };
  
  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4 p-4 bg-[#ff4b5c]/20 rounded-lg border border-[#ff4b5c]/50">
          <AlertTriangle className="w-5 h-5 text-[#ff4b5c]" />
          <div>
            <h3 className="font-medium text-[#ff4b5c]">搜尋失敗</h3>
            <p className="text-sm text-slate-400">{(error as Error).message}</p>
          </div>
        </div>
        <button 
          onClick={() => refetch()}
          className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
        >
          重試
        </button>
      </div>
    );
  }
  
  return (
    <div className="p-6">
      {/* Search Bar */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-medium text-slate-400 mb-1">搜尋藥品</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={filters.searchText}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="條碼、品名、製造廠代碼..."
                className="pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-[#00f2fe] focus:bg-slate-800 text-white"
              />
            </div>
          </div>
          
          <button 
            onClick={handleResetFilters}
            className="px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-800 transition-colors text-sm"
          >
            重置
          </button>
          
          <button 
            onClick={handleExport}
            className="px-4 py-3 bg-[#00f2fe]/20 border border-[#00f2fe] rounded-xl hover:bg-[#00f2fe]/30 transition-colors text-sm"
          >
            <Upload className="w-4 h-4 mr-2" />
            匯出結果
          </button>
        </div>
      </div>
      
      {/* Results Count and Status */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>共找到 {(searchResults as any).pages?.flat().length ?? 0} 項結果</span>
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
        {flatResults.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800">
              <thead>
                <tr className="bg-slate-800/70">
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">條碼</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">品名</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">清單</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">預期量</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">實際量</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">差異</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">狀態</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">更新時間</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {flatResults.map((result) => (
                  <tr
                    key={result.id}
                    className="hover:bg-slate-800/30 cursor-pointer"
                    onClick={() => handleViewDetails(result)}
                  >
                    <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                      {result.barcode || '無條碼'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-200">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-slate-600 rounded" />
                        <span className="font-medium">{result.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                      {result.manifest_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                      {result.expected_quantity}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-200 whitespace-nowrap">
                      {result.actual_quantity !== null ? result.actual_quantity : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        result.discrepancy > 0 ? 'bg-[#00f2fe]/20 text-[#00f2fe]' :
                        result.discrepancy < 0 ? 'bg-[#ff4b5c]/20 text-[#ff4b5c]' :
                        'bg-slate-600/20 text-slate-300'
                      }`}>
                        {result.discrepancy !== null ? result.discrepancy : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        result.counted_status === 'counted' ? 'bg-[#00f2fe]/20 text-[#00f2fe]' :
                        result.counted_status === 'error' ? 'bg-[#ff4b5c]/20 text-[#ff4b5c]' :
                        result.counted_status === 'skipped' ? 'bg-slate-600/20 text-slate-400' :
                        'bg-slate-600/20 text-slate-300'
                      }`}>
                        {result.counted_status === 'counted' ? '已清點' :
                          result.counted_status === 'error' ? '錯誤' :
                          result.counted_status === 'skipped' ? '跳過' :
                          '待清點'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400 whitespace-nowrap">
                      {formatDistanceToNow(new Date(result.last_updated), { addSuffix: true, locale: zhTW })}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button 
                          className="text-slate-400 hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetails(result);
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-400">
            <Search className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <p>無搜尋結果</p>
          </div>
        )}
      </div>
      
      {/* Selected Result Details Panel */}
      {selectedResult && (
        <div className="mt-6 bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <h2 className="text-xl font-bold text-white">藥品詳細資訊</h2>
            <button 
              onClick={handleCloseDetails}
              className="text-slate-400 hover:text-white"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 gap-6 px-6 py-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-600 rounded flex items-center justify-center">
                  <Search className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedResult.name}</h3>
                  <p className="text-sm text-slate-400">
                    {selectedResult.barcode || '無條碼'} • 
                    {selectedResult.product_code || '無商品代碼'}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-400">所屬清單</p>
                  <p className="text-lg text-white">{selectedResult.manifest_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-400">儲位</p>
                  <p className="text-lg text-white">{selectedResult.storage_location || '未指定'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-400">類別</p>
                  <p className="text-lg text-white">{selectedResult.category || '未分類'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-400">清單狀態</p>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    selectedResult.manifest_status === 'active' 
                      ? 'bg-[#00f2fe]/20 text-[#00f2fe]' 
                      : 'bg-slate-600/20 text-slate-400'
                  }`}>
                    {selectedResult.manifest_status === 'active' ? '進行中' : '已封存'}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Quantities and Status */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-400">預期數量</p>
                  <p className="text-2xl font-bold text-[#00f2fe]">{selectedResult.expected_quantity}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-400">實際數量</p>
                  <p className={`text-2xl font-bold ${
                    selectedResult.actual_quantity !== null 
                      ? selectedResult.actual_quantity === selectedResult.expected_quantity 
                        ? 'text-[#00f2fe]' 
                        : selectedResult.actual_quantity > selectedResult.expected_quantity 
                          ? 'text-[#ff4b5c]' 
                          : 'text-[#00f2fe]' 
                      : 'text-slate-400'
                  }`}>
                    {selectedResult.actual_quantity !== null ? selectedResult.actual_quantity : '-'}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-400">差異</p>
                  <p className={`text-2xl font-bold ${
                    selectedResult.discrepancy > 0 ? 'text-[#ff4b5c]' :
                    selectedResult.discrepancy < 0 ? 'text-[#00f2fe]' :
                    'text-slate-400'
                  }`}>
                    {selectedResult.discrepancy !== null ? selectedResult.discrepancy : '0'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-400">清點狀態</p>
                  <span className={`px-3 py-1 rounded ${
                    selectedResult.counted_status === 'counted' 
                      ? 'bg-[#00f2fe]/20 text-[#00f2fe]' 
                      : selectedResult.counted_status === 'error' 
                        ? 'bg-[#ff4b5c]/20 text-[#ff4b5c]' 
                        : selectedResult.counted_status === 'skipped' 
                          ? 'bg-slate-600/20 text-slate-400' 
                          : 'bg-slate-600/20 text-slate-300'
                  }`}>
                    {selectedResult.counted_status === 'counted' ? '已清點' :
                      selectedResult.counted_status === 'error' ? '錯誤' :
                      selectedResult.counted_status === 'skipped' ? '跳過' :
                      '待清點'}
                  </span>
                </div>
              </div>
              
              <div className="border-t border-slate-800 pt-4">
                <p className="text-sm font-medium text-slate-400 mb-2">最後更新時間</p>
                <p className="text-lg text-slate-200">
                  {format(new Date(selectedResult.last_updated), 'yyyy-MM-dd HH:mm:ss', { locale: zhTW })}
                </p>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:gap-3 pt-4">
              <button 
                onClick={() => {
                  // TODO: Implement actual count functionality
                  alert('清點功能開發中');
                }}
                className="flex-1 px-4 py-3 bg-[#00f2fe]/20 border border-[#00f2fe] rounded-lg hover:bg-[#00f2fe]/30 transition-colors text-sm font-medium"
              >
                開始清點
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
            </div>
          </div>
        </div>
      )}
      
      {/* Trend Chart Panel (when selected result has trend data) */}
      {selectedResult && trendData.length > 0 && (
        <div className="mt-6 bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <h2 className="text-xl font-bold text-white">數量趨勢圖</h2>
            <button 
              onClick={() => setSelectedResult(null)}
              className="text-slate-400 hover:text-white"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6">
            {/* In a real implementation, we would render a chart here using Recharts or similar */}
            <div className="h-64 bg-slate-800/30 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <TrendingUp className="w-8 h-8 text-slate-400 mb-3" />
                <p className="text-sm text-slate-400">趨勢圖表將在此處顯示</p>
                <p className="text-xs text-slate-500">（圖表功能開發中）</p>
              </div>
            </div>
            
            {/* Trend Data Table */}
            <div className="mt-6">
              <p className="text-sm font-medium text-slate-400 mb-2">最近 7 天趨勢數據</p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800">
                  <thead>
                    <tr className="bg-slate-800/70">
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">日期</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">預期量</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">實際量</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">差異</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {trendData.map((day, index) => (
                      <tr key={index} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2 text-sm text-slate-200">{day.date}</td>
                        <td className="px-4 py-2 text-sm text-slate-200">{day.expected_quantity}</td>
                        <td className="px-4 py-2 text-sm text-slate-200">{day.actual_quantity}</td>
                        <td className="px-4 py-2 text-sm whitespace-nowrap">
                          <span className={`px-1 py-0.5 rounded text-xs ${
                            day.discrepancy > 0 ? 'bg-[#ff4b5c]/20 text-[#ff4b5c]' :
                            day.discrepancy < 0 ? 'bg-[#00f2fe]/20 text-[#00f2fe]' :
                            'bg-slate-600/20 text-slate-300'
                          }`}>
                            {day.discrepancy}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}