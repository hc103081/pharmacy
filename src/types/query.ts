export interface DrugSearchFilters {
  searchText?: string;
  barcode?: string;
  productCode?: string;
  storageLocations?: string[];
  categories?: string[];
  dateFrom?: string;      // ISO date
  dateTo?: string;
  manifestStatus?: ('active' | 'archived')[] | ('active' | 'archived');
  countedStatus?: ('pending' | 'completed' | 'error')[] | ('pending' | 'completed' | 'error');
  hasDiscrepancy?: boolean | null;
  limit?: number;
  offset?: number;
}

export interface DrugHistoryItem {
  manifest_id: string;
  manifest_name: string;
  page_number: number;
  item_order?: number;
  expected: number;
  actual: number;
  discrepancy?: number;
  status: 'pending' | 'completed' | 'error';
  counted_at: string;
  counter_name?: string;
  photo_url?: string | null;
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

/**
 * F4-A 審計樹節點型別（單一盤點清單節點）
 */
export interface AuditNode {
  manifestId: string;
  manifestName: string;
  drugItemId?: string;
  pageNumber: number;
  itemOrder: number;
  expectedQuantity: number;
  actualQuantity: number;
  discrepancy: number;
  status: 'pending' | 'completed' | 'error';
  countedAt: string;
  counterName: string;
  photoUrl: string | null;
}

/**
 * F4-A 月份審計聚合群組型別
 */
export interface AuditMonthGroup {
  monthKey: string;      // '2026-10'
  monthLabel: string;    // '2026 年 10 月'
  totalAudits: number;
  matchRate: number;     // 0 - 100
  netDiscrepancy: number; // 累計盤盈或盤虧
  nodes: AuditNode[];
}

/**
 * F4-A 藥品完整審計時間軸紀錄（包含月份聚合與全量歷程）
 */
export interface DrugAuditRecord {
  barcode: string;
  productCode: string | null;
  name: string;
  storageLocation: string | null;
  category: string | null;
  currentExpected: number;
  currentActual: number;
  currentDiscrepancy: number;
  errorCount: number;
  lastCountedAt: string | null;
  monthlyGroups: AuditMonthGroup[];
  allHistory: AuditNode[]; // 供存證比對彈窗任意切換歷史照片
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
  accuracy_rate: number;
}

export interface ExportOptions {
  format: 'xlsx' | 'csv' | 'pdf';
  includeHistory: boolean;
  includeCharts: boolean;
  dateRange?: {
    from: string;
    to: string;
  };
}
