'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronDown, ChevronUp, X, Sliders, Filter, Calendar } from 'lucide-react';
import { useQueryFilters } from '@/app/query/context/QueryFiltersContext';
import { Button } from '@/app/query/components/ui';
import { Input } from '@/app/query/components/ui';
import { Badge } from '@/app/query/components/ui';
import { FadeIn, StaggerContainer, StaggerItem, SlideIn } from '@/app/query/components/ui/MotionWrapper';
import { cn } from '@/app/query/design-system';

interface SearchPanelProps {
  className?: string;
  isDrawer?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

const STORAGE_LOCATIONS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3'];
const CATEGORIES = ['西藥', '中藥', '保健品', '醫療材料', '消毒用品', '其他'];

export default function SearchPanel({ 
  className = '', 
  isDrawer = false,
  isOpen = true,
  onClose
}: SearchPanelProps) {
  const { filters, updateFilters, resetFilters: resetContextFilters } = useQueryFilters();

  // For drawer mode, use controlled isOpen prop; for sidebar mode, use local state
  const [localIsOpen, setLocalIsOpen] = useState(!isDrawer);
  const drawerIsOpen = isDrawer ? isOpen : localIsOpen;
  const setDrawerIsOpen = isDrawer ? (onClose ?? (() => {})) : setLocalIsOpen;

  // 本地草稿狀態：初始值同步自已套用的篩選條件，按「套用篩選」時才 commit 到共用狀態
  const [searchText, setSearchText] = useState(filters.searchText ?? '');
  const [selectedStorageLocations, setSelectedStorageLocations] = useState<string[]>(filters.storageLocations ?? []);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(filters.categories ?? []);
  const [dateRange, setDateRange] = useState<{ from: string | null; to: string | null }>({ 
    from: filters.dateFrom ? new Date(filters.dateFrom).toISOString().split('T')[0] : null, 
    to: filters.dateTo ? new Date(filters.dateTo).toISOString().split('T')[0] : null 
  });

  // Sync local state when filters change externally (e.g., from URL or other tabs)
  useEffect(() => {
    if (!isDrawer) {
      setSearchText(filters.searchText ?? '');
      setSelectedStorageLocations(filters.storageLocations ?? []);
      setSelectedCategories(filters.categories ?? []);
      setDateRange({ 
        from: filters.dateFrom ? new Date(filters.dateFrom).toISOString().split('T')[0] : null, 
        to: filters.dateTo ? new Date(filters.dateTo).toISOString().split('T')[0] : null 
      });
    }
  }, [filters, isDrawer]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
  }, []);

