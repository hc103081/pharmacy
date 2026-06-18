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

    // 2. 品名亂碼偵測 + 風險評級
    let drugNameRisk = false;
    const riskReasons: string[] = [];
    
    if (!item.drug_name || item.drug_name.trim() === '') {
      if (status !== 'error') status = 'warn';
      messages.push('品名缺失');
    } 
    
    if (item.drug_name) {
      // 亂碼偵測（控制字符、問號等）
      if (/[\\?]|[\u0000-\u001F\u007F-\u009F]/.test(item.drug_name)) {
        drugNameRisk = true;
        riskReasons.push('含亂碼或問號');
      }
      
      // 純數字品名（極可能辨識失敗）
      if (/^\d+$/.test(item.drug_name.trim())) {
        drugNameRisk = true;
        riskReasons.push('品名全為數字');
      }
      
      // 品名長度異常：過短（< 2 字）或過長（> 50 字）
      const nameLen = item.drug_name.trim().length;
      if (nameLen < 2) {
        drugNameRisk = true;
        riskReasons.push('品名過短');
      } else if (nameLen > 50) {
        drugNameRisk = true;
        riskReasons.push('品名異常過長');
      }
      
      // 含罕用或非中文字符（英文/數字佔比過高的混合品名需人工確認）
      const nonChineseRatio = (item.drug_name.match(/[^\u4e00-\u9fff\s()（）、／\.\-\+]/g) || []).length / nameLen;
      if (nonChineseRatio > 0.7 && nameLen > 3) {
        drugNameRisk = true;
        riskReasons.push('非中文佔比過高');
      }
      
      if (drugNameRisk) {
        if (status !== 'error') status = 'warn';
        messages.push(...riskReasons);
      }
    }

    // 3. 數量合理性
    if (item.quantity + item.bonus_quantity <= 0) {
      status = 'error';
      messages.push('總數量必須大於 0');
    }

    // 4. 合併後數量合理性（合併後數量過大可能需人工確認）
    if (item.quantity + item.bonus_quantity > 999) {
      if (status !== 'error') status = 'warn';
      messages.push('合併後總數量異常偏大');
    }

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
