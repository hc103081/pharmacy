'use client';

import { useState } from 'react';
import { useDrugSearch } from '@/hooks/useDrugSearch';
import { exportData } from '@/lib/exportUtils';
import type { DrugSearchResult } from '@/types/query';

export default function ExportTab() {
  const { data, isLoading, refetch } = useDrugSearch();
  const [exportOptions, setExportOptions] = useState({
    format: 'excel' as 'excel' | 'csv' | 'pdf',
    includeCharts: false,
    dateRange: {
      from: '',
      to: ''
    },
    filters: {} as any,
    columns: [] as string[]
  });
  
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);

  const handleExport = async () => {
    if (!data || data.length === 0) {
      alert('沒有可導出的數據');
      return;
    }
    
    setIsExporting(true);
    try {
      const blob = await exportData(data as DrugSearchResult[], exportOptions.format, { includeCharts: exportOptions.includeCharts });
      
      // 建立下載連結
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pharmacount_report_${new Date().toISOString().slice(0,10)}.${exportOptions.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setExportResult(`導出成功! 檔案已下載為 pharmacount_report_${new Date().toISOString().slice(0,10)}.${exportOptions.format}`);
    } catch (error) {
      console.error('導出失敗:', error);
      setExportResult('導出失敗，請稍後重試');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* 標題和操作 */}
      <div className="flex h-14 items-center justify-between px-4 bg-slate-900/50 backdrop-blur-md">
        <h2 className="text-lg font-semibold text-white">導出報表</h2>
        <div className="flex items-center space-x-2">
          <button 
            onClick={handleExport}
            disabled={isExporting}
            className={`bg-[#00f2fe]/20 hover:bg-[#00f2fe]/30 text-[#00f2fe] px-4 py-2 rounded-md 
                     ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isExporting ? '導出中...' : '導出報表'}
          </button>
          <button 
            onClick={() => refetch()}
            className="text-white hover:text-slate-300 px-4 py-2 rounded-md"
          >
            刷新數據
          </button>
        </div>
      </div>
      
      {/* 導出結果提示 */}
      {exportResult && (
        <div className="px-4 py-2 bg-green-900/20 text-green-400 rounded-md mb-2">
          {exportResult}
        </div>
      )}
      
      {/* 內容 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* 導出選項 */}
          <div className="bg-slate-800/50 rounded-md p-4">
            <h3 className="text-md font-semibold text-white mb-4">導出選項</h3>
            
            {/* 導出格式 */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300 mb-1">導出格式</label>
              <div className="flex space-x-4">
                <label className="flex items-center text-slate-300">
                  <input
                    type="radio"
                    name="exportFormat"
                    value="excel"
                    checked={exportOptions.format === 'excel'}
                    onChange={(e) => setExportOptions({...exportOptions, format: 'excel'})}
                    className="w-4 h-4 text-[#00f2fe] bg-slate-700 rounded border-gray-500 focus:ring-2"
                  />
                  <span className="ml-1">Excel (.xlsx)</span>
                </label>
                <label className="flex items-center text-slate-300">
                  <input
                    type="radio"
                    name="exportFormat"
                    value="csv"
                    checked={exportOptions.format === 'csv'}
                    onChange={(e) => setExportOptions({...exportOptions, format: 'csv'})}
                    className="w-4 h-4 text-[#00f2fe] bg-slate-700 rounded border-gray-500 focus:ring-2"
                  />
                  <span className="ml-1">CSV (.csv)</span>
                </label>
                <label className="flex items-center text-slate-300">
                  <input
                    type="radio"
                    name="exportFormat"
                    value="pdf"
                    checked={exportOptions.format === 'pdf'}
                    onChange={(e) => setExportOptions({...exportOptions, format: 'pdf'})}
                    className="w-4 h-4 text-[#00f2fe] bg-slate-700 rounded border-gray-500 focus:ring-2"
                  />
                  <span className="ml-1">PDF (.pdf)</span>
                </label>
              </div>
            }
            
            {/* 是否包含圖表 */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300 mb-1">導出內容</label>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={exportOptions.includeCharts}
                  onChange={(e) => setExportOptions({...exportOptions, includeCharts: e.target.checked})}
                  className="w-4 h-4 text-[#00f2fe] bg-slate-700 rounded border-gray-500 focus:ring-2"
                />
                <span className="ml-1">包含圖表和統計</span>
              }
            </div>
            
            {/* 日期範圍 */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300 mb-1">日期範圍</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={exportOptions.dateRange.from}
                  onChange={(e) => setExportOptions({...exportOptions, dateRange: {...exportOptions.dateRange, from: e.target.value}})}
                  className="w-full px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                           text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                           focus:ring-[#00f2fe] focus:border-[#00f2fe]"
                />
                <input
                  type="date"
                  value={exportOptions.dateRange.to}
                  onChange={(e) => setExportOptions({...exportOptions, dateRange: {...exportOptions.dateRange, to: e.target.value}})}
                  className="w-full px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                           text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                           focus:ring-[#00f2fe] focus:border-[#00f2fe]"
                />
              }
            </div>
            
            {/* 欄位選擇 */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300 mb-1">導出欄位</label>
              <div className="space-y-2">
                {/* 動態生成欄位選擇待實作 */}
                <div className="text-sm text-slate-400 italic">
                  欄位選擇功能開發中...
                }
              </div>
            }
          </div>
          
          {/* 預覽 */}
          <div className="bg-slate-800/50 rounded-md p-4">
            <h3 className="text-md font-semibold text-white mb-4">數據預覽</h3>
            {isLoading ? (
              <div className="flex h-32 items-center justify-center text-slate-400">
                載入中...
              )
            } : (
              <div className="overflow-y-auto h-64">
                {data && data.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800">
                      <tr>
                        <th className="text-left px-3 py-2 text-slate-300">條碼</th>
                        <th className="text-left px-3 py-2 text-slate-300">名稱</th>
                        <th className="text-left px-3 py-2 text-slate-300">製造廠代碼</th>
                        <th className="text-left px-3 py-2 text-slate-300">儲位</th>
                        <th className="text-left px-3 py-2 text-slate-300">類別</th>
                        <th className="text-left px-3 py-2 text-slate-300">出現清單數</th>
                        <th className="text-left px-3 py-2 text-slate-300">總預期量</th>
                        <th className="text-left px-3 py-2 text-slate-300">總實際量</th>
                        <th className="text-left px-3 py-2 text-slate-300">總差異量</th>
                        <th className="text-left px-3 py-2 text-slate-300">平均差異</th>
                        <th className="text-left px-3 py-2 text-slate-300">錯誤次數</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.slice(0, 10).map((drug, index) => (
                        <tr key={index} className="bg-slate-900/50 hover:bg-slate-800">
                          <td className="px-3 py-2 text-slate-300">{drug.barcode}</td>
                          <td className="px-3 py-2 text-slate-300">{drug.name}</td>
                          <td className="px-3 py-2 text-slate-300">{drug.product_code || '無'}</td>
                          <td className="px-3 py-2 text-slate-300">{drug.storage_location || '無'}</td>
                          <td className="px-3 py-2 text-slate-300">{drug.category || '無'}</td>
                          <td className="px-3 py-2 text-slate-300">{drug.manifest_count}</td>
                          <td className="px-3 py-2 text-slate-300">{formatNumber(drug.total_expected)}</td>
                          <td className="px-3 py-2 text-slate-300">{formatNumber(drug.total_actual)}</td>
                          <td className="px-3 py-2 text-slate-300">{formatNumber(drug.total_discrepancy)}</td>
                          <td className="px-3 py-2 text-slate-300">{drug.avg_discrepancy.toFixed(2)}</td>
                          <td className="px-3 py-2 text-slate-300">{drug.error_count}</td>
                        </tr>
                      ))}
                      {data.length > 10 && (
                        <tr className="bg-slate-900/50">
                          <td colSpan="12" className="px-3 py-2 text-slate-400 text-center italic">
                            及其他 {data.length - 10} 筆記錄
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    暫無數據可預覽
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 輔助函數
function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}