'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { searchDrugsCrossManifest } from '@/lib/supabaseRpc';
import type { DrugSearchResult } from '@/types/query';
import { useState } from 'react';

interface ResultsTableProps {
  data: DrugSearchResult[];
  isLoading: boolean;
  isError: boolean;
  fetchNextPage: () => void;
  hasNextPage: boolean;
  refetch: () => void;
  onDrugSelect: (drug: DrugSearchResult) => void;
}

export function ResultsTable({ 
  data, 
  isLoading, 
  isError, 
  fetchNextPage, 
  hasNextPage,
  refetch,
  onDrugSelect
}: ResultsTableProps) {
  const [selectedDrug, setSelectedDrug] = useState<DrugSearchResult | null>(null);

  // 當選擇的藥物變化時，通過回調函數通知父組件
  useEffect(() => {
    if (selectedDrug) {
      onDrugSelect(selectedDrug);
    }
  }, [selectedDrug, onDrugSelect]);

  if (isLoading) return <div className="flex h-full items-center justify-center text-slate-400">載入中...</div>;
  if (isError) return <div className="flex h-full items-center justify-center text-red-400">載入失敗</div>;

  return (
    <div className="flex flex-col h-full">
      {/* 標題和操作 */}
      <div className="flex h-14 items-center justify-between px-4 bg-slate-900/50 backdrop-blur-md">
        <div className="flex items-center space-x-2">
          <h2 className="text-lg font-semibold text-white">搜尋結果</h2>
          <span className="text-sm text-slate-400">共 {data.length} 項</span>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={refetch}
            className="text-white hover:text-slate-300"
          >
            <Filter className="h-5 w-5" />
          </button>
          <button 
            onClick={() => {/* 導出功能待實作 */}
            className="text-white hover:text-slate-300"
          >
            <CalendarDays className="h-5 w-5" />
          </button>
        </div>
      </div>
      
      {/* 結果表格 */}
      <div className="flex-1 overflow-y-auto">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            無符合條件的藥品記錄
          </div>
        ) : (
          <div className="space-y-1">
            {data.map((drug) => (
              <div 
                key={`${drug.barcode}-${drug.product_code}`} 
                onClick={() => setSelectedDrug(drug)}
                className="cursor-pointer px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 transition-colors 
                         border-l-4 border-transparent hover:border-[#00f2fe]/50"
              >
                <div className="flex items-start space-x-3">
                  {/* 藥品圖標 */}
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-8 h-8 bg-[#00f2fe]/20 rounded-md flex items-center justify-center">
                      <Search className="h-4 w-4 text-[#00f2fe]" />
                    </div>
                  </div>
                  
                  {/* 藥品資訊 */}
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between">
                      <h3 className="text-sm font-medium text-white">{drug.name}</h3>
                      <span className="text-xs text-slate-400">頁數: {drug.manifest_count}</span>
                    </div>
                    <div className="text-xs text-slate-400 flex-wrap gap-2">
                      <span>條碼: {drug.barcode}</span>
                      {drug.product_code && <span>代碼: {drug.product_code}</span>}
                      {drug.storage_location && <span>儲位: {drug.storage_location}</span>}
                      {drug.category && <span>類別: {drug.category}</span>}
                    </div>
                    <div className="flex items-center space-x-2 text-xs">
                      <div className="w-3 h-3 rounded-full 
                              {discrepancyColor(drug.total_discrepancy)}"></div>
                      <span className="text-slate-400">差異: {formatNumber(drug.total_discrepancy)}</span>
                    </div>
                  </div>
                </div>
                
                {/* 展開/收合按鈕 */}
                <div className="flex-shrink-0 mt-2">
                  {selectedDrug && selectedDrug.barcode === drug.barcode && selectedDrug.product_code === drug.product_code ? (
                    <ChevronUp className="h-4 w-4 text-[#00f2fe]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </div>
              </div>
              
              {/* 展開的詳情 */}
              {selectedDrug && selectedDrug.barcode === drug.barcode && selectedDrug.product_code === drug.product_code && (
                <div className="ml-12 border-l-2 border-slate-600/50 pl-3">
                  <div className="mt-3 space-y-2 text-xs text-slate-300">
                    <div className="flex space-x-4">
                      <span>總預期量:</span>
                      <span className="font-medium">{formatNumber(drug.total_expected)}</span>
                    </div>
                    <div className="flex space-x-4">
                      <span>總實際量:</span>
                      <span className="font-medium">{formatNumber(drug.total_actual)}</span>
                    </div>
                    <div className="flex space-x-4">
                      <span>平均差異:</span>
                      <span className="font-medium">{drug.avg_discrepancy.toFixed(2)}</span>
                    </div>
                    <div className="flex space-x-4">
                      <span>錯誤次數:</span>
                      <span className="font-medium text-red-400">{drug.error_count}</span>
                    </div>
                    <div className="flex space-x-4">
                      <span>最後點算:</span>
                      <span className="font-medium">{drug.last_counted_at ? new Date(drug.last_counted_at).toLocaleDateString() : '無'}</span>
                    </div>
                  </div>
                  
                  {/* 歷史記錄 */}
                  {drug.history && drug.history.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-xs font-medium text-slate-300 mb-1">歷史記錄</h4>
                      <div className="space-y-1">
                        {drug.history.slice(0, 5).map((record, index) => (
                          <div key={index} className="flex items-center space-x-2 text-xs">
                            <span className="w-20">{record.manifest_name}</span>
                            <span className="w-10 text-center">{record.page_number}</span>
                            <span className="w-10">{record.expected} → {record.actual}</span>
                            <span className="w-12 text-center 
                                    {record.status === 'error' ? 'text-red-400' : 
                                     record.status === 'completed' ? 'text-[#00f2fe]' : 
                                     'text-slate-400'}">
                              {record.status}
                            </span>
                          </div>
                        ))}
                        {drug.history.length > 5 && (
                          <div className="text-xs text-slate-400 italic mt-1">
                            及其他 {drug.history.length - 5} 筆記錄
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            ))}
          </div>
        )}
        
        {/* 分頁載更多 */}
        {hasNextPage && (
          <div className="flex h-12 items-center justify-center px-4 pt-2">
            <button 
              onClick={fetchNextPage}
              className="flex items-center justify-center px-4 py-2 bg-slate-800/50 rounded-md 
                       text-sm font-medium text-slate-300 hover:bg-slate-700"
            >
              載入更多...
            </button>
          </div>
        )}
      </div>
      
      {/* 底部狀態列 */}
      <div className="h-10 flex items-center justify-between px-4 bg-slate-900/50 backdrop-blur-md text-xs text-slate-400">
        <span>顯示 {data.length} 項</span>
        <span>{hasNextPage ? '載入更多...' : '已顯示全部'}</span>
      </div>
    </div>
  );
}

// 輔助函數
function discrepancyColor(discrepancy: number): string {
  if (discrepancy > 0) return 'bg-[#00f2fe]/20';
  if (discrepancy < 0) return 'bg-[#ff4b5c]/20';
  return 'bg-slate-600/20';
}

function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}