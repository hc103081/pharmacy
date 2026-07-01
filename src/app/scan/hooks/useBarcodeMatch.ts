import { useCallback } from 'react';
import type { DrugItem } from '@/types';

export function useBarcodeMatch(drugs: DrugItem[], barcodeInput: string) {
  const getMatchScore = useCallback((drug: DrugItem, input: string) => {
    if (!input) return 0;
    if (drug.barcode === input) return 3;
    if (drug.barcode.includes(input)) return 2;
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