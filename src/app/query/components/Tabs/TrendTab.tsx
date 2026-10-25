'use client';

import { useState, useEffect } from 'react';
import { useDrugTrendSuspended } from '@/app/query/hooks/useDrugTrend';
import { useHeatmapSuspended } from '@/app/query/hooks/useHeatmap';
import { useOfflineCache } from '@/app/query/hooks/useOfflineCache';
import { format, formatDistanceToNow, subDays, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Search, Clock, Bell, TrendingUp, Upload, CheckCircle2, XCircle, Loader2, AlertTriangle, CircleHelp, List, Users, Calendar, MapPin, BarChart3, PieChart, Activity, Square, Zap, FileText } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';

interface DrugTrendPoint {
  counted_at: string; // YYYY-MM-DD
  expected_quantity: number;
  actual_quantity: number | null;
  discrepancy: number; // actual - expected
}

interface HeatmapCell {
  storage_location: string;
  category: string;
  count: number;
  avg_discrepancy: number;
  error_rate: number;
}

interface TrendFilter {
  timeRange: '7d' | '30d' | '90d' | 'ytd' | 'all';
  drugSelection: {
    barcode: string | null;
    productCode: string | null;
    name: string | null;
  };
  comparisonType: 'absolute' | 'percentage';
  chartType: 'line' | 'bar' | 'area';
}

