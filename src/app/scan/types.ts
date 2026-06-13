export interface DrugItem {
  id: string;
  manifest_id: string;
  page_number: number;
  item_order: number;
  barcode: string;
  name: string;
  expected_quantity: number;
  actual_quantity: number;
  counted_status: 'pending' | 'completed' | 'error';
  photo_url: string | null;
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