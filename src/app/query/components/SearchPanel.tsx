'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Search, Sliders, X } from 'lucide-react';

interface SearchPanelProps {
  className?: string;
  isDrawer?: boolean;
  children?: React.ReactNode;
}

export default function SearchPanel({ 
  className = '', 
  isDrawer = false,
  children 
}: SearchPanelProps) {
  const [isOpen, setIsOpen] = useState(!isDrawer); // Drawers start closed, regular panels start open
  const [searchText, setSearchText] = useState('');
  const [selectedStorageLocations, setSelectedStorageLocations] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{ from: string | null; to: string | null }>({ 
    from: null, 
    to: null 
  });

  const storageLocations = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3'];
  const categories = ['西藥', '中藥', '保健品', '医療材料', '消毒用品', '其他'];

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
  };

  const handleDateChange = (type: 'from' | 'to', date: string | null) => {
    setDateRange(prev => ({
      ...prev,
      [type]: date
    }));
  };

  const toggleStorageLocation = (location: string) => {
    setSelectedStorageLocations(prev => 
      prev.includes(location) 
        ? prev.filter(l => l !== location) 
        : [...prev, location]
    );
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const resetFilters = () => {
    setSearchText('');
    setSelectedStorageLocations([]);
    setSelectedCategories([]);
    setDateRange({ from: null, to: null });
  };

  const applyFilters = () => {
    // TODO: Apply filters and trigger search
    alert('Applying filters: ' + JSON.stringify({
      searchText,
      selectedStorageLocations,
      selectedCategories,
      dateRange
    }));
  };

  return (
    <aside className={`${className} flex flex-col h-[100%] overflow-hidden transition-all duration-300`}>
      {/* Mobile drawer header */}
      {isDrawer && (
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 backdrop-blur-md border-b border-slate-800">
          <h2 className="text-lg font-bold text-[#00f2fe]">搜尋與篩選</h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto p-4">
        {/* Search */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-400 mb-1">關鍵字搜尋</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchText}
              onChange={handleSearchChange}
              placeholder="條碼、品名、製造廠代碼..."
              className="pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-[#00f2fe] focus:bg-slate-800 text-white"
            />
          </div>
        </div>
        
        {/* Divider */}
        <div className="h-px mx-4 my-3 bg-slate-800/50"></div>
        
        {/* Advanced Filters */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">進階篩選</label>
            <button 
              onClick={() => {}}
              className={`w-full text-left flex items-center justify-between px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors ${
                !isOpen ? 'border-t-broken' : ''
              }`}
            >
              <div className="flex-1">
                <span className="text-sm font-medium">{isOpen ? '收起篩選' : '展開進階篩選'}</span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform duration-200" 
                style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
            </button>
          </div>
          
          {isOpen && (
            <div className="mt-4 space-y-3">
              {/* Storage Locations */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-400 mb-1">儲位</label>
                <div className="flex flex-wrap gap-1">
                  {storageLocations.map(location => (
                    <button
                      key={location}
                      onClick={() => toggleStorageLocation(location)}
                      className={`px-2 py-1 text-xs rounded bg-slate-800/50 border border-slate-700 hover:bg-slate-800 transition-colors ${
                        selectedStorageLocations.includes(location) 
                          ? 'bg-[#00f2fe]/20 border-[#00f2fe] text-[#00f2fe]' 
                          : ''
                      }`}
                    >
                      {location}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Categories */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-400 mb-1">類別</label>
                <div className="flex flex-wrap gap-1">
                  {categories.map(category => (
                    <button
                      key={category}
                      onClick={() => toggleCategory(category)}
                      className={`px-2 py-1 text-xs rounded bg-slate-800/50 border border-slate-700 hover:bg-slate-800 transition-colors ${
                        selectedCategories.includes(category) 
                          ? 'bg-[#00f2fe]/20 border-[#00f2fe] text-[#00f2fe]' 
                          : ''
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Date Range */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-400 mb-1">日期範圍</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">開始日期</label>
                    <input
                      type="date"
                      value={dateRange.from ?? ''}
                      onChange={(e) => handleDateChange('from', e.target.value || null)}
                      className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-[#00f2fe] focus:bg-slate-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">結束日期</label>
                    <input
                      type="date"
                      value={dateRange.to ?? ''}
                      onChange={(e) => handleDateChange('to', e.target.value || null)}
                      className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-[#00f2fe] focus:bg-slate-800 text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Divider */}
        <div className="h-px mx-4 my-3 bg-slate-800/50"></div>
        
        {/* Filter Summary and Actions */}
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-400">當前篩選條件</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {searchText && (
                <span className="px-2 py-0.5 bg-slate-800/50 rounded text-xs">
                  搜尋: {searchText}
                </span>
              )}
              {selectedStorageLocations.length > 0 && (
                <span className="px-2 py-0.5 bg-slate-800/50 rounded text-xs">
                  儲位: {selectedStorageLocations.join(', ')}
                </span>
              )}
              {selectedCategories.length > 0 && (
                <span className="px-2 py-0.5 bg-slate-800/50 rounded text-xs">
                  類別: {selectedCategories.join(', ')}
                </span>
              )}
              {(dateRange.from || dateRange.to) && (
                <span className="px-2 py-0.5 bg-slate-800/50 rounded text-xs">
                  日期: 
                  {(dateRange.from ?? '開始')} ~ 
                  {(dateRange.to ?? '結束')}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <button 
              onClick={resetFilters}
              className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors text-sm"
            >
              重置
            </button>
            <button 
              onClick={applyFilters}
              className="flex-1 px-3 py-2 bg-[#00f2fe]/20 border border-[#00f2fe] rounded-lg hover:bg-[#00f2fe]/30 transition-colors text-sm"
            >
              套用篩選
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile drawer footer */}
      {isDrawer && (
        <div className="px-4 py-3 bg-slate-800/50 backdrop-blur-md border-t border-slate-800">
          <button 
            onClick={applyFilters}
            className="w-full px-4 py-2 bg-[#00f2fe]/20 border border-[#00f2fe] rounded-lg hover:bg-[#00f2fe]/30 transition-colors"
          >
            套用篩選並搜尋
          </button>
        </div>
      )}
    </aside>
  );
}