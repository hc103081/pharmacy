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

  return data as DrugSearchResult[] || [];
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
    drugResults.map(item => 
      `${item.barcode || ''},${item.name},${item.expected_quantity},${item.actual_quantity},${item.actual_quantity - item.expected_quantity},${item.counted_status}`
    ).join('\n');
    
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}