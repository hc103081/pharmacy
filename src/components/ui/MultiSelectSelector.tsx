import { useState } from 'react';

interface MultiSelectSelectorProps<T> {
  label: string;
  options: T[];
  selected: T[];
  onChange: (selected: T[]) => void;
  getLabel: (item: T) => string;
  getValue: (item: T) => string | number;
}

export function MultiSelectSelector<T>({
  label,
  options,
  selected,
  onChange,
  getLabel,
  getValue
}: MultiSelectSelectorProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    getLabel(option).toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Check if all visible options are selected
  const isAllVisibleSelected = filteredOptions.every(option =>
    selected.some(sel => getValue(sel) === getValue(option))
  );
  
  // Check if any options are selected
  const hasAnySelected = selected.length > 0;
  
  // Toggle select all/clear all for visible options
  const toggleSelectAll = () => {
    if (isAllVisibleSelected) {
      // Clear selection for visible options
      const newSelected = selected.filter(sel =>
        !filteredOptions.some(opt => getValue(sel) === getValue(opt))
      );
      onChange(newSelected);
    } else {
      // Select all visible options
      const newlySelected = filteredOptions.filter(opt =>
        !selected.some(sel => getValue(sel) === getValue(opt))
      );
      onChange([...selected, ...newlySelected]);
    }
  };
  
  // Toggle individual option selection
  const toggleOption = (option: T) => {
    const isSelected = selected.some(sel => getValue(sel) === getValue(option));
    if (isSelected) {
      // Remove from selection
      onChange(selected.filter(sel => getValue(sel) !== getValue(option)));
    } else {
      // Add to selection
      onChange([...selected, option]);
    }
  };
  
  return (
    <div className="space-y-3">
      {/* Selector Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3 py-2 text-left 
                 text-sm font-medium text-slate-300 bg-slate-800/50 rounded-md 
                 hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center">
          {/* Icon would be passed via props in a more flexible implementation */}
          <span className="mr-2 h-4 w-4">∣</span> {/* Placeholder */}
          <span>{label}</span>
        </div>
        <span className="text-xs text-slate-400">{selected.length} 個已選擇</span>
        <span className="h-4 w-4 transition-transform duration-200">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>
      
      {/* Selected Items Display */}
      {hasAnySelected && (
        <div className="mt-2 ml-4 space-y-1">
          {selected.map((item, index) => (
            <div key={getValue(item)} className="flex items-center bg-slate-700/50 rounded px-2 py-1 text-xs">
              <span className="mr-1">{getLabel(item)}</span>
              <button 
                onClick={() => toggleOption(item)}
                className="text-slate-400 hover:text-red-400 hover:bg-slate-600/20 rounded"
              >
                <span className="h-3 w-3">×</span>
              </button>
            </div>
          ))}
        </div>
      )}
      
      {/* Dropdown Panel */}
      {isOpen && (
        <div className="mt-2 space-y-2">
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 pl-10 bg-slate-800/50 rounded-md border border-slate-600/50 
                       text-white placeholder-slate-400 focus:outline-none focus:ring-2 
                       focus:ring-[#00f2fe] focus:border-[#00f2fe]"
              placeholder="搜尋..."
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4">
              🔍
            </span>
          </div>
          
          {/* Select All / Clear All */}
          <div className="flex items-center space-x-3 px-2 py-1 bg-slate-800/50 rounded-md text-sm">
            <button
              onClick={toggleSelectAll}
              className={`flex-1 text-center px-2 py-1 rounded 
                       ${isAllVisibleSelected ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400' 
                       : 'bg-slate-600/20 hover:bg-slate-600/30 text-slate-300'}`}
            >
              {isAllVisibleSelected ? '清除可見項目' : '全選可見項目'}
            </button>
          </div>
          
          {/* Options List */}
          <div className="max-h-[200px] overflow-y-auto space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-center text-slate-500">
                沒有找到匹配項目
              </div>
            ) : (
              <>
                {filteredOptions.map((option) => {
                  const isSelected = selected.some(sel => getValue(sel) === getValue(option));
                  return (
                    <label key={getValue(option)} className="flex items-center px-3 py-2 cursor-pointer rounded-hover bg-slate-800/50 hover:bg-slate-800 transition-colors">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation(); // Prevent triggering label click twice
                          toggleOption(option);
                        }}
                        className="w-4 h-4 text-[#00f2fe] bg-slate-700 rounded border-gray-500 focus:ring-2"
                      />
                      <span className="ml-3 flex-1">{getLabel(option)}</span>
                    </label>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}