'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDrugSearchSuspended } from '@/app/query/hooks/useDrugSearch';
import { useOfflineCache } from '@/app/query/hooks/useOfflineCache';
import { useQueryFilters } from '@/app/query/context/QueryFiltersContext';
import { format, formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Search, Bell, TrendingUp, Upload, XCircle, Loader2, AlertTriangle, CircleHelp, Filter, Eye, Clock } from 'lucide-react';
import type { InfiniteData } from '@tanstack/react-query';
import { Card, Badge, Skeleton, EmptyState, FadeIn, StaggerContainer, StaggerItem, ScaleIn, Button, DiscrepancyBadge, StatusBadge } from '@/app/query/components/ui';
import { cn, variants } from '@/app/query/design-system';

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
  const { filters, updateFilters, resetFilters } = useQueryFilters();
  
  const { 
    data: searchResults, 
    isLoading, 
    error, 
    refetch,
    isFetching,
  } = useDrugSearchSuspended(filters);
  
  const { 
    isCached, 
    clearCache 
  } = useOfflineCache();
  
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  // 趨勢分析數據 - 按日期分組的歷史數據
  const trendData = useMemo(() => {
    if (!searchResults?.pages) return [];
    
    const dateMap: Record<string, TrendDataPoint> = {};
    
    searchResults.pages.forEach(results => {
      results.forEach(result => {
        result.history.forEach(item => {
          const date = item.counted_at.split('T')[0];
          
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
  
  const results = useMemo(() => {
    if (!searchResults?.pages) return [];
    return searchResults.pages.flat();
  }, [searchResults]);
  
  const stats = useMemo(() => {
    if (!results.length) return null;
    
    const totalItems = results.length;
    const totalDiscrepancy = results.reduce((sum, r) => sum + r.total_discrepancy, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.error_count, 0);
    const hasDiscrepancy = results.some(r => r.total_discrepancy !== 0);
    
    return { totalItems, totalDiscrepancy, totalErrors, hasDiscrepancy };
  }, [results]);

  const toggleExpand = useCallback((barcode: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(barcode)) {
        next.delete(barcode);
      } else {
        next.add(barcode);
      }
      return next;
    });
  }, []);

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleClearCache = useCallback(() => {
    clearCache();
  }, [clearCache]);

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      {/* Stats Cards */}
      <FadeIn y={10} delay={0.05}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card padding="md" hover>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[${colors.text.muted}]">總計藥品</p>
                <p className="text-3xl font-bold text-white mt-1">{stats?.totalItems || 0}</p>
              </div>
              <div className="w-12 h-12 bg-[${colors.accent.primary}]/15 rounded-xl flex items-center justify-center text-[${colors.accent.primary}]">
                <Search className="w-6 h-6" aria-hidden="true" />
              </div>
            </div>
          </Card>
          
          <Card padding="md" hover>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[${colors.text.muted}]">總差異</p>
                <p className={cn(
                  'text-3xl font-bold mt-1',
                  stats?.hasDiscrepancy ? 'text-[${colors.accent.error}]' : 'text-[${colors.accent.success}]'
                )}>
                  {(() => { const v = stats?.totalDiscrepancy ?? 0; return `${v >= 0 ? '+' : ''}${v}`; })()}
                </p>
              </div>
              <div className="w-12 h-12 bg-[${colors.accent.error}]/15 rounded-xl flex items-center justify-center text-[${colors.accent.error}]">
                <TrendingUp className="w-6 h-6" aria-hidden="true" />
              </div>
            </div>
          </Card>
          
          <Card padding="md" hover>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[${colors.text.muted}]">錯誤數量</p>
                <p className="text-3xl font-bold text-[${colors.accent.error}] mt-1">{stats?.totalErrors || 0}</p>
              </div>
              <div className="w-12 h-12 bg-[${colors.accent.error}]/15 rounded-xl flex items-center justify-center text-[${colors.accent.error}]">
                <AlertTriangle className="w-6 h-6" aria-hidden="true" />
              </div>
            </div>
          </Card>
          
          <Card padding="md" hover>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[${colors.text.muted}]">離線狀態</p>
                <p className="text-3xl font-bold mt-1">
                  {isCached ? (
                    <span className="text-[${colors.accent.success}]">有快取</span>
                  ) : (
                    <span className="text-[${colors.accent.error}]">無快取</span>
                  )}
                </p>
              </div>
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center',
                isCached 
                  ? 'bg-[${colors.accent.success}]/15 text-[${colors.accent.success}]'
                  : 'bg-[${colors.accent.error}]/15 text-[${colors.accent.error}]'
              )}>
                {isCached ? (
                  <CircleHelp className="w-6 h-6" aria-hidden="true" />
                ) : (
                  <XCircle className="w-6 h-6" aria-hidden="true" />
                )}
              </div>
            </div>
          </Card>
        </div>
      </FadeIn>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Search Results List */}
        <div className="lg:col-span-2 space-y-4">
          {isLoading ? (
            <StaggerContainer staggerDelay={0.05}>
              <StaggerItem><Skeleton variant="card" /></StaggerItem>
              <StaggerItem><Skeleton variant="card" /></StaggerItem>
              <StaggerItem><Skeleton variant="card" /></StaggerItem>
              <StaggerItem><Skeleton variant="card" /></StaggerItem>
              <StaggerItem><Skeleton variant="card" /></StaggerItem>
            </StaggerContainer>
          ) : error ? (
            <FadeIn>
              <Card padding="lg" variant="default">
                <div className="flex items-center gap-3 mb-4 p-4 bg-[${colors.accent.error}]/15 rounded-xl border border-[${colors.accent.error}]/30">
                  <AlertTriangle className="w-5 h-5 text-[${colors.accent.error}] flex-shrink-0" aria-hidden="true" />
                  <div>
                    <h3 className="font-medium text-[${colors.accent.error}]">載入失敗</h3>
                    <p className="text-sm text-[${colors.text.muted}]">{(error as Error).message}</p>
                  </div>
                </div>
                <Button 
                  variant="secondary" 
                  onClick={handleRetry}
                  leftIcon={<Loader2 className="w-4 h-4" />}
                >
                  重新載入
                </Button>
              </Card>
            </FadeIn>
          ) : results.length > 0 ? (
            <StaggerContainer staggerDelay={0.04}>
              {results.map((result, index) => (
                <StaggerItem key={result.barcode}>
                  <ScaleIn delay={index * 0.02}>
                    <DrugResultCard 
                      result={result} 
                      isExpanded={expandedItems.has(result.barcode)}
                      onToggleExpand={() => toggleExpand(result.barcode)}
                    />
                  </ScaleIn>
                </StaggerItem>
              ))}
            </StaggerContainer>
          ) : (
            <FadeIn>
              <EmptyState
                icon={<Search className="w-12 h-12" />}
                title="沒有找到符合條件的藥品"
                description="請調整篩選條件或清除篩選"
                action={
                  <Button variant="secondary" onClick={resetFilters} leftIcon={<Filter className="w-4 h-4" />}>
                    重置篩選
                  </Button>
                }
              />
            </FadeIn>
          )}
        </div>

        {/* Right: Trend Analysis */}
        <div className="space-y-4">
          <FadeIn y={10} delay={0.1}>
            <Card padding="lg">
              <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[${colors.accent.primary}]" aria-hidden="true" />
                趨勢分析
              </h3>
              
              {trendData.length > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" role="table">
                      <thead className="bg-[${colors.bg.surfaceHover}]/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[${colors.text.muted}] uppercase tracking-wider border-b border-[${colors.border.default}]">日期</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[${colors.text.muted}] uppercase tracking-wider border-b border-[${colors.border.default}]">預期量</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[${colors.text.muted}] uppercase tracking-wider border-b border-[${colors.border.default}]">實際量</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[${colors.text.muted}] uppercase tracking-wider border-b border-[${colors.border.default}]">差異</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[${colors.border.default}]">
                        {trendData.map((day, index) => (
                          <tr key={index} className="hover:bg-[${colors.bg.surfaceHover}]/30 transition-colors">
                            <td className="px-4 py-3 text-sm text-white">{day.date}</td>
                            <td className="px-4 py-3 text-sm text-white">{day.expected_quantity}</td>
                            <td className="px-4 py-3 text-sm text-white">{day.actual_quantity}</td>
                            <td className="px-4 py-3 text-sm whitespace-nowrap">
                              <DiscrepancyBadge 
                                value={day.discrepancy}
                                size="sm"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Trend Summary */}
                  <div className="mt-4 pt-4 border-t border-[${colors.border.default}] grid grid-cols-3 gap-4">
                    <div className={cn(variants.metricBox)}>
                      <p className={variants.metricLabel}>平均差異</p>
                      <p className={cn(variants.metricValue, 
                        trendData.reduce((a, b) => a + b.discrepancy, 0) / trendData.length > 0
                          ? 'text-[${colors.accent.error}]'
                          : 'text-[${colors.accent.primary}]'
                      )}>
                        {(trendData.reduce((a, b) => a + b.discrepancy, 0) / trendData.length).toFixed(1)}
                      </p>
                    </div>
                    <div className={cn(variants.metricBox)}>
                      <p className={variants.metricLabel}>總預期</p>
                      <p className={variants.metricValue}>
                        {trendData.reduce((a, b) => a + b.expected_quantity, 0)}
                      </p>
                    </div>
                    <div className={cn(variants.metricBox)}>
                      <p className={variants.metricLabel}>總實際</p>
                      <p className={variants.metricValue}>
                        {trendData.reduce((a, b) => a + b.actual_quantity, 0)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={<TrendingUp className="w-10 h-10" />}
                  title="暫無趨勢數據"
                  description="選擇特定藥品後將顯示歷史趨勢分析"
                />
              )}
            </Card>
          </FadeIn>

          {/* Offline Cache Status */}
          <FadeIn y={10} delay={0.15}>
            <Card padding="lg">
              <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
                <CircleHelp className="w-5 h-5 text-[${colors.accent.primary}]" aria-hidden="true" />
                緩存狀態
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[${colors.text.muted}]">在線狀態</span>
                  <span className={cn(
                    'text-sm font-medium',
                    isCached ? 'text-[${colors.accent.success}]' : 'text-[${colors.accent.error}]'
                  )}>
                    {isCached ? '有快取' : '無快取'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[${colors.text.muted}]">緩存項目</span>
                  <span className="text-sm text-white font-medium">
                    {isCached ? '有資料' : '無資料'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[${colors.text.muted}]">緩存大小</span>
                  <span className="text-sm text-white font-medium">
                    {isCached ? '未知' : '無'}
                  </span>
                </div>
                
                <Button
                  variant="danger"
                  fullWidth
                  onClick={handleClearCache}
                  disabled={!isCached}
                  leftIcon={<XCircle className="w-4 h-4" />}
                >
                  清除緩存
                </Button>
              </div>
            </Card>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}

// Drug Result Card Component
function DrugResultCard({ 
  result, 
  isExpanded, 
  onToggleExpand 
}: { 
  result: DrugSearchResult; 
  isExpanded: boolean; 
  onToggleExpand: () => void;
}) {
  const hasDiscrepancy = result.total_discrepancy !== 0;
  const discrepancyColor = hasDiscrepancy 
    ? (result.total_discrepancy > 0 ? '#ff4b5c' : '#00f2fe') 
    : '#94a3b8';

  return (
    <Card 
      padding="md" 
      hover 
      className={cn(
        variants.card.interactive,
        hasDiscrepancy && 'border-l-4 border-[${colors.accent.error}]'
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h3 className="text-lg font-semibold text-white truncate">{result.name}</h3>
            {result.product_code && (
              <Badge variant="accent" size="sm">
                {result.product_code}
              </Badge>
            )}
            {/* Barcode Badge - Single, font-mono, cyan */}
            <Badge variant="barcode" size="sm">
              {result.barcode}
            </Badge>
          </div>
          {/* Location & Category as integrated tags */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            {result.storage_location && (
              <Badge variant="tag" size="sm">
                位置: {result.storage_location}
              </Badge>
            )}
            {result.category && (
              <Badge variant="tag" size="sm">
                類別: {result.category}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <DiscrepancyBadge 
              value={result.total_discrepancy}
              size="md"
              className="text-base"
            />
            <p className="text-xs text-[${colors.text.muted}] mt-1">
              {result.manifest_count} 個清單
            </p>
          </div>
          <Button
            variant="icon"
            size="icon"
            onClick={onToggleExpand}
            aria-label={isExpanded ? '收起詳細資訊' : '展開詳細資訊'}
            aria-expanded={isExpanded}
            className="text-[${colors.text.muted}] hover:text-white hover:bg-[${colors.bg.surfaceHover}]"
          >
            <Eye className={cn('w-5 h-5 transition-transform duration-200', isExpanded && 'rotate-180')} aria-hidden="true" />
          </Button>
        </div>
      </div>
      
      {/* Metrics Grid - 4 column grid with metric boxes (AGENTS.md 規範) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
        <div className={variants.metricBox}>
          <p className={variants.metricLabel}>總預期</p>
          <p className={variants.metricValue}>{result.total_expected}</p>
        </div>
        <div className={variants.metricBox}>
          <p className={variants.metricLabel}>總實際</p>
          <p className={variants.metricValue}>{result.total_actual}</p>
        </div>
        <div className={variants.metricBox}>
          <p className={variants.metricLabel}>平均差異</p>
          <p className={cn(variants.metricValue,
            result.avg_discrepancy > 0 ? 'text-[${colors.accent.error}]' :
            result.avg_discrepancy < 0 ? 'text-[${colors.accent.primary}]' :
            'text-[${colors.text.muted}]'
          )}>
            {result.avg_discrepancy > 0 ? '+' : ''}{result.avg_discrepancy.toFixed(1)}
          </p>
        </div>
        <div className={variants.metricBox}>
          <p className={variants.metricLabel}>錯誤</p>
          <p className={cn(variants.metricValue, 'text-[${colors.accent.error}]')}>{result.error_count}</p>
        </div>
      </div>
      
      {result.last_counted_at && (
        <div className="mt-3 pt-3 border-t border-[${colors.border.default}] flex items-center gap-2 text-xs text-[${colors.text.muted}]">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          最後清點: {format(new Date(result.last_counted_at), 'yyyy-MM-dd HH:mm', { locale: zhTW })}
        </div>
      )}
      
      {/* Expanded History */}
      {isExpanded && result.history.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[${colors.border.default}] animate-in slide-down fade-in duration-200">
          <h4 className="text-sm font-medium text-[${colors.text.muted}] mb-3">清點歷史明細</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" role="table">
              <thead>
                <tr className="bg-[${colors.bg.surfaceHover}]/50">
                  <th className="px-3 py-2 text-left text-[${colors.text.muted}]">清單</th>
                  <th className="px-3 py-2 text-left text-[${colors.text.muted}]">預期</th>
                  <th className="px-3 py-2 text-left text-[${colors.text.muted}]">實際</th>
                  <th className="px-3 py-2 text-left text-[${colors.text.muted}]">差異</th>
                  <th className="px-3 py-2 text-left text-[${colors.text.muted}]">狀態</th>
                  <th className="px-3 py-2 text-left text-[${colors.text.muted}]">清點時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[${colors.border.default}]">
                {result.history.map((item, idx) => (
                  <tr key={idx} className="hover:bg-[${colors.bg.surfaceHover}]/30">
                    <td className="px-3 py-2 text-white">{item.manifest_name}</td>
                    <td className="px-3 py-2 text-white">{item.expected}</td>
                    <td className="px-3 py-2 text-white">{item.actual}</td>
                    <td className="px-3 py-2">
                      <DiscrepancyBadge 
                        value={item.actual - item.expected}
                        size="sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge 
                        status={item.status} 
                        size="sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-[${colors.text.muted}]">
                      {format(new Date(item.counted_at), 'MM-dd HH:mm', { locale: zhTW })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}