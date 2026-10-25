'use client';

import { useState, useEffect } from 'react';
import { useOfflineCache } from '@/app/query/hooks/useOfflineCache';
import { format, formatDistanceToNow, subDays, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Search, Clock, Bell, TrendingUp, Upload, CheckCircle2, XCircle, Loader2, AlertTriangle, CircleHelp, List, Users, Calendar, MapPin, BarChart3, PieChart, Activity, Square, Zap, FileText, Settings, PieChart as PieChartIcon, LayoutGrid } from 'lucide-react';

interface ReportFilter {
  reportType: 'summary' | 'discrepancy' | 'trend' | 'accuracy';
  timeRange: '7d' | '30d' | '90d' | 'ytd' | 'all';
  manifestStatus: ('active' | 'archived')[];
  exportFormat: 'pdf' | 'excel' | 'csv';
}

interface SummaryStats {
  total_manifests: number;
  active_manifests: number;
  total_items: number;
  total_counted: number;
  total_errors: number;
  total_skipped: number;
  overall_completion_rate: number;
  avg_completion_rate: number;
  manifests_completed: number;
  manifests_with_errors: number;
}

interface DiscrepancyItem {
  id: string;
  manifest_name: string;
  drug_name: string;
  barcode: string | null;
  expected_quantity: number;
  actual_quantity: number;
  discrepancy: number;
  discrepancy_percentage: number;
  storage_location: string | null;
  category: string | null;
  counted_by: string | null;
  counted_at: string;
}

interface TrendDataPoint {
  date: string; // YYYY-MM-DD
  total_items: number;
  total_counted: number;
  total_errors: number;
  completion_rate: number;
}

interface AccuracyMetrics {
  by_manifest: Array<{
    manifest_name: string;
    total_items: number;
    correct_count: number;
    accuracy_rate: number;
  }>;
  by_category: Array<{
    category: string;
    total_items: number;
    correct_count: number;
    accuracy_rate: number;
  }>;
  by_storage: Array<{
    storage_location: string;
    total_items: number;
    correct_count: number;
    accuracy_rate: number;
  }>;
}

