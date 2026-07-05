'use server';

export interface ImportDrugItem {
  barcode: string;
  product_code: string;
  name: string;
  expected_quantity: number;
  bonus_quantity: number;
  storage_location: string;
  category: string;
}

export interface ImportResponse {
  success: boolean;
  manifestId?: string;
  totalItems?: number;
  error?: string;
}

export interface PageItem {
  storage_location: string;
  category: string;
  barcode: string;
  product_code?: string;
  drug_name: string;
  quantity: string; // 原始字串如 "1罐"，後續用正則提取數字
  page_number?: number; // 照片頁碼（用於排序）
  upload_index?: number; // 原始上傳順序（fallback 排序）
}