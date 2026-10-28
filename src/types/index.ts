export interface DrugItem {
  product_code: string | null;
  id: string;
  manifest_id: string;
  page_number: number;
  item_order: number;
  barcode: string;
  name: string;
  expected_quantity: number;
  warehouse_quantity: number | null; // 總倉庫存量（紙本最右欄純整數，可能為負）
  bonus_quantity: number; // [保留欄位，新格式固定為 0]
  storage_location: string; // 儲位（如 F3）
  category: string; // 類別（如 4）
  actual_quantity: number;
  counted_status: 'pending' | 'completed' | 'error';
  photo_url: string | null;
}

export interface SummaryDrugItem {
  id: string;
  barcode: string;
  name: string;
  expected_quantity: number;
  bonus_quantity: number; // [保留欄位，新格式固定為 0]
  storage_location: string; // 儲位
  category: string; // 類別
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

export interface ManifestFolder {
  id: string;
  user_id?: string;
  name: string;
  parent_id: string | null;
  folder_type: 'system_date' | 'custom';
  created_at?: string;
  updated_at?: string;
  item_count?: number; // 輔助欄位：資料夾內的清單數量
  subfolder_count?: number; // 輔助欄位：子資料夾數量
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
  storage_size_bytes?: number;
  completed_items?: number; // 輔助欄位：已核對完成之項目數
  folder_id?: string | null;
  // v2: Google Drive 雲端備份相關欄位
  cloud_backup?: boolean;
  gdrive_file_id?: string;
  archived_at?: string;
}