export default function ReportTab() {
  const [filters, setFilters] = useState<ReportFilter>({
    reportType: 'summary',
    timeRange: '30d',
    manifestStatus: ['active', 'archived'],
    exportFormat: 'pdf'
  });
  
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isCached } = useOfflineCache();
  
  // Mock data functions
  const generateSummaryStats = (): SummaryStats => {
    return {
      total_manifests: 42,
      active_manifests: 28,
      total_items: 1848,
      total_counted: 1526,
      total_errors: 89,
      total_skipped: 42,
      overall_completion_rate: 83,
      avg_completion_rate: 79,
      manifests_completed: 15,
      manifests_with_errors: 22
    };
  };
  
  const generateDiscrepancyData = (count: number = 20): DiscrepancyItem[] => {
    const data = [];
    for (let i = 0; i < count; i++) {
      const expected = 10 + Math.floor(Math.random() * 40);
      const actual = expected + Math.floor(Math.random() * 20) - 10;
      const discrepancy = actual - expected;
      const discrepancyPercentage = Math.abs((discrepancy / expected) * 100);
      
      data.push({
        id: `discrepancy-${i + 1}`,
        manifest_name: `2026-10-${String(Math.floor(i / 5) + 1).padStart(2, '0')} 清單`,
        drug_name: `藥品名稱 ${String(i % 20 + 1).padStart(3, '0')}`,
        barcode: `1234567890${String(i % 100).padStart(2, '0')}`,
        expected_quantity: expected,
        actual_quantity: actual,
        discrepancy: discrepancy,
        discrepancy_percentage: Number(discrepancyPercentage.toFixed(1)),
        storage_location: ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'][i % 6],
        category: ['西藥', '中藥', '保健品', '醫療材料'][i % 4],
        counted_by: `藥師${String(i % 3 + 1)}`,
        counted_at: new Date(Date.now() - i * 6 * 60 * 60 * 1000).toISOString()
      });
    }
    return data;
  };
  
  const generateTrendData = (): TrendDataPoint[] => {
    const data = [];
    const days = 30;
    
    for (let i = 0; i < days; i++) {
      const date = subDays(new Date(), i);
      const totalItems = 44 + Math.floor(Math.random() * 8) * 4; // 44-76
      const totalCounted = Math.floor(totalItems * (0.7 + Math.random() * 0.25)); // 70-95%
      const totalErrors = Math.floor(totalItems * 0.05); // ~5%
      
      data.push({
        date: format(date, 'yyyy-MM-dd'),
        total_items: totalItems,
        total_counted: totalCounted,
        total_errors: totalErrors,
        completion_rate: Math.round((totalCounted / totalItems) * 100)
      });
    }
    
    return data.reverse(); // Oldest to newest
  };
  
  const generateAccuracyMetrics = (): AccuracyMetrics => {
    return {
      by_manifest: [
        { manifest_name: '2026-10-01 清單', total_items: 44, correct_count: 38, accuracy_rate: 86 },
        { manifest_name: '2026-10-02 清單', total_items: 48, correct_count: 41, accuracy_rate: 85 },
        { manifest_name: '2026-10-03 清單', total_items: 52, correct_count: 44, accuracy_rate: 85 },
        { manifest_name: '2026-10-04 清單', total_items: 44, correct_count: 36, accuracy_rate: 82 },
        { manifest_name: '2026-10-05 清單', total_items: 48, correct_count: 39, accuracy_rate: 81 }
      ],
      by_category: [
        { category: '西藥', total_items: 620, correct_count: 542, accuracy_rate: 87 },
        { category: '中藥', total_items: 480, correct_count: 408, accuracy_rate: 85 },
        { category: '保健品', total_items: 420, correct_count: 357, accuracy_rate: 85 },
        { category: '醫療材料', total_items: 328, correct_count: 262, accuracy_rate: 80 }
      ],
      by_storage: [
        { storage_location: 'A1', total_items: 312, correct_count: 278, accuracy_rate: 89 },
        { storage_location: 'A2', total_items: 296, correct_count: 258, accuracy_rate: 87 },
        { storage_location: 'A3', total_items: 284, correct_count: 245, accuracy_rate: 86 },
        { storage_location: 'B1', total_items: 276, correct_count: 231, accuracy_rate: 84 },
        { storage_location: 'B2', total_items: 268, correct_count: 220, accuracy_rate: 82 },
        { storage_location: 'B3', total_items: 252, correct_count: 201, accuracy_rate: 80 }
      ]
    };
  };
  
  const handleReportTypeChange = (value: ReportFilter['reportType']) => {
    setFilters(prev => ({ ...prev, reportType: value }));
    // Reset data when report type changes
    setReportData(null);
  };
  
  const handleTimeRangeChange = (value: ReportFilter['timeRange']) => {
    setFilters(prev => ({ ...prev, timeRange: value }));
    // Reset data when time range changes
    setReportData(null);
  };
  
  const handleManifestStatusChange = (value: ReportFilter['manifestStatus']) => {
    setFilters(prev => ({ ...prev, manifestStatus: value }));
    // Reset data when manifest status changes
    setReportData(null);
  };
  
  const handleExportFormatChange = (value: ReportFilter['exportFormat']) => {
    setFilters(prev => ({ ...prev, exportFormat: value }));
  };
  
  const handleResetFilters = () => {
    setFilters({
      reportType: 'summary',
      timeRange: '30d',
      manifestStatus: ['active', 'archived'],
      exportFormat: 'pdf'
    });
    setReportData(null);
  };
  
  const handleGenerateReport = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      let data = null;
      
      switch (filters.reportType) {
        case 'summary':
          data = generateSummaryStats();
          break;
        case 'discrepancy':
          data = generateDiscrepancyData(25);
          break;
        case 'trend':
          data = generateTrendData();
          break;
        case 'accuracy':
          data = generateAccuracyMetrics();
          break;
      }
      
      setReportData(data);
    } catch (err: any) {
      setError(err.message ?? '未知錯誤');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleExportReport = async () => {
    if (!reportData) {
      alert('請先生成報表');
      return;
    }
    
    // TODO: Implement actual export functionality
    alert(`${filters.exportFormat.toUpperCase()} 匯出功能開發中`);
  };
  
  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4 p-4 bg-[#ff4b5c]/20 rounded-lg border border-[#ff4b5c]/50">
          <AlertTriangle className="w-5 h-5 text-[#ff4b5c]" />
          <div>
            <h3 className="font-medium text-[#ff4b5c]">報表生成失敗</h3>
            <p className="text-sm text-slate-400">{error}</p>
          </div>
        </div>
        <button 
          onClick={handleGenerateReport}
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
          <h2 className="text-xl font-bold text-white mb-2 sm:mb-0">報表與儀表板</h2>
          <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
            <button 
              onClick={handleResetFilters}
              className="px-3 py-1 bg-slate-800/50 border border-slate-700 rounded hover:bg-slate-800 transition-colors text-xs"
            >
              重置
            </button>
            
            <button 
              onClick={handleGenerateReport}
              className="px-3 py-1 bg-[#00f2fe]/20 border border-[#00f2fe] rounded hover:bg-[#00f2fe]/30 transition-colors text-xs"
            >
              生成報表
            </button>
            
            <button 
              onClick={handleExportReport}
              className="px-3 py-1 bg-[#00f2fe]/20 border border-[#00f2fe] rounded hover:bg-[#00f2fe]/30 transition-colors text-xs"
              disabled={!reportData}
            >
              <Upload className="w-3 h-3 mr-1" />
              匯出報表
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
      
      {/* Report Type Selector */}
      <div className="mb-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-600 rounded flex items-center justify-center">
              <LayoutGrid className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">報表類型</h3>
              <p className="text-sm text-slate-400">
                選擇要生成的報表類型
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button 
              onClick={() => handleReportTypeChange('summary')}
              className={`px-4 py-3 text-sm font-medium ${
                filters.reportType === 'summary' 
                  ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]' 
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              } rounded transition-colors`}
            >
              摘要報表
            </button>
            
            <button 
              onClick={() => handleReportTypeChange('discrepancy')}
              className={`px-4 py-3 text-sm font-medium ${
                filters.reportType === 'discrepancy' 
                  ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]' 
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              } rounded transition-colors`}
            >
              差異分析報表
            </button>
            
            <button 
              onClick={() => handleReportTypeChange('trend')}
              className={`px-4 py-3 text-sm font-medium ${
                filters.reportType === 'trend' 
                  ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]' 
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              } rounded transition-colors`}
            >
              趨勢分析報表
            </button>
            
            <button 
              onClick={() => handleReportTypeChange('accuracy')}
              className={`px-4 py-3 text-sm font-medium ${
                filters.reportType === 'accuracy' 
                  ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]' 
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              } rounded transition-colors`}
            >
              準確性報表
            </button>
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
                選擇報表涵蓋的時間期間
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
      
      {/* Manifest Status Filter */}
      <div className="mb-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-600 rounded flex items-center justify-center">
              <List className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">清單狀態</h3>
              <p className="text-sm text-slate-400">
                選擇要包含的清單狀態
              </p>
            </div>
          </div>
          
          <div className="flex space-x-2">
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filters.manifestStatus.includes('active')}
                onChange={(e) => {
                  const status = e.target.checked 
                    ? [...filters.manifestStatus, 'active' as const] 
                    : filters.manifestStatus.filter(s => s !== 'active');
                  handleManifestStatusChange(status as ('archived' | 'active')[]);
                }}
                className="w-4 h-4 text-[#00f2fe]"
              />
              <span>進行中</span>
            </label>
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filters.manifestStatus.includes('archived')}
                onChange={(e) => {
                  const status = e.target.checked 
                    ? [...filters.manifestStatus, 'archived' as const] 
                    : filters.manifestStatus.filter(s => s !== 'archived');
                  handleManifestStatusChange(status as ('archived' | 'active')[]);
                }}
                className="w-4 h-4 text-[#00f2fe]"
              />
              <span>已封存</span>
            </label>
          </div>
        </div>
      </div>
      
      {/* Export Format Selector */}
      <div className="mb-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-600 rounded flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">匯出格式</h3>
              <p className="text-sm text-slate-400">
                選擇報表匯出的檔案格式
              </p>
            </div>
          </div>
          
          <div className="flex space-x-2">
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="radio"
                value="pdf"
                checked={filters.exportFormat === 'pdf'}
                onChange={(e) => handleExportFormatChange(e.target.value as any)}
                className="w-4 h-4 text-[#00f2fe]"
              />
              <span>PDF</span>
            </label>
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="radio"
                value="excel"
                checked={filters.exportFormat === 'excel'}
                onChange={(e) => handleExportFormatChange(e.target.value as any)}
                className="w-4 h-4 text-[#00f2fe]"
              />
              <span>Excel</span>
            </label>
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="radio"
                value="csv"
                checked={filters.exportFormat === 'csv'}
                onChange={(e) => handleExportFormatChange(e.target.value as any)}
                className="w-4 h-4 text-[#00f2fe]"
              />
              <span>CSV</span>
            </label>
          </div>
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="mb-6 flex flex-col sm:flex-row sm:gap-3">
        <button 
          onClick={handleGenerateReport}
          className="flex-1 px-4 py-3 bg-[#00f2fe]/20 border border-[#00f2fe] rounded-lg hover:bg-[#00f2fe]/30 transition-colors text-sm font-medium"
        >
          生成報表
        </button>
        
        <button 
          onClick={handleExportReport}
          className="flex-1 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
          disabled={!reportData}
        >
          匯出報表
        </button>
      </div>
      
      {/* Report Display */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-800 overflow-hidden">
        {isLoading && (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 text-[#00f2fe] animate-spin" />
            <p className="text-sm text-slate-400">正在生成報表...</p>
          </div>
        )}
        
        {!isLoading && !reportData && (
          <div className="p-8 text-center">
            <LayoutGrid className="w-10 h-10 mx-auto mb-4 text-slate-500" />
            <h3 className="text-lg font-medium text-slate-400 mb-2">請選擇報表類型並點擊生成報表</h3>
            <p className="text-sm text-slate-500">
              設定報表參數後，點擊「生成報表」按鈕來查看結果
            </p>
          </div>
        )}
        
        {!isLoading && reportData && (
          <>
            {/* Summary Report */}
            {filters.reportType === 'summary' && (
              <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">清點摘要報表</h3>
                <p className="text-sm text-slate-400 mb-6">
                  時間範圍: {format(subDays(new Date(), 30), 'yyyy-MM-dd')} ~ {format(new Date(), 'yyyy-MM-dd')}
                </p>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="bg-slate-800/30 rounded-lg p-4">
                    <p className="text-sm font-medium text-slate-400">總清單數</p>
                    <p className="text-2xl font-bold text-[#00f2fe]">{reportData.total_manifests}</p>
                    <p className="text-xs text-slate-400">({reportData.active_manifests} 進行中, {reportData.total_manifests - reportData.active_manifests} 已封存)</p>
                  </div>
                  
                  <div className="bg-slate-800/30 rounded-lg p-4">
                    <p className="text-sm font-medium text-slate-400">總項目數</p>
                    <p className="text-2xl font-bold text-[#00f2fe]">{reportData.total_items}</p>
                    <p className="text-xs text-slate-400">平均每清單: {Math.round(reportData.total_items / reportData.total_manifests)} 項目</p>
                  </div>
                  
                  <div className="bg-slate-800/30 rounded-lg p-4">
                    <p className="text-sm font-medium text-slate-400">已清點項目</p>
                    <p className="text-2xl font-bold text-[#00f2fe]">{reportData.total_counted}</p>
                    <p className="text-xs text-slate-400">完成率: {reportData.overall_completion_rate}%</p>
                  </div>
                  
                  <div className="bg-slate-800/30 rounded-lg p-4">
                    <p className="text-sm font-medium text-slate-400">錯誤項目</p>
                    <p className="text-2xl font-bold text-[#ff4b5c]">{reportData.total_errors}</p>
                    <p className="text-xs text-slate-400">跳過項目: {reportData.total_skipped}</p>
                  </div>
                  
                  <div className="bg-slate-800/30 rounded-lg p-4">
                    <p className="text-sm font-medium text-slate-400">平均完成率</p>
                    <p className="text-2xl font-bold text-[#00f2fe]">{reportData.avg_completion_rate}%</p>
                    <p className="text-xs text-slate-400">清點完成的清單數: {reportData.manifests_completed}</p>
                  </div>
                  
                  <div className="bg-slate-800/30 rounded-lg p-4">
                    <p className="text-sm font-medium text-slate-400">有錯誤的清單</p>
                    <p className="text-2xl font-bold text-[#ff4b5c]">{reportData.manifests_with_errors}</p>
                    <p className="text-xs text-slate-400">錯誤清單比例: {Math.round((reportData.manifests_with_errors / reportData.total_manifests) * 100)}%</p>
                  </div>
                  
                  <div className="bg-slate-800/30 rounded-lg p-4">
                    <p className="text-sm font-medium text-slate-400">清點準確度</p>
                    <p className="text-2xl font-bold text-[#00f2fe]">
                      {Math.round((reportData.total_counted - reportData.total_errors) / reportData.total_counted * 100)}%
                    </p>
                    <p className="text-xs text-slate-400">扣除錯誤後的準確率</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Discrepancy Report */}
            {filters.reportType === 'discrepancy' && (
              <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">差異分析報表</h3>
                <p className="text-sm text-slate-400 mb-6">
                  時間範圍: {format(subDays(new Date(), 30), 'yyyy-MM-dd')} ~ {format(new Date(), 'yyyy-MM-dd')}
                </p>
                
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-800">
                    <thead>
                      <tr className="bg-slate-800/70">
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">清單名稱</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">藥品名稱</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">條碼</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">預期量</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">實際量</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">差異</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">差異%</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">儲位</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">類別</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">清點人</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">清點時間</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {reportData.map((item: DiscrepancyItem, index: number) => (
                        <tr key={item.id} className="hover:bg-slate-800/30">
                          <td className="px-4 py-2 text-sm text-slate-200">{item.manifest_name}</td>
                          <td className="px-4 py-2 text-sm text-slate-200">{item.drug_name}</td>
                          <td className="px-4 py-2 text-sm text-slate-200">{item.barcode || '無條碼'}</td>
                          <td className="px-4 py-2 text-sm text-slate-200">{item.expected_quantity}</td>
                          <td className="px-4 py-2 text-sm text-slate-200">{item.actual_quantity}</td>
                          <td className="px-4 py-2 text-sm whitespace-nowrap">
                            <span className={`px-1 py-0.5 rounded text-xs ${
                              item.discrepancy > 0 ? 'bg-[#ff4b5c]/20 text-[#ff4b5c]' :
                              item.discrepancy < 0 ? 'bg-[#00f2fe]/20 text-[#00f2fe]' :
                              'bg-slate-600/20 text-slate-300'
                            }`}>
                              {item.discrepancy}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-slate-200 whitespace-nowrap">
                            <span className={`px-1 py-0.5 rounded text-xs ${
                              item.discrepancy_percentage > 50 ? 'bg-[#ff4b5c]/20 text-[#ff4b5c]' :
                              item.discrepancy_percentage > 20 ? 'bg-slate-600/20 text-slate-400' :
                              'bg-[#00f2fe]/20 text-[#00f2fe]'
                            }`}>
                              {item.discrepancy_percentage}%
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-slate-200">{item.storage_location || '未指定'}</td>
                          <td className="px-4 py-2 text-sm text-slate-200">{item.category || '未分類'}</td>
                          <td className="px-4 py-2 text-sm text-slate-200">{item.counted_by || '-'}</td>
                          <td className="px-4 py-2 text-sm text-slate-400">{formatDistanceToNow(new Date(item.counted_at), { addSuffix: true, locale: zhTW })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Discrepancy Statistics */}
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-slate-400 mb-4">差異統計</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="bg-slate-800/30 rounded-lg p-4">
                      <p className="text-sm font-medium text-slate-400">總異常項目數</p>
                      <p className="text-2xl font-bold text-[#ff4b5c]">{reportData.length}</p>
                    </div>
                    <div className="bg-slate-800/30 rounded-lg p-4">
                      <p className="text-sm font-medium text-slate-400">平均絕對差異</p>
                      <p className="text-2xl font-bold text-[#00f2fe]">
                        {Number((reportData.reduce((sum: number, item: any) => sum + Math.abs(item.discrepancy), 0) / reportData.length).toFixed(2))}
                      </p>
                    </div>
                    <div className="bg-slate-800/30 rounded-lg p-4">
                      <p className="text-sm font-medium text-slate-400">大幅差異項目 ({'>'}50%)</p>
                      <p className="text-2xl font-bold text-[#ff4b5c]">
                        {reportData.filter((item: any) => Math.abs(item.discrepancy_percentage) > 50).length}
                      </p>
                    </div>
                    <div className="bg-slate-800/30 rounded-lg p-4">
                      <p className="text-sm font-medium text-slate-400">中度差異項目 (20-50%)</p>
                      <p className="text-2xl font-bold text-[#00f2fe]">
                        {reportData.filter((item: any) => Math.abs(item.discrepancy_percentage) > 20 && Math.abs(item.discrepancy_percentage) <= 50).length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Trend Report */}
            {filters.reportType === 'trend' && (
              <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">趨勢分析報表</h3>
                <p className="text-sm text-slate-400 mb-6">
                  時間範圍: {format(subDays(new Date(), 30), 'yyyy-MM-dd')} ~ {format(new Date(), 'yyyy-MM-dd')}
                </p>
                
                {/* Chart Placeholder */}
                <div className="h-96 bg-slate-800/30 mb-6">
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <TrendingUp className="w-12 h-12 text-slate-400 mb-3" />
                      <p className="text-sm text-slate-400">趨勢圖表將在此處顯示</p>
                      <p className="text-xs text-slate-500 mt-2">（圖表功能開發中）</p>
                    </div>
                  </div>
                </div>
                
                {/* Trend Statistics */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-slate-400 mb-4">趨勢統計</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="bg-slate-800/30 rounded-lg p-4">
                      <p className="text-sm font-medium text-slate-400">平均日完成率</p>
                      <p className="text-2xl font-bold text-[#00f2fe]">
                        {Number((reportData.reduce((sum: number, item: any) => sum + item.completion_rate, 0) / reportData.length).toFixed(1))}%
                      </p>
                    </div>
                    <div className="bg-slate-800/30 rounded-lg p-4">
                      <p className="text-sm font-medium text-slate-400">最高日完成率</p>
                      <p className="text-2xl font-bold text-[#00f2fe]">
                        {Math.max(...reportData.map((item: any) => item.completion_rate))}%
                      </p>
                    </div>
                    <div className="bg-slate-800/30 rounded-lg p-4">
                      <p className="text-sm font-medium text-slate-400">最低日完成率</p>
                      <p className="text-2xl font-bold text-[#ff4b5c]">
                        {Math.min(...reportData.map((item: any) => item.completion_rate))}%
                      </p>
                    </div>
                    <div className="bg-slate-800/30 rounded-lg p-4">
                      <p className="text-sm font-medium text-slate-400">總處理項目數</p>
                      <p className="text-2xl font-bold text-[#00f2fe]">
                        {reportData.reduce((sum: number, item: any) => sum + item.total_items, 0)}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Data Table */}
                <div className="mt-6">
                  <p className="text-sm font-medium text-slate-400 mb-2">趨勢明細表</p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-800">
                      <thead>
                        <tr className="bg-slate-800/70">
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">日期</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">總項目數</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">已清點項目</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">錯誤項目</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">完成率</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {reportData.map((item: TrendDataPoint, index: number) => (
                          <tr key={item.date} className="hover:bg-slate-800/30">
                            <td className="px-4 py-2 text-sm text-slate-200">{format(new Date(item.date), 'MM-dd', { locale: zhTW })}</td>
                            <td className="px-4 py-2 text-sm text-slate-200">{item.total_items}</td>
                            <td className="px-4 py-2 text-sm text-slate-200">{item.total_counted}</td>
                            <td className="px-4 py-2 text-sm text-slate-200">{item.total_errors}</td>
                            <td className="px-4 py-2 text-sm text-slate-400">{item.completion_rate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            
            {/* Accuracy Report */}
            {filters.reportType === 'accuracy' && (
              <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">準確性分析報表</h3>
                <p className="text-sm text-slate-400 mb-6">
                  時間範圍: {format(subDays(new Date(), 30), 'yyyy-MM-dd')} ~ {format(new Date(), 'yyyy-MM-dd')}
                </p>
                
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {/* By Manifest */}
                  <div className="bg-slate-800/30 rounded-lg p-4">
                    <h3 className="text-lg font-medium text-slate-400 mb-4">按清單準確率</h3>
                    <div className="space-y-3">
                      {reportData.by_manifest.map((item: any, index: number) => (
                        <div key={index} className="flex items-center justify-between pb-2 border-b border-slate-800">
                          <div className="flex-1">
                            <span className="text-sm font-medium">{item.manifest_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              item.accuracy_rate >= 90 
                                ? 'bg-[#00f2fe]/20 text-[#00f2fe]' 
                                : item.accuracy_rate >= 80 
                                  ? 'bg-slate-600/20 text-slate-300' 
                                  : 'bg-[#ff4b5c]/20 text-[#ff4b5c]'
                            }`}>
                              {item.accuracy_rate}%
                            </span>
                            <span className="text-xs text-slate-400">({item.correct_count}/{item.total_items})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* By Category */}
                  <div className="bg-slate-800/30 rounded-lg p-4">
                    <h3 className="text-lg font-medium text-slate-400 mb-4">按類別準確率</h3>
                    <div className="space-y-3">
                      {reportData.by_category.map((item: any, index: number) => (
                        <div key={index} className="flex items-center justify-between pb-2 border-b border-slate-800">
                          <div className="flex-1">
                            <span className="text-sm font-medium">{item.category}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              item.accuracy_rate >= 90 
                                ? 'bg-[#00f2fe]/20 text-[#00f2fe]' 
                                : item.accuracy_rate >= 80 
                                  ? 'bg-slate-600/20 text-slate-300' 
                                  : 'bg-[#ff4b5c]/20 text-[#ff4b5c]'
                            }`}>
                              {item.accuracy_rate}%
                            </span>
                            <span className="text-xs text-slate-400">({item.correct_count}/{item.total_items})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* By Storage Location */}
                  <div className="bg-slate-800/30 rounded-lg p-4">
                    <h3 className="text-lg font-medium text-slate-400 mb-4">按儲位準確率</h3>
                    <div className="space-y-3">
                      {reportData.by_storage.map((item: any, index: number) => (
                        <div key={index} className="flex items-center justify-between pb-2 border-b border-slate-800">
                          <div className="flex-1">
                            <span className="text-sm font-medium">{item.storage_location}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              item.accuracy_rate >= 90 
                                ? 'bg-[#00f2fe]/20 text-[#00f2fe]' 
                                : item.accuracy_rate >= 80 
                                  ? 'bg-slate-600/20 text-slate-300' 
                                  : 'bg-[#ff4b5c]/20 text-[#ff4b5c]'
                            }`}>
                              {item.accuracy_rate}%
                            </span>
                            <span className="text-xs text-slate-400">({item.correct_count}/{item.total_items})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Overall Accuracy Statistics */}
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-slate-400 mb-4">整體準確率統計</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="bg-slate-800/30 rounded-lg p-4">
                      <p className="text-sm font-medium text-slate-400">總項目數</p>
                      <p className="text-2xl font-bold text-[#00f2fe]">
                        {reportData.by_manifest.reduce((sum: number, item: any) => sum + item.total_items, 0)}
                      </p>
                    </div>
                    <div className="bg-slate-800/30 rounded-lg p-4">
                      <p className="text-sm font-medium text-slate-400">正確項目數</p>
                      <p className="text-2xl font-bold text-[#00f2fe]">
                        {reportData.by_manifest.reduce((sum: number, item: any) => sum + item.correct_count, 0)}
                      </p>
                    </div>
                    <div className="bg-slate-800/30 rounded-lg p-4">
                      <p className="text-sm font-medium text-slate-400">整體準確率</p>
                      <p className="text-2xl font-bold text-[#00f2fe]">
                        {Number((reportData.by_manifest.reduce((sum: number, item: any) => sum + item.correct_count, 0) / 
                          reportData.by_manifest.reduce((sum: number, item: any) => sum + item.total_items, 0) * 100).toFixed(1))}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}