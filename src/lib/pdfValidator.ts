import { ParsedPdf, ParsedItem } from './pdfParser';

export type ValidationStatus = 'pass' | 'warn' | 'error';

export interface ItemValidation {
  line_number: number;
  status: ValidationStatus;
  messages: string[];
}

export interface PdfValidationResult {
  overallStatus: ValidationStatus;
  itemValidations: ItemValidation[];
  summary: {
    totalItems: number;
    errorCount: number;
    warnCount: number;
  };
}

/**
 * PDF 提取結果校驗引擎
 */
export function validateParsedPdf(data: ParsedPdf): PdfValidationResult {
  const itemValidations: ItemValidation[] = [];
  const barcodes = new Set<string>();
  let errorCount = 0;
  let warnCount = 0;

  for (const item of data.items) {
    const messages: string[] = [];
    let status: ValidationStatus = 'pass';

    // 1. 條碼格式校驗
    if (!item.barcode || item.barcode.trim() === '') {
      status = 'error';
      messages.push('條碼缺失');
    } 
    
    if (item.barcode && (item.barcode.length < 5 || item.barcode.length > 20)) {
      if (status !== 'error') status = 'warn';
      messages.push('條碼長度異常');
    }

    // 2. 品名亂碼偵測
    if (!item.drug_name || item.drug_name.trim() === '') {
      if (status !== 'error') status = 'warn';
      messages.push('品名缺失');
    } 
    
    if (item.drug_name && /[\\?]|[\u0000-\u001F\u007F-\u009F]/.test(item.drug_name)) {
      if (status !== 'error') status = 'warn';
      messages.push('品名可能含亂碼');
    }

    // 3. 數量合理性
    if (item.quantity + item.bonus_quantity <= 0) {
      status = 'error';
      messages.push('總數量必須大於 0');
    }

    // 4. 重複條碼偵測
    if (item.barcode && barcodes.has(item.barcode)) {
      if (status !== 'error') status = 'warn';
      messages.push('重複條碼');
    }
    if (item.barcode) barcodes.add(item.barcode);

    if (status === 'error') errorCount++;
    else if (status === 'warn') warnCount++;

    itemValidations.push({
      line_number: item.line_number,
      status,
      messages,
    });
  }

  // 整體狀態判斷
  let overallStatus: ValidationStatus = 'pass';
  if (errorCount > 0) overallStatus = 'error';
  else if (warnCount > 0) overallStatus = 'warn';

  return {
    overallStatus,
    itemValidations,
    summary: {
      totalItems: data.items.length,
      errorCount,
      warnCount,
    },
  };
}