  const handleDateChange = useCallback((field: 'from' | 'to', value: string | null) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
    
    // Convert to ISO string for API
    const newFrom = field === 'from' ? value : dateRange.from;
    const newTo = field === 'to' ? value : dateRange.to;
    
    updateFilters({
      dateFrom: newFrom ? `${newFrom}T00:00:00.000Z` : undefined,
      dateTo: newTo ? `${newTo}T23:59:59.999Z` : undefined,
    });
  }, [dateRange, updateFilters]);

  const toggleStorageLocation = useCallback((location: string) => {
    setSelectedStorageLocations(prev => 
      prev.includes(location) 
        ? prev.filter(l => l !== location) 
        : [...prev, location]
    );
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  }, []);

  const resetFilters = useCallback(() => {
    // 同時清空本地草稿與共用的已套用篩選條件
    setSearchText('');
    setSelectedStorageLocations([]);
    setSelectedCategories([]);
    setDateRange({ from: null, to: null });
    resetContextFilters();
  }, [resetContextFilters]);

  const applyFilters = useCallback(() => {
    // 將草稿狀態 commit 到共用篩選狀態，觸發 DrugSearchTab 重新查詢
    // 條碼偵測：8-14 位數字 -> 走 p_barcode 精確比對；其他 -> 走 p_search_text 模糊搜尋
    const trimmedSearch = searchText.trim();
    const isBarcode = /^\d{8,14}$/.test(trimmedSearch);
    
    updateFilters({
      searchText: isBarcode ? '' : searchText,
      barcode: isBarcode ? trimmedSearch : undefined,
      storageLocations: selectedStorageLocations,
      categories: selectedCategories,
      dateFrom: dateRange.from ? `${dateRange.from}T00:00:00.000Z` : undefined,
      dateTo: dateRange.to ? `${dateRange.to}T23:59:59.999Z` : undefined,
    });
  }, [searchText, selectedStorageLocations, selectedCategories, dateRange, updateFilters]);

  // Close drawer when applying filters
  const handleApplyAndClose = useCallback(() => {
    applyFilters();
    if (isDrawer && onClose) {
      onClose();
    }
  }, [applyFilters, isDrawer, onClose]);

  const hasActiveFilters = 
    filters.searchText || 
    filters.barcode ||
    (filters.storageLocations?.length ?? 0) > 0 || 
    (filters.categories?.length ?? 0) > 0 || 
    filters.dateFrom || 
    filters.dateTo;

  return (
    <aside 
      className={cn(
        'flex flex-col h-full overflow-hidden transition-all duration-300',
        'bg-[${colors.bg.primary}]',
        isDrawer && 'fixed inset-y-0 right-0 z-40 w-72 max-w-[85vw] border-l border-[${colors.border.panel}] shadow-xl',
        !isDrawer && 'hidden lg:block lg:w-64 border-r border-[${colors.border.panel}]',
        className
      )}
    >
      {/* Mobile drawer header */}
      {isDrawer && (
        <div className="flex items-center justify-between px-4 py-3 bg-[${colors.bg.surface}]/50 border-b border-[${colors.border.panel}]">
          <h2 className="text-lg font-bold text-[${colors.accent.primary}]">搜尋與篩選</h2>
          <Button
            variant="icon"
            size="icon"
            onClick={() => setDrawerIsOpen(false)}
            aria-label="關閉篩選面板"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* Search Input */}
        <FadeIn y={10} delay={0.05}>
          <div className="mb-6">
            <label className="block text-sm font-medium text-[${colors.text.muted}] mb-2">
              <span className="flex items-center gap-1">
                <Search className="w-4 h-4" aria-hidden="true" />
                關鍵字搜尋
              </span>
            </label>
            <Input
              type="text"
              value={searchText}
              onChange={handleSearchChange}
              placeholder="條碼、品名、製造廠代碼..."
              variant="search"
              leftIcon={<Search className="w-4 h-4" />}
              className="min-h-[48px]"
            />
            <p className="mt-1.5 text-xs text-[${colors.text.muted}]">
              輸入 8-14 位數字自動偵測為條碼精確搜尋
            </p>
          </div>
        </FadeIn>
        
        {/* Divider */}
        <div className="h-px mx-4 my-4 bg-[${colors.border.default}]/50" />
        
        {/* Advanced Filters */}
        <FadeIn y={10} delay={0.1}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[${colors.text.muted}] mb-2">
                <span className="flex items-center gap-1">
                  <Filter className="w-4 h-4" aria-hidden="true" />
                  進階篩選
                </span>
              </label>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setDrawerIsOpen(!drawerIsOpen)}
                className={cn(
                  'text-left justify-between',
                  !drawerIsOpen && 'border-t border-dashed border-[${colors.border.default}]'
                )}
                aria-expanded={drawerIsOpen}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {drawerIsOpen ? '收起篩選' : '展開進階篩選'}
                  </span>
                </div>
                <ChevronDown className={cn(
                  'w-4 h-4 text-[${colors.text.muted}] transition-transform duration-200',
                  drawerIsOpen && 'rotate-180'
                )} />
              </Button>
            </div>
            
            {drawerIsOpen && (
              <StaggerContainer staggerDelay={0.05} delayChildren={0.1}>
                {/* Storage Locations */}
                <StaggerItem>
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-[${colors.text.muted}]">
                      儲位 (A1~D3)
                    </label>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="儲位選擇">
                      {STORAGE_LOCATIONS.map(location => (
                        <Button
                          key={location}
                          variant={selectedStorageLocations.includes(location) ? 'pillSelected' : 'pill'}
                          size="sm"
                          onClick={() => toggleStorageLocation(location)}
                          className="min-h-[36px]"
                          aria-pressed={selectedStorageLocations.includes(location)}
                        >
                          {location}
                        </Button>
                      ))}
                    </div>
                  </div>
                </StaggerItem>
                
                {/* Categories */}
                <StaggerItem>
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-[${colors.text.muted}]">
                      類別
                    </label>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="類別選擇">
                      {CATEGORIES.map(category => (
                        <Button
                          key={category}
                          variant={selectedCategories.includes(category) ? 'pillSelected' : 'pill'}
                          size="sm"
                          onClick={() => toggleCategory(category)}
                          className="min-h-[36px]"
                          aria-pressed={selectedCategories.includes(category)}
                        >
                          {category}
                        </Button>
                      ))}
                    </div>
                  </div>
                </StaggerItem>
                
                {/* Date Range - Vertical layout */}
                <StaggerItem>
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-[${colors.text.muted}]">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" aria-hidden="true" />
                        日期範圍
                      </span>
                    </label>
                    <div className="space-y-3">
                      <div className="min-w-0">
                        <label className="block text-xs text-[${colors.text.muted}] mb-1">開始日期</label>
                        <Input
                          type="date"
                          value={dateRange.from ?? ''}
                          onChange={(e) => handleDateChange('from', e.target.value || null)}
                          variant="date"
                          className="min-h-[44px]"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className="block text-xs text-[${colors.text.muted}] mb-1">結束日期</label>
                        <Input
                          type="date"
                          value={dateRange.to ?? ''}
                          onChange={(e) => handleDateChange('to', e.target.value || null)}
                          variant="date"
                          className="min-h-[44px]"
                        />
                      </div>
                    </div>
                  </div>
                </StaggerItem>
              </StaggerContainer>
            )}
          </div>
        </FadeIn>
        
        {/* Divider */}
        <div className="h-px mx-4 my-4 bg-[${colors.border.default}]/50" />
        
        {/* Filter Summary and Actions */}
        <FadeIn y={10} delay={0.15}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[${colors.text.muted}]">當前篩選條件</label>
              <div className="flex flex-wrap gap-1.5">
                {filters.searchText && (
                  <Badge variant="accent" size="sm">
                    <Search className="w-3 h-3 mr-1" aria-hidden="true" />
                    搜尋: {filters.searchText}
                  </Badge>
                )}
                {filters.barcode && (
                  <Badge variant="barcode" size="sm">
                    <Search className="w-3 h-3 mr-1" aria-hidden="true" />
                    {filters.barcode}
                  </Badge>
                )}
                {(filters.storageLocations?.length ?? 0) > 0 && (
                  <Badge variant="tag" size="sm">
                    儲位: {filters.storageLocations!.join(', ')}
                  </Badge>
                )}
                {(filters.categories?.length ?? 0) > 0 && (
                  <Badge variant="tag" size="sm">
                    類別: {filters.categories!.join(', ')}
                  </Badge>
                )}
                {(filters.dateFrom || filters.dateTo) && (
                  <Badge variant="tag" size="sm">
                    日期: 
                    {(filters.dateFrom ? new Date(filters.dateFrom).toLocaleDateString('zh-TW') : '開始')} ~ 
                    {(filters.dateTo ? new Date(filters.dateTo).toLocaleDateString('zh-TW') : '結束')}
                  </Badge>
                )}
                {!hasActiveFilters && (
                  <span className="text-xs text-[${colors.text.muted}]">無篩選條件</span>
                )}
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={resetFilters}
                className="min-h-[44px]"
              >
                重置
              </Button>
              <Button
                variant="primary"
                size="md"
                fullWidth
                onClick={handleApplyAndClose}
                className="min-h-[44px]"
              >
                <Filter className="w-4 h-4 mr-1" aria-hidden="true" />
                套用篩選
              </Button>
            </div>
          </div>
        </FadeIn>
      </div>
      
      {/* Mobile drawer footer */}
      {isDrawer && (
        <div className="p-4 bg-[${colors.bg.surface}]/50 border-t border-[${colors.border.panel}]">
          <Button
            variant="primary"
            fullWidth
            size="lg"
            onClick={handleApplyAndClose}
            className="min-h-[48px]"
          >
            <Filter className="w-4 h-4 mr-1" aria-hidden="true" />
            套用篩選並搜尋
          </Button>
        </div>
      )}
    </aside>
  );
}