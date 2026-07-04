import { useCallback } from 'react';
import type { DrugItem } from '@/types';

export function useBarcodeMatch(drugs: DrugItem[], barcodeInput: string) {
  const getMatchScore = useCallback((drug: DrugItem, input: string) => {
    if (!input) return 0;
    // 完全匹配 barcode 或 product_code
    if (drug.barcode === input || (drug as any).product_code === input) return 3;
    // 包含匹配
    if (drug.barcode.includes(input) || ((drug as any).product_code && (drug as any).product_code.includes(input))) return 2;
    // 品名模糊匹配
    if (drug.name.toLowerCase().includes(input.toLowerCase())) return 1;
    return 0;
  }, []);

  // Fix: Return null when barcodeInput is empty to prevent incorrect matching
  if (!barcodeInput) {
    return { matchingItem: null, getMatchScore };
  }

  const matchingItem = drugs.reduce((best, current) => {
    const score = getMatchScore(current, barcodeInput);
    if (score > (best ? getMatchScore(best, barcodeInput) : -1)) {
      return current;
    }
    return best;
  }, null as DrugItem | null);

  return { matchingItem, getMatchScore };
}