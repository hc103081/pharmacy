export interface DrugItem {
  id: string;
  manifest_id: string;
  page_number: number;
  item_order: number;
  barcode: string;
  name: string;
  expected_quantity: number;
  bonus_quantity: number;
  actual_quantity: number;
  counted_status: 'pending' | 'completed' | 'error';
  photo_url: string | null;
}

export interface SummaryDrugItem {
  id: string;
  barcode: string;
  name: string;
  expected_quantity: number;
  actual_quantity: number;
  counted_status: 'pending' | 'completed' | 'error';
}

export interface ErrorDrugItem {
  id: string;
  page_number: number;
  name: string;
  barcode: string;
  actual_quantity: number;
  expected_quantity: number;
}

export interface JumpTarget {
  page: number;
  name: string;
  id: string;
  barcode: string;
}

export interface Manifest {
  id: string;
  name: string;
  order_number?: string;
  delivery_date?: string;
  source_file?: string;
  total_items: number;
  status: string;
  created_at?: string;
  total_discrepancy?: number;
  conclusion_type?: string;
}