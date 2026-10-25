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
 * Updated to match the new RPC function signature (migration 20261026000001)
 */
export async function searchDrugsCrossManifest(
  params: DrugSearchFilters & { 
    limit?: number; 
    offset?: number 
  }
): Promise<DrugSearchResult[]> {
  
  // New RPC function returns already-aggregated results
  interface RPCResult {
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
    history: Array<{
      manifestId: string;
      manifestName: string;
      expected: number;
      actual: number;
      discrepancy: number;
      status: string;
      countedAt: string;
    }>;
  }

  try {
    // Convert offset to page (1-based)
    const page = params.offset ? Math.floor(params.offset / (params.limit ?? 50)) + 1 : 1;
    
    // Convert manifestStatus array to single string for new RPC
    const manifestStatus = params.manifestStatus?.length 
      ? params.manifestStatus[0] 
      : 'all';
    
    // Convert countedStatus array to single string for new RPC
    const countedStatus = params.countedStatus?.length 
      ? params.countedStatus[0] 
      : 'all';
    
    // Convert hasDiscrepancy to boolean for new RPC
    const hasDiscrepancy = params.hasDiscrepancy === true;

    const { data, error } = await supabase.rpc('search_drugs_cross_manifest', {
      p_search_text: params.searchText ?? null,
      p_barcode: params.barcode ?? null,
      p_product_code: params.productCode ?? null,
      p_storage_locations: params.storageLocations?.length ? params.storageLocations : null,
      p_categories: params.categories?.length ? params.categories : null,
      p_date_from: params.dateFrom ?? null,
      p_date_to: params.dateTo ?? null,
      p_manifest_status: manifestStatus,
      p_counted_status: countedStatus,
      p_has_discrepancy: hasDiscrepancy,
      p_limit: params.limit ?? 50,
      p_page: page
    });

    if (error) {
      console.error('Supabase RPC error (search_drugs_cross_manifest):', error);
      throw new Error(`查詢失敗: ${error.message}`);
    }

    // Handle NULL/undefined responses gracefully
    const rawResults = (data as RPCResult[]) || [];
    
    // Map RPC results to DrugSearchResult format
    const results: DrugSearchResult[] = rawResults.map(item => ({
      barcode: item.barcode,
      product_code: item.product_code,
      name: item.name,
      storage_location: item.storage_location,
      category: item.category,
      manifest_count: Number(item.manifest_count) || 0,
      total_expected: Number(item.total_expected) || 0,
      total_actual: Number(item.total_actual) || 0,
      total_discrepancy: Number(item.total_discrepancy) || 0,
      avg_discrepancy: Number(item.avg_discrepancy) || 0,
      error_count: Number(item.error_count) || 0,
      last_counted_at: item.last_counted_at,
      history: (item.history || []).map(h => ({
        manifest_id: h.manifestId,
        manifest_name: h.manifestName,
        page_number: 1, // Not provided by new RPC, default to 1
        expected: Number(h.expected) || 0,
        actual: Number(h.actual) || 0,
        status: (h.status as 'pending' | 'completed' | 'error') || 'pending',
        counted_at: h.countedAt
      }))
    }));
    
    // Results are already sorted by last_counted_at DESC from the RPC
    return results;
  } catch (err) {
    console.error('searchDrugsCrossManifest error:', err);
    throw err;
  }
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