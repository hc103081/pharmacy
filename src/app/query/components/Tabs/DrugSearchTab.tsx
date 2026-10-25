'use client';

import { useState, useEffect, useMemo } from 'react';
import { useDrugSearchSuspended } from '@/app/query/hooks/useDrugSearch';
import { useOfflineCache } from '@/app/query/hooks/useOfflineCache';
import { useQueryFilters } from '@/app/query/context/QueryFiltersContext';
import { format, formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Search, Bell, TrendingUp, Upload, XCircle, Loader2, AlertTriangle, CircleHelp } from 'lucide-react';
import type { InfiniteData } from '@tanstack/react-query';

interface DrugSearchResult {
  barcode: string;
  product_code: string | null;
  name: string;
  storage_location: string | null;
  category: string | null;
  manifest_count: number;
  total_expected: number;
  total_actual: number;
  total_discrepancy: number;
  avg_discrepancy: number;
  error_count: number;
  last_counted_at: string | null;
  history: DrugHistoryItem[];
}

interface TrendDataPoint {
  date: string;
  expected_quantity: number;
  actual_quantity: number;
  discrepancy: number;
}

interface DrugHistoryItem {
  manifest_id: string;
  manifest_name: string;
  page_number: number;
  expected: number;
  actual: number;
  status: 'pending' | 'completed' | 'error';
  counted_at: string;
}

