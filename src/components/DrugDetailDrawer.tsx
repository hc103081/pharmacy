'use client';

import type { DrugSearchResult } from '@/types/query';

interface DrugDetailDrawerProps {
  drug: DrugSearchResult | null;
  onClose: () => void;
}

export function DrugDetailDrawer({ drug, onClose }: DrugDetailDrawerProps) {
  if (!drug) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-slate-900/50 backdrop-blur-md 
                     transition-transform duration-300 ease-in-out translate-x-0 z-50">
      <div className="flex h-full flex-col">
        {/* 標題 */}
        <div className="flex h-14 items-center justify-between px-4 bg-slate-800/50">
          <h2 className="text-lg font-semibold text-white">{drug.name}</h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        /* 內容 */
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {/* 基本資訊 */}
            <div className="space-y-2">
              <h3 className="text-md font-semibold text-white">基本資訊</h3>
              <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
                <div>
                  <span className="block text-xs text-slate-400 mb-1">條碼</span>
                  <span className="font-mono">{drug.barcode}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400 mb-1">製造廠代碼</span>
                  <span className="font-mono">{drug.product_code || '無'}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400 mb-1">儲位</span>
                  <span>{drug.storage_location || '無'}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400 mb-1">類別</span>
                  <span>{drug.category || '無'}</span>
                </div>
              </div>
            }
            
            {/* 統計資訊 */}
            <div className="space-y-2">
              <h3 className="text-md font-semibold text-white">統計資訊</h3>
              <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
                <div>
                  <span className="block text-xs text-slate-400 mb-1">出現清單數</span>
                  <span className="font-medium">{drug.manifest_count}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400 mb-1">總預期量</span>
                  <span className="font-medium">{formatNumber(drug.total_expected)}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400 mb-1">總實際量</span>
                  <span className="font-medium">{formatNumber(drug.total_actual)}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400 mb-1">總差異量</span>
                  <span className="font-medium 
                          {discrepancyColorClass(drug.total_discrepancy)}">
                    {formatNumber(drug.total_discrepancy)}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400 mb-1">平均差異</span>
                  <span className="font-medium 
                          {disparityColorClass(drug.avg_discrepancy)}">
                    {drug.avg_discrepancy.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400 mb-1">錯誤次數</span>
                  <span className="font-medium text-red-400">{drug.error_count}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400 mb-1">最後點算</span>
                  <span className="font-medium">
                    {drug.last_counted_at ? new Date(drug.last_counted_at).toLocaleString() : '無'}
                  </span>
                </div>
              </div>
            }
            
            {/* 趨勢圖表待實作 */}
            <div className="space-y-2">
              <h3 className="text-md font-semibold text-white">趨勢分析</h3>
              <div className="bg-slate-800/50 rounded-md p-3 h-48">
                <div className="flex h-full items-center justify-center text-slate-400">
                  趨勢圖表待實作
                </div>
              </div>
            </div>
            
            {/* 歷史記錄 */}
            <div className="space-y-2">
              <h3 className="text-md font-semibold text-white">歷史記錄</h3>
              {drug.history && drug.history.length > 0 ? (
                <div className="space-y-2">
                  <div className="overflow-y-auto h-40">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-800">
                        <tr>
                          <th className="text-left px-3 py-2 text-slate-300">清單名稱</th>
                          <th className="text-left px-3 py-2 text-slate-300 w-10">頁數</th>
                          <th className="text-left px-3 py-2 text-slate-300 w-16">預期→實際</th>
                          <th className="text-left px-3 py-2 text-slate-300 w-12">狀態</th>
                          <th className="text-left px-3 py-2 text-slate-300">點算時間</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drug.history.map((record, index) => (
                          <tr key={index} className="bg-slate-900/50 hover:bg-slate-800">
                            <td className="px-3 py-2 text-slate-300">{record.manifest_name}</td>
                            <td className="px-3 py-2 text-slate-300 text-center">{record.page_number}</td>
                            <td className="px-3 py-2 text-slate-300">
                              {record.expected} → {record.actual}
                            </td>
                            <td className="px-3 py-2 text-slate-300 
                                    {record.status === 'error' ? 'text-red-400' : 
                                     record.status === 'completed' ? 'text-[#00f2fe]' : 
                                     'text-slate-400'}">
                              {record.status}
                            </td>
                            <td className="px-3 py-2 text-slate-300">
                              {new Date(record.counted_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {drug.history.length > 10 && (
                    <div className="text-xs text-slate-400 italic text-center mt-1">
                      顯示前 10 筆，共 {drug.history.length} 筆記錄
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-slate-400">
                  暫無歷史記錄
                </div>
              )}
            </div>
          </div>
        </div>
        
        /* 底部操作 */
        <div className="flex h-12 items-center justify-between px-4 bg-slate-800/50 border-t border-slate-600/50">
          <div className="flex items-center space-x-2 text-sm text-slate-300">
            <span>共 {drug.history.length} 筆歷史記錄</span>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => {/* 匯出此藥品詳情待實作 */}
              className="flex items-center justify-center px-3 py-2 bg-[#00f2fe]/20 
                       rounded-md text-sm font-medium text-[#00f2fe] hover:bg-[#00f2fe]/30"
            >
              <CalendarDays className="h-4 w-4 mr-1" />
              匯出
            </button>
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

function discrepancyColorClass(discrepancy: number): string {
  if (discrepancy > 0) return 'text-[#00f2fe]';
  if (discrepancy < 0) return 'text-[#ff4b5c]';
  return 'text-slate-400';
}

function disparityColorClass(discrepancy: number): string {
  if (discrepancy > 0) return 'text-[#00f2fe]';
  if (discrepancy < 0) return 'text-[#ff4b5c]';
  return 'text-slate-400';
}