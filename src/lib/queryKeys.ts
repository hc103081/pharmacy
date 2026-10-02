export const queryKeys = {
  drugSearch: (filters: any) => ['drugSearch', filters] as const,
  drugTrend: (barcode: string, productCode?: string) => ['drugTrend', barcode, productCode] as const,
  heatmap: (dateFrom?: string, dateTo?: string) => ['heatmap', dateFrom, dateTo] as const,
  manifestHistory: (filters: any) => ['manifestHistory', filters] as const,
  manifestSummary: () => ['manifestSummary'] as const,
};