export default function DrugSearchTab() {
  // 篩選條件改用共用狀態：SearchPanel 的「套用篩選」會直接反映在此處的查詢
  const { filters, updateFilters, resetFilters } = useQueryFilters();
  
  const { 
    data: searchResults, 
    isLoading, 
    error, 
    refetch 
  } = useDrugSearchSuspended(filters);
  
  const { 
    isCached, 
    clearCache 
  } = useOfflineCache();
  
  // 趨勢分析數據 - 按日期分組的歷史數據
  const trendData = useMemo(() => {
    if (!searchResults?.pages) return [];
    
    const dateMap: Record<string, TrendDataPoint> = {};
    
    searchResults.pages.forEach(results => {
      results.forEach(result => {
        result.history.forEach(item => {
          const date = item.counted_at.split('T')[0]; // 只取日期部分
          
          if (!dateMap[date]) {
            dateMap[date] = {
              date,
              expected_quantity: 0,
              actual_quantity: 0,
              discrepancy: 0
            };
          }
          
          dateMap[date].expected_quantity += item.expected;
          dateMap[date].actual_quantity += item.actual;
          dateMap[date].discrepancy += item.actual - item.expected;
        });
      });
    });
    
    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [searchResults]);

  return (
    <div className="space-y-6">
      {/* 搜尋結果統計 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-gray-400">總計藥品</div>
          <div className="text-2xl font-bold text-white mt-1">
            {searchResults?.pages?.flat().length || 0}
          </div>
        </div>
        
        <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-gray-400">總差異</div>
          <div className={`text-2xl font-bold mt-1 ${
            searchResults?.pages?.some(results => results.some(r => r.total_discrepancy !== 0))
              ? 'text-[#ff4b5c]' 
              : 'text-green-400'
          }`}>
            {searchResults?.pages?.flat().reduce((sum, r) => sum + r.total_discrepancy, 0) || 0}
          </div>
        </div>
        
        <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-gray-400">錯誤數量</div>
          <div className="text-2xl font-bold text-[#ff4b5c] mt-1">
            {searchResults?.pages?.flat().reduce((sum, r) => sum + r.error_count, 0) || 0}
          </div>
        </div>
        
        <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-gray-400">離線狀態</div>
          <div className="text-2xl font-bold mt-1">
            {isCached ? (
              <span className="text-green-400">有快取</span>
            ) : (
              <span className="text-[#ff4b5c]">無快取</span>
            )}
          </div>
        </div>
      </div>

      {/* 主要內容區 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左側：搜尋結果列表 */}
        <div className="lg:col-span-2 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-[#00f2fe]" />
            </div>
          ) : error ? (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4">
              <div className="flex items-center space-x-2 text-red-400">
                <AlertTriangle />
                <span>載入失敗</span>
              </div>
              <button 
                onClick={() => refetch()}
                className="mt-2 px-4 py-2 bg-red-500/20 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
              >
                重新載入
              </button>
            </div>
          ) : searchResults && searchResults.pages && searchResults.pages.length > 0 ? (
            <div className="space-y-4">
              {searchResults.pages.flat().map((result) => (
                <div 
                  key={result.barcode} 
                  className="bg-slate-800/70 rounded-xl p-4 border border-slate-700 hover:border-[#00f2fe]/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{result.name}</h3>
                      <div className="text-sm text-gray-400 mt-1">
                        條碼: {result.barcode} | 位置: {result.storage_location || '未指定'} | 類別: {result.category || '未指定'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`px-2 py-1 rounded text-sm font-medium ${
                        result.total_discrepancy > 0 
                          ? 'bg-[#ff4b5c]/20 text-[#ff4b5c]' 
                          : result.total_discrepancy < 0 
                            ? 'bg-[#00f2fe]/20 text-[#00f2fe]' 
                            : 'bg-slate-600/20 text-gray-300'
                      }`}>
                        {result.total_discrepancy > 0 ? '+' : ''}{result.total_discrepancy}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {result.manifest_count} 個清單
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400">總預期</div>
                      <div className="text-white font-medium">{result.total_expected}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">總實際</div>
                      <div className="text-white font-medium">{result.total_actual}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">平均差異</div>
                      <div className={`font-medium ${
                        result.avg_discrepancy > 0 
                          ? 'text-[#ff4b5c]' 
                          : result.avg_discrepancy < 0 
                            ? 'text-[#00f2fe]' 
                            : 'text-gray-300'
                      }`}>
                        {result.avg_discrepancy > 0 ? '+' : ''}{result.avg_discrepancy.toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">錯誤</div>
                      <div className="text-[#ff4b5c] font-medium">{result.error_count}</div>
                    </div>
                  </div>
                  
                  {result.last_counted_at && (
                    <div className="mt-3 pt-3 border-t border-slate-600 text-xs text-gray-500">
                      最後清點: {format(new Date(result.last_counted_at), 'yyyy-MM-dd HH:mm', { locale: zhTW })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>沒有找到符合條件的藥品</p>
              <p className="text-sm mt-2">請調整篩選條件或清除篩選</p>
            </div>
          )}
        </div>

        {/* 右側：趨勢分析 */}
        <div className="space-y-4">
          <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4">趨勢分析</h3>
            
            {trendData.length > 0 ? (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/50">
                      <tr className="bg-slate-800/70">
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">日期</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">預期量</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">實際量</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">差異</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-600">
                      {trendData.map((day, index) => (
                        <tr key={index} className="hover:bg-gray-600/30">
                          <td className="px-4 py-2 text-sm text-white">{day.date}</td>
                          <td className="px-4 py-2 text-sm text-white">{day.expected_quantity}</td>
                          <td className="px-4 py-2 text-sm text-white">{day.actual_quantity}</td>
                          <td className="px-4 py-2 text-sm whitespace-nowrap">
                            <span className={`px-1 py-0.5 rounded text-xs ${
                              day.discrepancy > 0 ? 'bg-[#ff4b5c]/20 text-[#ff4b5c]' :
                              day.discrepancy < 0 ? 'bg-[#00f2fe]/20 text-[#00f2fe]' :
                              'bg-slate-600/20 text-gray-300'
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
            ) : (
              <div className="text-center py-8 text-gray-500">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暫無趨勢數據</p>
              </div>
            )}
          </div>

          {/* 離線緩存狀態 */}
          <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4">緩存狀態</h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">在線狀態</span>
                <span className={`text-sm font-medium ${
                  isCached ? 'text-green-400' : 'text-[#ff4b5c]'
                }`}>
                  {isCached ? '有快取' : '無快取'}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">緩存項目</span>
                <span className="text-sm text-white font-medium">
                  {isCached ? '有資料' : '無資料'}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">緩存大小</span>
                <span className="text-sm text-white font-medium">
                  {isCached ? '未知' : '無'}
                </span>
              </div>
              
              <button
                onClick={clearCache}
                disabled={!isCached}
                className={`w-full mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  !isCached
                    ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                    : 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30'
                }`}
              >
                清除緩存
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}