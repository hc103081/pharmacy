'use client';

import { useState } from 'react';
import { 
  Search, 
  Sliders, 
  CalendarDays, 
  Filter, 
  X,
  ChevronDown,
  CheckSquare
} from 'lucide-react';

export function SearchPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState({
    searchText: '',
    barcode: '',
    productCode: '',
    storageLocations: [] as string[],
    categories: [] as string[],
    dateFrom: '',
    dateTo: '',
    manifestStatus: ['active', 'archived'] as ('active' | 'archived')[],
    countedStatus: [] as ('pending' | 'completed' | 'error')[],
    hasDiscrepancy: null as boolean | null,
  });
  
  // 開關側邊欄
  const toggleSearchPanel = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className={`fixed left-0 top-0 h-full w-64 bg-slate-900/50 backdrop-blur-md 
                     transition-transform duration-300 ease-in-out 
                     ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                     z-50`}
    >
      <div className="flex h-14 items-center justify-between px-4">
        <h2 className="text-lg font-semibold text-white">進階篩選</h2>
        <div className="flex items-center space-x-2">
          <button 
            onClick={toggleSearchPanel}
            className="text-white hover:text-slate-300"
          >
            <Search className="h-5 w-5" />
          </button>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-white hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      
      <div className="p-4 overflow-y-auto h-full">
        {/* 搜尋輸入 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-300 mb-1">關鍵字搜尋</label>
          <input
            type="text"
            value={filters.searchText}
            onChange={(e) => setFilters({...filters, searchText: e.target.value})}
            className="w-full px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                     text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                     focus:ring-[#00f2fe] focus:border-[#00f2fe]"
            placeholder="條碼/品名/製造廠代碼"
          />
        </div>
        
        {/* 條碼輸入 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-300 mb-1">條碼</label>
          <input
            type="text"
            value={filters.barcode}
            onChange={(e) => setFilters({...filters, barcode: e.target.value})}
            className="w-full px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                     text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                     focus:ring-[#00f2fe] focus:border-[#00f2fe]"
            placeholder="掃描或輸入條碼"
          />
        </div>
        
        {/* 產品代碼輸入 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-300 mb-1">製造廠代碼</label>
          <input
            type="text"
            value={filters.productCode}
            onChange={(e) => setFilters({...filters, productCode: e.target.value})}
            className="w-full px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                     text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                     focus:ring-[#00f2fe] focus:border-[#00f2fe]"
            placeholder="製造廠代碼"
          />
        </div>
        
        {/* 進階篩選切換 */}
        <div className="space-y-3">
          <button 
            className="flex w-full items-center justify-between px-3 py-2 text-left 
                     text-sm font-medium text-slate-300 bg-slate-800/50 rounded-md 
                     hover:bg-slate-800"
            onClick={() => {/* 切換儲位選擇器 */}
          >
            <div className="flex items-center">
              <Sliders className="h-4 w-4 mr-2" />
              <span>儲位</span>
            </div>
            <span className="text-xs text-slate-400">{filters.storageLocations.length} 個已選擇</span>
            <ChevronDown className="h-4 w-4" />
          </button>
          
          {/* 儲位選擇器彈出視窗 */}
          {filters.storageLocations.length > 0 && (
            <div className="mt-2 ml-4 space-y-1">
              {filters.storageLocations.map((location, index) => (
                <div key={index} className="flex items-center bg-slate-700/50 rounded px-2 py-1 text-xs">
                  <span className="mr-1">{location}</span>
                  <button 
                    onClick={() => {
                      setFilters({
                        ...filters,
                        storageLocations: filters.storageLocations.filter((_, i) => i !== index)
                      });
                    }}
                    className="text-slate-400 hover:text-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <button 
            className="flex w-full items-center justify-between px-3 py-2 text-left 
                     text-sm font-medium text-slate-300 bg-slate-800/50 rounded-md 
                     hover:bg-slate-800"
            onClick={() => {/* 切換類別選擇器 */}
          >
            <div className="flex items-center">
              <Sliders className="h-4 w-4 mr-2" />
              <span>類別</span>
            </div>
            <span className="text-xs text-slate-400">{filters.categories.length} 個已選擇</span>
            <ChevronDown className="h-4 w-4" />
          </button>
          
          {/* 類別選擇器彈出視窗 */}
          {filters.categories.length > 0 && (
            <div className="mt-2 ml-4 space-y-1">
              {filters.categories.map((category, index) => (
                <div key={index} className="flex items-center bg-slate-700/50 rounded px-2 py-1 text-xs">
                  <span className="mr-1">{category}</span>
                  <button 
                    onClick={() => {
                      setFilters({
                        ...filters,
                        categories: filters.categories.filter((_, i) => i !== index)
                      });
                    }}
                    className="text-slate-400 hover:text-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300 mb-1">日期範圍</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                className="w-full px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                         text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                         focus:ring-[#00f2fe] focus:border-[#00f2fe]"
              />
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                className="w-full px-3 py-2 bg-slate-800/50 rounded-md border border-slate-600/50 
                         text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                         focus:ring-[#00f2fe] focus:border-[#00f2fe]"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300 mb-1">清單狀態</label>
            <div className="flex space-x-2">
              <label className="flex items-center text-slate-300 text-sm">
                <input
                  type="checkbox"
                  checked={filters.manifestStatus.includes('active')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFilters({
                        ...filters,
                        manifestStatus: [...filters.manifestStatus, 'active']
                      });
                    } else {
                      setFilters({
                        ...filters,
                        manifestStatus: filters.manifestStatus.filter(status => status !== 'active')
                      });
                    }
                  }}
                  className="w-4 h-4 text-[#00f2fe] bg-slate-700 rounded border-gray-500 focus:ring-2"
                />
                <span className="ml-1">啟用中</span>
              </label>
              <label className="flex items-center text-slate-300 text-sm">
                <input
                  type="checkbox"
                  checked={filters.manifestStatus.includes('archived')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFilters({
                        ...filters,
                        manifestStatus: [...filters.manifestStatus, 'archived']
                      });
                    } else {
                      setFilters({
                        ...filters,
                        manifestStatus: filters.manifestStatus.filter(status => status !== 'archived')
                      });
                    }
                  }}
                  className="w-4 h-4 text-[#00f2fe] bg-slate-700 rounded border-gray-500 focus:ring-2"
                />
                <span className="ml-1">已封存</span>
              </label>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300 mb-1">點狀態</label>
            <div className="flex space-x-2">
              <label className="flex items-center text-slate-300 text-sm">
                <input
                  type="checkbox"
                  checked={filters.countedStatus.includes('pending')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFilters({
                        ...filters,
                        countedStatus: [...filters.countedStatus, 'pending']
                      });
                    } else {
                      setFilters({
                        ...filters,
                        countedStatus: filters.countedStatus.filter(status => status !== 'pending')
                      });
                    }
                  }}
                  className="w-4 h-4 text-[#ff4b5c] bg-slate-700 rounded border-gray-500 focus:ring-2"
                />
                <span className="ml-1">待點</span>
              </label>
              <label className="flex items-center text-slate-300 text-sm">
                <input
                  type="checkbox"
                  checked={filters.countedStatus.includes('completed')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFilters({
                        ...filters,
                        countedStatus: [...filters.countedStatus, 'completed']
                      });
                    } else {
                      setFilters({
                        ...filters,
                        countedStatus: filters.countedStatus.filter(status => status !== 'completed')
                      });
                    }
                  }}
                  className="w-4 h-4 text-[#00f2fe] bg-slate-700 rounded border-gray-500 focus:ring-2"
                />
                <span className="ml-1">已完成</span>
              </label>
              <label className="flex items-center text-slate-300 text-sm">
                <input
                  type="checkbox"
                  checked={filters.countedStatus.includes('error')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFilters({
                        ...filters,
                        countedStatus: [...filters.countedStatus, 'error']
                      });
                    } else {
                      setFilters({
                        ...filters,
                        countedStatus: filters.countedStatus.filter(status => status !== 'error')
                      });
                    }
                  }}
                  className="w-4 h-4 text-[#ff4b5c] bg-slate-700 rounded border-gray-500 focus:ring-2"
                />
                <span className="ml-1">異常</span>
              </label>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300 mb-1">是否有差異</label>
            <div className="flex space-x-2">
              <label className="flex items-center text-slate-300 text-sm">
                <input
                  type="radio"
                  name="hasDiscrepancy"
                  value="true"
                  checked={filters.hasDiscrepancy === true}
                  onChange={(e) => setFilters({...filters, hasDiscrepancy: true})}
                  className="w-4 h-4 text-[#00f2fe] bg-slate-700 rounded border-gray-500 focus:ring-2"
                />
                <span className="ml-1">是</span>
              </label>
              <label className="flex items-center text-slate-300 text-sm">
                <input
                  type="radio"
                  name="hasDiscrepancy"
                  value="false"
                  checked={filters.hasDiscrepancy === false}
                  onChange={(e) => setFilters({...filters, hasDiscrepancy: false})}
                  className="w-4 h-4 text-[#00f2fe] bg-slate-700 rounded border-gray-500 focus:ring-2"
                />
                <span className="ml-1">否</span>
              </label>
              <label className="flex items-center text-slate-300 text-sm">
                <input
                  type="radio"
                  name="hasDiscrepancy"
                  value=""
                  checked={filters.hasDiscrepancy === null}
                  onChange={(e) => setFilters({...filters, hasDiscrepancy: null})}
                  className="w-4 h-4 text-[#00f2fe] bg-slate-700 rounded border-gray-500 focus:ring-2"
                />
                <span className="ml-1">不限</span>
              </label>
            </div>
          </div>
        </div>
        
        {/* 清除篩選按鈕 */}
        <div className="mt-6 pt-4 border-t border-slate-600/50">
          <button 
            onClick={() => {
              setFilters({
                searchText: '',
                barcode: '',
                productCode: '',
                storageLocations: [] as string[],
                categories: [] as string[],
                dateFrom: '',
                dateTo: '',
                manifestStatus: ['active', 'archived'] as ('active' | 'archived')[],
                countedStatus: [] as ('pending' | 'completed' | 'error')[],
                hasDiscrepancy: null as boolean | null,
              });
            }}
            className="w-full flex items-center justify-center px-3 py-2 bg-slate-800/50 rounded-md 
                     text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            清除所有篩選
          </button>
        </div>
        
        {/* 搜尋按鈕 */}
        <div className="mt-4">
          <button 
            onClick={() => {
              // 這裡會觸發搜尋，實際上會通過React Query重新獲取數據
              // 在useDrugSearch hook中會監聽filters的變化
            }}
            className="w-full flex items-center justify-center px-3 py-2 bg-[#00f2fe]/20 
                     rounded-md text-sm font-medium text-[#00f2fe] hover:bg-[#00f2fe]/30"
          >
            搜尋
          </button>
        </div>
      </div>
    </div>
  );
}