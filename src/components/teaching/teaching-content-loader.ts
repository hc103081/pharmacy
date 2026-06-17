import systemOverview from './system-overview.json';
import barcodeScan from './barcode-scan.json';
import importFunction from './import-function.json';
import photoCapture from './photo-capture.json';
import anomalyHandling from './anomaly-handling.json';
import reportExport from './report-export.json';
import manifestManagement from './manifest-management.json';
import pdfPreview from './pdf-preview.json';

interface TeachingStep {
  title: string;
  description: string;
  example?: string;
}

// Note: Since we had issues with the teaching-content directory,
// we're importing the JSON files directly from the teaching folder
// and using a mapping to determine which content to load

const teachingContentMap: Record<string, TeachingStep[]> = {
  'system-overview': systemOverview,
  'barcode-scan': barcodeScan,
  'import-function': importFunction,
  'photo-capture': photoCapture,
  'anomaly-handling': anomalyHandling,
  'report-export': reportExport,
  'manifest-management': manifestManagement,
  'pdf-preview': pdfPreview,
};

export const getTeachingContent = (module: string, step: number) => {
  const contentArray = teachingContentMap[module] || [];
  const content = contentArray[step] || {
    title: `步驟 ${step + 1}`,
    description: `此教學內容尚未準備完成。`,
    example: ''
  };
  return content;
};

export const getTeachingTotalSteps = (module: string) => {
  const contentArray = teachingContentMap[module] || [];
  return contentArray.length;
};

export const getTeachingTitle = (module: string) => {
  const titles: Record<string, string> = {
    'system-overview': '系統概覽',
    'barcode-scan': '條碼掃描功能',
    'import-function': '匯入功能',
    'photo-capture': '拍照留存功能',
    'anomaly-handling': '異常處理',
    'report-export': '報告匯出',
    'manifest-management': '清單管理',
    'pdf-preview': 'PDF 預覽校驗',
  };
  const title = titles[module] || '';
  return title;
};