'use client';

import { useQuery } from '@tanstack/react-query';
import { getDrugTrendData } from '@/lib/supabaseRpc';
import type { DrugTrendPoint } from '@/types/query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { useState } from 'react';

export default function TrendTab() {
  const [barcode, setBarcode] = useState('');
  const [productCode, setProductCode] = useState('');
  
  const { data, isLoading, isError } = useQuery({
    queryKey: ['drugTrend', barcode, productCode],
    queryFn: () => getDrugTrendData(barcode, productCode),
    enabled: !!barcode, // 只有當條碼不為空時才執行查詢
  });

  if (isLoading) return <div className="flex h-full items-center justify-center text-slate-400">載入中...</div>;
  if (isError) return <div className="flex h-full items-center justify-center text-red-400">載入失敗</div>;

  return (
    <div className="flex h-full flex-col">
      {/* 標題和操作 */}
      <div className="flex h-14 items-center justify-between px-4 bg-slate-900/50 backdrop-blur-md">
        <h2 className="text-lg font-semibold text-white">藥品趨勢分析</h2>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="請輸入條碼"
            className="w-48 px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                     text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                     focus:ring-[#00f2fe] focus:border-[#00f2fe]"
          />
          <input
            type="text"
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
            placeholder="製造廠代碼 (可選)"
            className="w-48 px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                     text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                     focus:ring-[#00f2fe] focus:border-[#00f2fe]"
          />
        </div>
      </div>
      
      {/* 內容 */}
      <div className="flex-1 overflow-y-auto p-4">
        {(!barcode && !productCode) ? (
          <div className="text-center py-12">
            <p className="text-slate-400">請輸入條碼以查看趨勢分析</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 基本資訊 */}
            {data && data.length > 0 ? (
              <div className="bg-slate-800/50 rounded-md p-4 mb-4">
                <h3 className="text-md font-semibold text-white mb-2">基本資訊</h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
                  <div>
                    <span className="block text-xs text-slate-400 mb-1">條碼</span>
                    <span className="font-mono">{data[0]?.barcode || '無'}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-400 mb-1">製造廠代碼</span>
                    <span className="font-mono">{data[0]?.product_code || '無'}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-400 mb-1">類別</span>
                    <span>{data[0]?.category || '無'}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-400 mb-1">儲位</span>
                    <span>{data[0]?.storage_location || '無'}</span>
                  </div>
                </div>
              </div>
            ) : null}
            
            {/* 趨勢圖表 */}
            <div className="bg-slate-800/50 rounded-md p-4">
              <h3 className="text-md font-semibold text-white mb-4">數量趨勢圖</h3>
              {data && data.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.map((item, index) => ({
                    ...item,
                    name: `點算${index + 1}` // 簡化名稱
                  }))}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#text-slate-400' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#text-slate-400' }} />
                    <Tooltip 
                      formatter={(value) => value instanceof Date ? new Date(value).toLocaleDateString() : value}
                      contentStyle={{ backgroundColor: 'rgba(16, 42, 86, 0.8)', border: '1px solid rgba(0, 242, 254, 0.3)' }}
                      labelStyle={{ color: '#ffffff' }}
                      wrapperStyle={{ padding: [8, 12] }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Cell dataKey="expected_quantity" fill="#00f2fe" />
                    <Cell dataKey="actual_quantity" fill="#ff4b5c" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-400">暫無趨勢數據</p>
                </div>
              )}
              
              {/* 趨勢數據表格 */}
              <div className="mt-4">
                <h3 className="text-md font-semibold text-white mb-2">趨勢數據表格</h3>
                {data && data.length > 0 ? (
                  <div className="overflow-y-auto h-64">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-800">
                        <tr>
                          <th className="text-left px-3 py-2 text-slate-300">點算時間</th>
                          <th className="text-left px-3 py-2 text-slate-300">清單名稱</th>
                          <th className="text-left px-3 py-2 text-slate-300 w-10">頁數</th>
                          <th className="text-left px-3 py-2 text-slate-300">預期量</th>
                          <th className="text-left px-3 py-2 text-slate-300">實際量</th>
                          <th className="text-left px-3 py-2 text-slate-300">差異</th>
                          <th className="text-left px-3 py-2 text-slate-300">狀態</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((record, index) => (
                          <tr key={index} className="bg-slate-900/50 hover:bg-slate-800">
                            <td className="px-3 py-2 text-slate-300">
                              {new Date(record.counted_at).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2 text-slate-300">{record.manifest_name}</td>
                            <td className="px-3 py-2 text-slate-300 text-center">{record.page_number}</td>
                            <td className="px-3 py-2 text-slate-300">{formatNumber(record.expected_quantity)}</td>
                            <td className="px-3 py-2 text-slate-300">{formatNumber(record.actual_quantity)}</td>
                            <td className="px-3 py-2 text-slate-300 
                                    {discrepancyColorClass(record.discrepancy)}">
                              {formatNumber(record.discrepancy)}
                            </td>
                            <td className="px-3 py-2 text-slate-300 
                                    {record.counted_status === 'error' ? 'text-red-400' : 
                                     record.counted_status === 'completed' ? 'text-[#00f2fe]' : 
                                     'text-slate-400'}">
                              {record.counted_status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-400">
                    暫無趨勢數據
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
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