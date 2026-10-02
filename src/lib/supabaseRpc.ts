import { createClient } from '@/lib/supabase/client';
import type { 
  DrugSearchResult, 
  DrugSearchFilters,
  DrugTrendPoint,
  HeatmapCell
} from '@/types/query';

const supabase = createClient();

export async function searchDrugsCrossManifest(params: DrugSearchFilters) {
  const { data, error } = await supabase.rpc('search_drugs_cross_manifest', params);
  if (error) throw new Error(error.message);
  return data as DrugSearchResult[];
}

export async function getDrugTrendData(barcode: string, productCode?: string) {
  const { data, error } = await supabase.rpc('get_drug_trend_data', {
    p_barcode: barcode,
    p_product_code: productCode,
  });
  if (error) throw new Error(error.message);
  return data as DrugTrendPoint[];
}

export async function getLocationCategoryHeatmap(dateFrom?: string, dateTo?: string) {
  const { data, error } = await supabase.rpc('get_location_category_heatmap', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
  });
  if (error) throw new Error(error.message);
  return data as HeatmapCell[];
}