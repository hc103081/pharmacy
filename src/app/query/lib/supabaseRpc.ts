'use client';

import { createClient } from '@/lib/supabase/client';
import type { 
  DrugSearchFilters, 
  DrugSearchResult, 
  DrugTrendPoint, 
  HeatmapCell,
  ManifestSummary,
  ExportOptions
} from '@/types/query';

const supabase = createClient();

/**
 * Search drugs across manifests using RPC function
 */
export async function searchDrugsCrossManifest(
  params: DrugSearchFilters & { 
    limit?: number; 
    offset?: number 
  }
): Promise<DrugSearchResult[]> {
  
  // 聲明內部類型
  interface DrugSearchResultInternal {
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
    history: any[];
  }
  const { data, error } = await supabase.rpc('search_drugs_cross_manifest', {
    p_search_text: params.searchText ?? null,
    p_barcode: params.barcode ?? null,
    p_product_code: params.productCode ?? null,
    p_storage_locations: params.storageLocations?.length ? params.storageLocations : null,
    p_categories: params.categories?.length ? params.categories : null,
    p_date_from: params.dateFrom ?? null,
    p_date_to: params.dateTo ?? null,
    p_manifest_status: params.manifestStatus ?? ['active', 'archived'],
    p_counted_status: params.countedStatus ?? null,
    p_has_discrepancy: params.hasDiscrepancy ?? null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0
  });

  if (error) {
    console.error('Supabase RPC error (search_drugs_cross_manifest):', error);
    throw new Error(error.message);
  }

  // 轉換原始數據為期望的 DrugSearchResult 格式
  const rawResults = data as any[] || [];
  
  // 按條碼分組聚合數據
  const groupedResults = rawResults.reduce((acc, item) => {
    const barcode = item.barcode;
    if (!acc[barcode]) {
      acc[barcode] = {
        barcode: item.barcode,
        product_code: item.product_code,
        name: item.name,
        storage_location: item.storage_location,
        category: item.category,
        manifest_count: 0,
        total_expected: 0,
        total_actual: 0,
        total_discrepancy: 0,
        avg_discrepancy: 0,
        error_count: 0,
        last_counted_at: null,
        history: []
      };
    }
    
    // 聚合統計數據
    acc[barcode].manifest_count += 1;
    acc[barcode].total_expected += Number(item.expected_quantity) || 0;
    acc[barcode].total_actual += Number(item.actual_quantity) || 0;
    acc[barcode].total_discrepancy += (Number(item.actual_quantity) || 0) - (Number(item.expected_quantity) || 0);
    
    // 計算平均差異
    acc[barcode].avg_discrepancy = acc[barcode].total_discrepancy / acc[barcode].manifest_count;
    
    // 計算錯誤數量
    if (item.counted_status === 'error') {
      acc[barcode].error_count += 1;
    }
    
    // 記錄最後清點時間
    const countedAt = item.counted_at || item.created_at;
    if (countedAt && (!acc[barcode].last_counted_at || new Date(countedAt) > new Date(acc[barcode].last_counted_at))) {
      acc[barcode].last_counted_at = countedAt;
    }
    
    // 添加歷史記錄
    if (item.manifest_id) {
      acc[barcode].history.push({
        manifest_id: item.manifest_id,
        manifest_name: item.manifest_name || `清單 ${item.manifest_id.substring(0, 8)}`,
        page_number: item.page_number || 1,
        expected: Number(item.expected_quantity) || 0,
        actual: Number(item.actual_quantity) || 0,
        status: item.counted_status || 'pending',
        counted_at: countedAt || new Date().toISOString()
      });
    }
    
    return acc;
  }, {} as Record<string, DrugSearchResult>);

  // 轉換為數組並排序
  const resultArray = Object.values(groupedResults) as DrugSearchResultInternal[];
  
  // 按總差異絕對值排序（差異最大的在前）
  resultArray.sort((a, b) => Math.abs(b.total_discrepancy) - Math.abs(a.total_discrepancy));
  
  return resultArray;
}

/**
 * Get trend data for a specific drug
 */
export async function getDrugTrendData(
  barcode: string, 
  productCode?: string
): Promise<DrugTrendPoint[]> {
  const { data, error } = await supabase.rpc('get_drug_trend_data', {
    p_barcode: barcode,
    p_product_code: productCode ?? null,
    p_limit: 50
  });

  if (error) {
    console.error('Supabase RPC error (get_drug_trend_data):', error);
    throw new Error(error.message);
  }

  return data as DrugTrendPoint[] || [];
}

/**
 * Get heatmap data for location/category analysis
 */
export async function getLocationCategoryHeatmap(
  dateFrom?: string, 
  dateTo?: string
): Promise<HeatmapCell[]> {
  const { data, error } = await supabase.rpc('get_location_category_heatmap', {
    p_date_from: dateFrom ?? null,
    p_date_to: dateTo ?? null
  });

  if (error) {
    console.error('Supabase RPC error (get_location_category_heatmap):', error);
    throw new Error(error.message);
  }

  return data as HeatmapCell[] || [];
}

/**
 * Get manifest summary statistics
 */
export async function getManifestSummary(): Promise<ManifestSummary[]> {
  const { data, error } = await supabase.rpc('get_manifest_summary');

  if (error) {
    console.error('Supabase RPC error (get_manifest_summary):', error);
    throw new Error(error.message);
  }

  return data as ManifestSummary[] || [];
}

/**
 * Export query results
 * Note: For large exports, this would ideally call an Edge Function
 */
export async function exportQueryResults(
  options: ExportOptions
): Promise<Blob> {
  // For now, we'll simulate export by fetching data and letting frontend libraries handle it
  // In production, this would call a Supabase Edge Function that generates the file
  
  const { data: drugResults } = await supabase
    .from('drug_items')
    .select('*')
    .limit(1000); // Limit for demo - real implementation would respect filters
    
  // Convert to CSV for demo
  const csvContent = 
    '條碼,品名,預期數量,實際數量,差異,狀態\n' +
    (drugResults || []).map(item => 
      `${item.barcode || ''},${item.name},${item.expected_quantity},${item.actual_quantity},${item.actual_quantity - item.expected_quantity},${item.counted_status}`
    ).join('\n');
    
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}