export default function TrendTab() {
  const [filters, setFilters] = useState<TrendFilter>({
    timeRange: '30d',
    drugSelection: {
      barcode: null,
      productCode: null,
      name: null
    },
    comparisonType: 'absolute',
    chartType: 'line'
  });
  
  const [heatmapDateRange, setHeatmapDateRange] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null
  });
  
  const { 
    data: trendData = [], 
    error: trendError, 
    isLoading: trendIsLoading,
    refetch: trendRefetch
  } = useDrugTrendSuspended(
    filters.drugSelection.barcode || '',
    filters.drugSelection.productCode || ''
  );
  
  const { 
    data: heatmapData = [], 
    error: heatmapError, 
    isLoading: heatmapIsLoading,
    refetch: heatmapRefetch
  } = useHeatmapSuspended(
    heatmapDateRange.from ?? undefined,
    heatmapDateRange.to ?? undefined
  );
  
  const { isCached } = useOfflineCache();
  const [selectedMetric, setSelectedMetric] = useState<'trend' | 'heatmap'>('trend');
  const [isComparing, setIsComparing] = useState(false);
  const [compareData, setCompareData] = useState<any[]>([]);
  
  // Calculate date range based on timeRange filter
  const getDateRange = (): { from: string; to: string } => {
    const to = new Date();
    let from: Date;
    
    switch (filters.timeRange) {
      case '7d':
        from = subDays(to, 7);
        break;
      case '30d':
        from = subDays(to, 30);
        break;
      case '90d':
        from = subDays(to, 90);
        break;
      case 'ytd':
        from = startOfMonth(new Date(to.getFullYear(), 0, 1));
        break;
      case 'all':
      default:
        from = new Date(2020, 0, 1); // Far enough back
        break;
    }
    
    return {
      from: format(from, 'yyyy-MM-dd'),
      to: format(to, 'yyyy-MM-dd')
    };
  };
  
  // Process trend data for display
  const processedTrendData = trendData.map(item => ({
    ...item,
    date: new Date(item.counted_at) // Ensure it's a Date object
  })).sort((a, b) => a.date.getTime() - b.date.getTime());
  
  // Calculate statistics
  const calculateStats = (data: DrugTrendPoint[]) => {
    if (data.length === 0) return null;
    
    const validData = data.filter(item => item.actual_quantity !== null);
    if (validData.length === 0) return null;
    
    const discrepancies = validData.map(item => item.discrepancy);
    const absDiscrepancies = discrepancies.map(Math.abs);
    
    const avgDiscrepancy = discrepancies.reduce((sum, val) => sum + val, 0) / discrepancies.length;
    const avgAbsDiscrepancy = absDiscrepancies.reduce((sum, val) => sum + val, 0) / absDiscrepancies.length;
    const errorCount = validData.filter(item => Math.abs(item.discrepancy) > 5).length; // Assuming 5+ units is significant error
    const errorRate = (errorCount / validData.length) * 100;
    
    return {
      avgDiscrepancy,
      avgAbsDiscrepancy,
      errorRate,
      totalRecords: validData.length,
      minDiscrepancy: Math.min(...discrepancies),
      maxDiscrepancy: Math.max(...discrepancies)
    };
  };
  
  const stats = calculateStats(trendData);
  
  const handleDrugSelectionChange = (field: keyof TrendFilter['drugSelection'], value: string | null) => {
    setFilters(prev => ({
      ...prev,
      drugSelection: {
        ...prev.drugSelection,
        [field]: value
      }
    }));
  };
  
  const handleTimeRangeChange = (value: TrendFilter['timeRange']) => {
    setFilters(prev => ({ ...prev, timeRange: value }));
  };
  
  const handleChartTypeChange = (value: TrendFilter['chartType']) => {
    setFilters(prev => ({ ...prev, chartType: value }));
  };
  
  const handleComparisonTypeChange = (value: TrendFilter['comparisonType']) => {
    setFilters(prev => ({ ...prev, comparisonType: value }));
  };
  
  const handleHeatmapDateChange = (type: 'from' | 'to', date: string | null) => {
    setHeatmapDateRange(prev => ({
      ...prev,
      [type]: date
    }));
  };
  
  const handleResetFilters = () => {
    setFilters({
      timeRange: '30d',
      drugSelection: {
        barcode: null,
        productCode: null,
        name: null
      },
      comparisonType: 'absolute',
      chartType: 'line'
    });
    setHeatmapDateRange({ from: null, to: null });
  };
  
  const handleExportTrend = async () => {
    alert('匯出趨勢圖功能開發中');
  };
  
  const handleExportHeatmap = async () => {
    alert('匯出熱力圖功能開發中');
  };
  
  const handleCompareWithAnotherDrug = async () => {
    // TODO: Implement actual comparison functionality
    setIsComparing(true);
    setCompareData([
      {
        name: '比較藥品 A',
        data: processedTrendData.slice(0, Math.min(7, processedTrendData.length))
      }
    ]);
  };
  
  const handleStopComparing = () => {
    setIsComparing(false);
    setCompareData([]);
  };
  
  if ((trendError && selectedMetric === 'trend') || (heatmapError && selectedMetric === 'heatmap')) {
    const error = selectedMetric === 'trend' ? trendError : heatmapError;
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4 p-4 bg-[#ff4b5c]/20 rounded-lg border border-[#ff4b5c]/50">
          <AlertTriangle className="w-5 h-5 text-[#ff4b5c]" />
          <div>
            <h3 className="font-medium text-[#ff4b5c]">載入失敗</h3>
            <p className="text-sm text-slate-400">{(error as unknown as Error).message}</p>
          </div>
        </div>
        <button 
          onClick={() => selectedMetric === 'trend' ? trendRefetch : heatmapRefetch}
          className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
        >
          重試
        </button>
      </div>
    );
  }
  
  return (
    <div className="p-6">
      {/* Controls Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold text-white mb-2 sm:mb-0">趨勢分析</h2>
          <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
            <button 
              onClick={handleResetFilters}
              className="px-3 py-1 bg-slate-800/50 border border-slate-700 rounded hover:bg-slate-800 transition-colors text-xs"
            >
              重置
            </button>
            
            <button 
              onClick={handleExportTrend}
              className="px-3 py-1 bg-[#00f2fe]/20 border border-[#00f2fe] rounded hover:bg-[#00f2fe]/30 transition-colors text-xs"
            >
              <FileText className="w-3 h-3 mr-1" />
              匯出趨勢
            </button>
            
            <button 
              onClick={handleExportHeatmap}
              className="px-3 py-1 bg-[#00f2fe]/20 border border-[#00f2fe] rounded hover:bg-[#00f2fe]/30 transition-colors text-xs"
            >
              <BarChart3 className="w-3 h-3 mr-1" />
              匯出熱力
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-slate-400">
          {isCached && (
            <span className="flex items-center gap-1">
              <CircleHelp className="w-3 h-3 text-[#00f2fe]" />
              <span>顯示快取資料</span>
            </span>
          )}
        </div>
      </div>
      
      {/* Tabs for Trend vs Heatmap */}
      <div className="mb-6 flex items-center gap-4 pb-3 border-b border-slate-800">
        <button 
          onClick={() => setSelectedMetric('trend')}
          className={`px-4 py-2 text-sm font-medium ${
            selectedMetric === 'trend' 
              ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]' 
              : 'text-slate-400 hover:bg-slate-800/50'
          } rounded-lg transition-colors`}
        >
          藥品趨勢
        </button>
        <button 
          onClick={() => setSelectedMetric('heatmap')}
          className={`px-4 py-2 text-sm font-medium ${
            selectedMetric === 'heatmap' 
              ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]' 
              : 'text-slate-400 hover:bg-slate-800/50'
          } rounded-lg transition-colors`}
        >
          位置熱力圖
        </button>
      </div>
      
      {/* Selected Metric Content */}
      {selectedMetric === 'trend' ? (
        <>
          {/* Drug Selection */}
          <div className="mb-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-600 rounded flex items-center justify-center">
                  <Search className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">選擇藥品進行趨勢分析</h3>
                  <p className="text-sm text-slate-400">
                    輸入條碼、商品代碼或藥品名稱來查看歷史趨勢
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">條碼</label>
                  <input
                    type="text"
                    value={filters.drugSelection.barcode ?? ''}
                    onChange={(e) => handleDrugSelectionChange('barcode', e.target.value || null)}
                    placeholder="例如: 1234567890123"
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-[#00f2fe] focus:bg-slate-800 text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">商品代碼</label>
                  <input
                    type="text"
                    value={filters.drugSelection.productCode ?? ''}
                    onChange={(e) => handleDrugSelectionChange('productCode', e.target.value || null)}
                    placeholder="例如: PDT-001"
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-[#00f2fe] focus:bg-slate-800 text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">藥品名稱</label>
                  <input
                    type="text"
                    value={filters.drugSelection.name ?? ''}
                    onChange={(e) => handleDrugSelectionChange('name', e.target.value || null)}
                    placeholder="例如: 阿司匹林"
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-[#00f2fe] focus:bg-slate-800 text-white"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Time Range Selector */}
          <div className="mb-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-600 rounded flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">時間範圍</h3>
                  <p className="text-sm text-slate-400">
                    選擇要分析的時間期間
                  </p>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => handleTimeRangeChange('7d')}
                  className={`px-3 py-1 text-sm font-medium ${
                    filters.timeRange === '7d' 
                      ? 'bg-[#00f2fe]/20 text-[#00f2fe]' 
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                  } rounded transition-colors`}
                >
                  7 天
                </button>
                <button 
                  onClick={() => handleTimeRangeChange('30d')}
                  className={`px-3 py-1 text-sm font-medium ${
                    filters.timeRange === '30d' 
                      ? 'bg-[#00f2fe]/20 text-[#00f2fe]' 
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                  } rounded transition-colors`}
                >
                  30 天
                </button>
                <button 
                  onClick={() => handleTimeRangeChange('90d')}
                  className={`px-3 py-1 text-sm font-medium ${
                    filters.timeRange === '90d' 
                      ? 'bg-[#00f2fe]/20 text-[#00f2fe]' 
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                  } rounded transition-colors`}
                >
                  90 天
                </button>
                <button 
                  onClick={() => handleTimeRangeChange('ytd')}
                  className={`px-3 py-1 text-sm font-medium ${
                    filters.timeRange === 'ytd' 
                      ? 'bg-[#00f2fe]/20 text-[#00f2fe]' 
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                  } rounded transition-colors`}
                >
                  年初至今
                </button>
                <button 
                  onClick={() => handleTimeRangeChange('all')}
                  className={`px-3 py-1 text-sm font-medium ${
                    filters.timeRange === 'all' 
                      ? 'bg-[#00f2fe]/20 text-[#00f2fe]' 
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                  } rounded transition-colors`}
                >
                  全部
                </button>
              </div>
            </div>
          </div>
          
          {/* Chart Options */}
          <div className="mb-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-600 rounded flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">圖表選項</h3>
                  <p className="text-sm text-slate-400">
                    自訂趨勢圖表的顯示方式
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-400">比較方式</label>
                  <div className="flex space-x-2">
                    <label className="flex items-center gap-1 text-sm cursor-pointer">
                      <input
                        type="radio"
                        value="absolute"
                        checked={filters.comparisonType === 'absolute'}
                        onChange={(e) => handleComparisonTypeChange(e.target.value as any)}
                        className="w-4 h-4 text-[#00f2fe]"
                        aria-label="絕對值比較"
                      />
                      <span>絕對值</span>
                    </label>
                    <label className="flex items-center gap-1 text-sm cursor-pointer">
                      <input
                        type="radio"
                        value="percentage"
                        checked={filters.comparisonType === 'percentage'}
                        onChange={(e) => handleComparisonTypeChange(e.target.value as any)}
                        className="w-4 h-4 text-[#00f2fe]"
                        aria-label="百分比比較"
                      />
                      <span>百分比</span>
                    </label>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-400">圖表類型</label>
                  <div className="flex space-x-2">
                    <label className="flex items-center gap-1 text-sm cursor-pointer">
                      <input
                        type="radio"
                        value="line"
                        checked={filters.chartType === 'line'}
                        onChange={(e) => handleChartTypeChange(e.target.value as any)}
                        className="w-4 h-4 text-[#00f2fe]"
                        aria-label="折線圖"
                      />
                      <span>折線圖</span>
                    </label>
                    <label className="flex items-center gap-1 text-sm cursor-pointer">
                      <input
                        type="radio"
                        value="bar"
                        checked={filters.chartType === 'bar'}
                        onChange={(e) => handleChartTypeChange(e.target.value as any)}
                        className="w-4 h-4 text-[#00f2fe]"
                        aria-label="長條圖"
                      />
                      <span>長條圖</span>
                    </label>
                    <label className="flex items-center gap-1 text-sm cursor-pointer">
                      <input
                        type="radio"
                        value="area"
                        checked={filters.chartType === 'area'}
                        onChange={(e) => handleChartTypeChange(e.target.value as any)}
                        className="w-4 h-4 text-[#00f2fe]"
                        aria-label="區域圖"
                      />
                      <span>區域圖</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="mb-6 flex flex-col sm:flex-row sm:gap-3">
            <button 
              onClick={() => {
                // Trigger refetch with current filters
                trendRefetch();
              }}
              className="flex-1 px-4 py-3 bg-[#00f2fe]/20 border border-[#00f2fe] rounded-lg hover:bg-[#00f2fe]/30 transition-colors text-sm font-medium"
            >
              更新趨勢圖
            </button>
            
            <button 
              onClick={handleCompareWithAnotherDrug}
              className="flex-1 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
            >
              比較其他藥品
            </button>
          </div>
          
          {/* Comparison Controls */}
          {isComparing && (
            <div className="mb-4 p-3 bg-slate-800/30 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-400">正在比較趨勢</span>
                <button 
                  onClick={handleStopComparing}
                  className="text-slate-400 hover:text-white"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          
          {/* Trend Chart Display */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-800 overflow-hidden">
            {trendIsLoading && (
              <div className="p-12 text-center">
                <Loader2 className="w-8 h-8 mx-auto mb-4 text-[#00f2fe] animate-spin" />
                <p className="text-sm text-slate-400">正在載入趨勢資料...</p>
              </div>
            )}
            
            {!trendIsLoading && processedTrendData.length === 0 && (
              <div className="p-8 text-center">
                <Search className="w-10 h-10 mx-auto mb-4 text-slate-500" />
                <h3 className="text-lg font-medium text-slate-400 mb-2">無趨勢資料</h3>
                <p className="text-sm text-slate-500">
                  請選擇藥品並確認時間範圍以查看趨勢分析
                </p>
                <button 
                  onClick={() => trendRefetch()}
                  className="mt-4 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  重新載入
                </button>
              </div>
            )}
            
            {!trendIsLoading && processedTrendData.length > 0 && (
              <div>
                {/* Chart Placeholder - in reality would use Recharts or similar */}
                <div className="h-96 bg-slate-800/30">
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      {filters.chartType === 'line' && (
                        <>
                          <TrendingUp className="w-12 h-12 text-slate-400 mb-3" />
                          <p className="text-sm text-slate-400">折線圖表將在此處顯示</p>
                        </>
                      )}
                      {filters.chartType === 'bar' && (
                        <>
                          <BarChart3 className="w-12 h-12 text-slate-400 mb-3" />
                          <p className="text-sm text-slate-400">長條圖表將在此處顯示</p>
                        </>
                      )}
                      {filters.chartType === 'area' && (
                        <>
                          <Activity className="w-12 h-12 text-slate-400 mb-3" />
                          <p className="text-sm text-slate-400">區域圖表將在此處顯示</p>
                        </>
                      )}
                      <p className="text-xs text-slate-500 mt-2">（圖表功能開發中）</p>
                    </div>
                  </div>
                </div>
                
                {/* Statistics */}
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-slate-400 mb-4">統計摘要</h3>
                  {stats ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="bg-slate-800/30 rounded-lg p-4">
                        <p className="text-sm font-medium text-slate-400">平均差異</p>
                        <p className={`text-2xl font-bold ${
                        stats.avgDiscrepancy > 0 
                          ? 'text-[#ff4b5c]' 
                          : stats.avgDiscrepancy < 0 
                            ? 'text-[#00f2fe]' 
                            : 'text-slate-400'
                      }`}>
                          {stats.avgDiscrepancy.toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-400">單位: 項目數量</p>
                      </div>
                      
                      <div className="bg-slate-800/30 rounded-lg p-4">
                        <p className="text-sm font-medium text-slate-400">平均絕對差異</p>
                        <p className="text-2xl font-bold text-[#00f2fe]">
                          {stats.avgAbsDiscrepancy.toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-400">單位: 項目數量</p>
                      </div>
                      
                      <div className="bg-slate-800/30 rounded-lg p-4">
                        <p className="text-sm font-medium text-slate-400">錯誤率</p>
                        <p className={`text-2xl font-bold ${
                            stats.errorRate > 10 
                              ? 'text-[#ff4b5c]' 
                              : stats.errorRate > 5 
                                ? 'text-slate-400' 
                                : 'text-[#00f2fe]'
                          }`}>
                          {stats.errorRate.toFixed(1)}%
                        </p>
                        <p className="text-xs text-slate-400">誤差 &gt; 5 項目視為錯誤</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-sm text-slate-400">暫無統計數據可顯示</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Heatmap Controls */}
          <div className="mb-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-600 rounded flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">日期範圍</h3>
                  <p className="text-sm text-slate-400">
                    選擇要分析的位置熱力圖時間範圍
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">開始日期</label>
                  <input
                    type="date"
                    value={heatmapDateRange.from ?? ''}
                    onChange={(e) => handleHeatmapDateChange('from', e.target.value || null)}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-[#00f2fe] focus:bg-slate-800 text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">結束日期</label>
                  <input
                    type="date"
                    value={heatmapDateRange.to ?? ''}
                    onChange={(e) => handleHeatmapDateChange('to', e.target.value || null)}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-[#00f2fe] focus:bg-slate-800 text-white"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="mb-6 flex flex-col sm:flex-row sm:gap-3">
            <button 
              onClick={() => {
                // Trigger refetch with current filters
                heatmapRefetch();
              }}
              className="flex-1 px-4 py-3 bg-[#00f2fe]/20 border border-[#00f2fe] rounded-lg hover:bg-[#00f2fe]/30 transition-colors text-sm font-medium"
            >
              更新熱力圖
            </button>
            
            <button 
              onClick={handleResetFilters}
              className="flex-1 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
            >
              重置篩選
            </button>
          </div>
          
          {/* Heatmap Display */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-800 overflow-hidden">
            {heatmapIsLoading && (
              <div className="p-12 text-center">
                <Loader2 className="w-8 h-8 mx-auto mb-4 text-[#00f2fe] animate-spin" />
                <p className="text-sm text-slate-400">正在載入熱力圖資料...</p>
              </div>
            )}
            
            {!heatmapIsLoading && heatmapData.length === 0 && (
              <div className="p-8 text-center">
                <MapPin className="w-10 h-10 mx-auto mb-4 text-slate-500" />
                <h3 className="text-lg font-medium text-slate-400 mb-2">無熱力圖資料</h3>
                <p className="text-sm text-slate-500">
                  請選擇日期範圍以查看位置熱力分析
                </p>
                <button 
                  onClick={() => heatmapRefetch()}
                  className="mt-4 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  重新載入
                </button>
              </div>
            )}
            
            {!heatmapIsLoading && heatmapData.length > 0 && (
              <>
                {/* Heatmap Placeholder - in reality would use a heatmap library */}
                <div className="h-96 bg-slate-800/30">
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <MapPin className="w-12 h-12 text-slate-400 mb-3" />
                      <p className="text-sm text-slate-400">熱力圖將在此處顯示</p>
                      <p className="text-xs text-slate-500 mt-2">（熱力圖功能開發中）</p>
                    </div>
                  </div>
                </div>
                
                {/* Legend */}
                <div className="mt-6">
                  <p className="text-sm font-medium text-slate-400 mb-2">圖例說明</p>
                  <div className="flex flex-col sm:flex-row sm:gap-6">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-[#ff4b5c]/20 rounded" />
                      <span>高錯誤率區域</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-[#00f2fe]/20 rounded" />
                      <span>低誤差區域</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-slate-600/20 rounded" />
                      <span>中等誤差區域</span>
                    </div>
                  </div>
                </div>
                
                {/* Data Table */}
                <div className="mt-6">
                  <p className="text-sm font-medium text-slate-400 mb-2">熱力圖明細表</p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-800">
                      <thead>
                        <tr className="bg-slate-800/70">
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">儲位</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">類別</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">記錄數</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">平均差異</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">錯誤率</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {heatmapData.map((item, index) => {
                          const avgDiscrepancy = item.total_items > 0 ? item.total_discrepancy_qty / item.total_items : 0;
                          return (
                            <tr key={index} className="hover:bg-slate-800/30">
                              <td className="px-4 py-2 text-sm text-slate-200">{item.storage_location}</td>
                              <td className="px-4 py-2 text-sm text-slate-200">{item.category}</td>
                              <td className="px-4 py-2 text-sm text-slate-200">{item.total_items}</td>
                              <td className="px-4 py-2 text-sm whitespace-nowrap">
                                <span className={`px-1 py-0.5 rounded text-xs ${
                                  avgDiscrepancy > 0 ? 'bg-[#ff4b5c]/20 text-[#ff4b5c]' :
                                  avgDiscrepancy < 0 ? 'bg-[#00f2fe]/20 text-[#00f2fe]' :
                                  'bg-slate-600/20 text-slate-300'
                                }`}>
                                  {avgDiscrepancy.toFixed(2)}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm whitespace-nowrap">
                                <span className={`px-1 py-0.5 rounded text-xs ${
                                  item.error_rate > 10 ? 'bg-[#ff4b5c]/20 text-[#ff4b5c]' :
                                  item.error_rate > 5 ? 'bg-slate-600/20 text-slate-400' :
                                  'bg-[#00f2fe]/20 text-[#00f2fe]'
                              }`}>
                                {item.error_rate.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}