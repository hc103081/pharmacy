export interface DrugSearchFilters {
  searchText?: string;
  barcode?: string;
  productCode?: string;
  storageLocations?: string[];
  categories?: string[];
  dateFrom?: string;      // ISO date
  dateTo?: string;
  manifestStatus?: ('active' | 'archived')[];
  countedStatus?: ('pending' | 'completed' | 'error')[];
  hasDiscrepancy?: boolean | null;
}

export interface DrugSearchResult {
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

export interface DrugHistoryItem {
  manifest_id: string;
  manifest_name: string;
  page_number: number;
  expected: number;
  actual: number;
  status: 'pending' | 'completed' | 'error';
  counted_at: string;
}

export interface DrugTrendPoint {
  manifest_id: string;
  manifest_name: string;
  counted_at: string;
  page_number: number;
  expected_quantity: number;
  actual_quantity: number;
  discrepancy: number;
  counted_status: 'pending' | 'completed' | 'error';
  storage_location: string | null;
  category: string | null;
}

export interface HeatmapCell {
  storage_location: string;
  category: string;
  total_items: number;
  error_items: number;
  error_rate: number;
  total_discrepancy_qty: number;
}

export interface ManifestSummary {
  manifest_id: string;
  name: string;
  created_at: string;
  status: string;
  total_items: number;
  completed_count: number;
  error_count: number;
  total_discrepancy_qty: number;
  completion_rate: number;
  location_category_breakdown: LocationCategoryBreakdown[];
}

export interface LocationCategoryBreakdown {
  storage_location: string;
  category: string;
  item_count: number;
  error_count: number;
}

export interface ExportOptions {
  format: 'excel' | 'csv' | 'pdf';
  includeCharts: boolean;
  dateRange: { from: string; to: string };
  filters: DrugSearchFilters;
  columns: string[];  // 可自訂欄位
}