'use client';

import { useQuery } from '@tanstack/react-query';
import { getLocationCategoryHeatmap } from '@/lib/supabaseRpc';
import type { HeatmapCell } from '@/types/query';
import { XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useState } from 'react';

export default function HeatmapTab() {
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  
  const { data, isLoading, isError } = useQuery({
    queryKey: ['heatmap', dateFrom, dateTo],
    queryFn: () => getLocationCategoryHeatmap(dateFrom ? new Date(dateFrom).toISOString().split('T')[0] : undefined, 
                                              dateTo ? new Date(dateTo).toISOString().split('T')[0] : undefined),
    // 即使日期為空也執行查詢（預設顯示所有時間）
    enabled: true,
  });

  if (isLoading) return <div className="flex h-full items-center justify-center text-slate-400">載入中...</div>;
  if (isError) return <div className="flex h-full items-center justify-center text-red-400">載入失敗</div>;

  return (
    <div className="flex h-full flex-col">
      {/* 標題和操作 */}
      <div className="flex h-14 items-center justify-between px-4 bg-slate-900/50 backdrop-blur-md">
        <h2 className="text-lg font-semibold text-white">儲位/類別熱力圖</h2>
        <div className="flex items-center space-x-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-32 px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                     text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                     focus:ring-[#00f2fe] focus:border-[#00f2fe]"
          />
          <span className="text-slate-400">至</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-32 px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                     text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                     focus:ring-[#00f2fe] focus:border-[#00f2fe]"
          />
        </div>
      </div>
      
      {/* 內容 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* 說明 */}
          <div className="bg-slate-800/50 rounded-md p-4 mb-4">
            <h3 className="text-md font-semibold text-white mb-2">熱力圖說明</h3>
            <p className="text-sm text-slate-300">
              熱力圖顯示不同儲位和類別組合的錯誤率，顏色越深表示錯誤率越高。
            </p>
            <div className="flex mt-2 space-x-4 text-xs">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-[#ff4b5c]/20 rounded mr-1" />
                <span>高錯誤率</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-[#00f2fe]/20 rounded mr-1" />
                <span>低錯誤率</span>
              </div>
            </div>
          </div>
          
          {/* 熱力圖 */}
          <div className="bg-slate-800/50 rounded-md p-4">
            <h3 className="text-md font-semibold text-white mb-4">錯誤率熱力圖</h3>
            {data && data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800">
                  <thead>
                    <tr className="bg-slate-800/70">
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">儲位</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">類別</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">總數</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">錯誤數</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">錯誤率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.map((item: any, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2 text-sm text-slate-300">{item.storage_location}</td>
                        <td className="px-4 py-2 text-sm text-slate-300">{item.category}</td>
                        <td className="px-4 py-2 text-sm text-slate-300">{item.total_count}</td>
                        <td className="px-4 py-2 text-sm text-slate-300">{item.error_count}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            item.error_rate > 10 ? 'bg-[#ff4b5c]/20 text-[#ff4b5c]' :
                            item.error_rate > 5 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-[#00f2fe]/20 text-[#00f2fe]'
                          }`}>
                            {item.error_rate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-400">暫無熱力圖數據</p>
              </div>
            )}
            
            {/* 熱力圖數據表格 */}
            <div className="mt-4">
              <h3 className="text-md font-semibold text-white mb-2">詳細數據表格</h3>
              {data && data.length > 0 ? (
                <div className="overflow-y-auto h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800">
                      <tr>
                        <th className="text-left px-3 py-2 text-slate-300">儲位</th>
                        <th className="text-left px-3 py-2 text-slate-300">類別</th>
                        <th className="text-left px-3 py-2 text-slate-300">總項目數</th>
                        <th className="text-left px-3 py-2 text-slate-300">錯誤項目數</th>
                        <th className="text-left px-3 py-2 text-slate-300">錯誤率 (%)</th>
                        <th className="text-left px-3 py-2 text-slate-300">總差異量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((record, index) => (
                        <tr key={index} className="bg-slate-900/50 hover:bg-slate-800">
                          <td className="px-3 py-2 text-slate-300">{record.storage_location}</td>
                          <td className="px-3 py-2 text-slate-300">{record.category}</td>
                          <td className="px-3 py-2 text-slate-300">{formatNumber(record.total_items)}</td>
                          <td className="px-3 py-2 text-slate-300">{formatNumber(record.error_items)}</td>
                          <td className="px-3 py-2 text-slate-300 
                                  {discrepancyColorClass(record.error_rate)}">
                            {record.error_rate.toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {formatNumber(record.total_discrepancy_qty)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-4 text-slate-400">
                  暫無熱力圖數據
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 輔助凸數
function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function discrepancyColorClass(value: number): string {
  if (value > 20) return 'text-[#ff4b5c]'; // 高錯誤率
  if (value > 10) return 'text-[#00f2fe]'; // 中等錯誤率
  return 'text-slate-400'; // 低錯誤率
}