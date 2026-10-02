import ExcelJS from 'exceljs';
import { unparse } from 'papaparse';
import type { DrugSearchResult } from '@/types/query';

// Excel 導出
export async function exportToExcel(data: DrugSearchResult[], options: { includeCharts: boolean }): Promise<Blob> {
  // 建立工作簿和工作表
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('藥品清點報表');
  
  // 添加標題行
  worksheet.columns = [
    { header: '條碼', key: 'barcode', width: 20 },
    { header: '藥品名稱', key: 'name', width: 30 },
    { header: '製造廠代碼', key: 'product_code', width: 20 },
    { header: '儲位', key: 'storage_location', width: 15 },
    { header: '類別', key: 'category', width: 15 },
    { header: '出現清單數', key: 'manifest_count', width: 15 },
    { header: '總預期量', key: 'total_expected', width: 15 },
    { header: '總實際量', key: 'total_actual', width: 15 },
    { header: '總差異量', key: 'total_discrepancy', width: 15 },
    { header: '平均差異', key: 'avg_discrepancy', width: 15 },
    { header: '錯誤次數', key: 'error_count', width: 15 },
  ];
  
  // 添加數據行
  data.forEach(item => {
    worksheet.addRow({
      barcode: item.barcode,
      name: item.name,
      product_code: item.product_code || '',
      storage_location: item.storage_location || '',
      category: item.category || '',
      manifest_count: item.manifest_count,
      total_expected: item.total_expected,
      total_actual: item.total_actual,
      total_discrepancy: item.total_discrepancy,
      avg_discrepancy: item.avg_discrepancy,
      error_count: item.error_count,
    });
  });
  
  // 如果需要包含圖表，這裡可以添加圖表（簡化處理）
  if (options.includeCharts) {
    // 圖表生成邏輯待實作
  }
  
  // 導出為 Blob
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// CSV 導出
export function exportToCSV(data: DrugSearchResult[], options: { includeCharts: boolean }): Blob {
  // 轉換為 CSV 格式的數據
  const csvData = data.map(item => ({
    條碼: item.barcode,
    藥品名稱: item.name,
    製造廠代碼: item.product_code || '',
    儲位: item.storage_location || '',
    類別: item.category || '',
    出現清單數: item.manifest_count,
    總預期量: item.total_expected,
    總實際量: item.total_actual,
    總差異量: item.total_discrepancy,
    平均差異: item.avg_discrepancy,
    錯誤次數: item.error_count,
  }));
  
  const csv = unparse(csvData);
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
}

// PDF 導出
export function exportToPDF(data: DrugSearchResult[], options: { includeCharts: boolean }): Blob {
  // 這裡應該使用 @react-pdf/renderer 生成 PDF
  // 為了簡化，我們先返回一個簡單的文本說明
  const pdfContent = `
    藥品清點報表
    生成時間: ${new Date().toLocaleString()}
    記錄數量: ${data.length}
    
    詳細數據見附錄
  `;
  
  return new Blob([pdfContent], { type: 'application/pdf' });
}

// 主導出函數
export async function exportData(
  data: DrugSearchResult[], 
  format: 'excel' | 'csv' | 'pdf', 
  options: { includeCharts: boolean }
): Promise<Blob> {
  switch (format) {
    case 'excel':
      return await exportToExcel(data, options);
    case 'csv':
      return exportToCSV(data, options);
    case 'pdf':
      return exportToPDF(data, options);
    default:
      throw new Error(`不支援的導出格式: ${format}`);
  }
}