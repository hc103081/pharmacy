'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useOfflineAuditCache } from './useOfflineAuditCache';
import type {
  DrugAuditRecord,
  AuditMonthGroup,
  AuditNode,
  DrugSearchResult,
} from '@/types/query';

interface RPCResult {
  barcode: string;
  product_code: string | null;
  name: string;
  storage_location: string | null;
  category: string | null;
  manifest_count: number;
  total_expected: number;
  total_actual: number;
  total_discrepancy: number;
  avg_discrepancy: number;
  error_count: number;
  last_counted_at: string | null;
  history: Array<{
    manifestId: string;
    manifestName: string;
    expected: number;
    actual: number;
    discrepancy: number;
    status: string;
    countedAt: string;
    pageNumber?: number;
    itemOrder?: number;
    counterName?: string;
    photoUrl?: string | null;
  }>;
}

interface ItemDetail {
  id: string;
  page_number: number;
  item_order: number;
  photo_url: string | null;
}

/**
 * Transforms raw RPC result history into F4-A monthly aggregated groups
 */
export function transformToAuditRecord(
  raw: RPCResult,
  detailMap?: Map<string, ItemDetail>
): DrugAuditRecord {
  const historyNodes: AuditNode[] = (raw.history || []).map((h, idx) => {
    const expected = Number(h.expected) || 0;
    const actual = Number(h.actual) || 0;
    const discrepancy = actual - expected;
    const status: 'pending' | 'completed' | 'error' =
      h.status === 'completed' || h.status === 'error' || h.status === 'pending'
        ? h.status
        : discrepancy === 0
        ? 'completed'
        : 'error';

    const detailKey = `${h.manifestId}_${raw.barcode}`;
    const detail = detailMap?.get(detailKey);

    return {
      manifestId: h.manifestId || `unknown-${idx}`,
      manifestName: h.manifestName || '未具名清單',
      drugItemId: detail?.id,
      pageNumber: detail?.page_number ?? (Number(h.pageNumber) || 1),
      itemOrder: detail?.item_order ?? (Number(h.itemOrder) || idx + 1),
      expectedQuantity: expected,
      actualQuantity: actual,
      discrepancy,
      status,
      countedAt: h.countedAt || new Date().toISOString(),
      counterName: h.counterName || '盤點人員',
      photoUrl: detail?.photo_url ?? h.photoUrl ?? null,
    };
  });

  // Sort all nodes descending by date
  historyNodes.sort(
    (a, b) => new Date(b.countedAt).getTime() - new Date(a.countedAt).getTime()
  );

  // Group by YYYY-MM
  const monthMap = new Map<string, AuditNode[]>();
  historyNodes.forEach((node) => {
    const key = node.countedAt.slice(0, 7); // e.g. "2026-10"
    const list = monthMap.get(key) || [];
    list.push(node);
    monthMap.set(key, list);
  });

  const monthlyGroups: AuditMonthGroup[] = [];
  monthMap.forEach((nodes, monthKey) => {
    const [year, month] = monthKey.split('-');
    const totalAudits = nodes.length;
    const matchCount = nodes.filter((n) => n.discrepancy === 0).length;
    const matchRate = totalAudits > 0 ? Math.round((matchCount / totalAudits) * 100) : 100;
    const netDiscrepancy = nodes.reduce((acc, curr) => acc + curr.discrepancy, 0);

    monthlyGroups.push({
      monthKey,
      monthLabel: `${year} 年 ${month} 月`,
      totalAudits,
      matchRate,
      netDiscrepancy,
      nodes,
    });
  });

  // Sort monthly groups descending
  monthlyGroups.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const totalExpected = Number(raw.total_expected) || 0;
  const totalActual = Number(raw.total_actual) || 0;
  const totalDiscrepancy = totalActual - totalExpected;

  return {
    barcode: raw.barcode,
    productCode: raw.product_code,
    name: raw.name,
    storageLocation: raw.storage_location,
    category: raw.category,
    currentExpected: totalExpected,
    currentActual: totalActual,
    currentDiscrepancy: totalDiscrepancy,
    errorCount: Number(raw.error_count) || 0,
    lastCountedAt: raw.last_counted_at,
    monthlyGroups,
    allHistory: historyNodes,
  };
}

export function useAuditSearch() {
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<DrugAuditRecord[]>([]);
  const [selectedBarcode, setSelectedBarcode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const { isOffline, saveAuditRecord, searchOfflineRecords } = useOfflineAuditCache();
  const searchSeqRef = useRef(0);

  const executeSearch = useCallback(
    async (searchTerm: string) => {
      const trimmed = searchTerm.trim();
      const currentSeq = ++searchSeqRef.current;

      if (!trimmed) {
        setRecords([]);
        setSelectedBarcode(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      // If offline, directly search IndexedDB
      if (isOffline) {
        setIsFromCache(true);
        const cached = await searchOfflineRecords(trimmed);
        if (currentSeq !== searchSeqRef.current) return;
        setRecords(cached);
        if (cached.length === 1) {
          setSelectedBarcode(cached[0].barcode);
        } else {
          setSelectedBarcode(null);
        }
        setIsLoading(false);
        return;
      }

      try {
        const isBarcode = /^\d{8,14}$/.test(trimmed);
        const { data, error: rpcError } = await supabase.rpc(
          'search_drugs_cross_manifest',
          {
            p_search_text: isBarcode ? null : trimmed || null,
            p_barcode: isBarcode ? trimmed : null,
            p_limit: 50,
            p_page: 1,
            p_manifest_status: 'all',
            p_counted_status: 'all',
            p_has_discrepancy: false,
          }
        );

        if (currentSeq !== searchSeqRef.current) return;

        if (rpcError) {
          throw new Error(rpcError.message);
        }

        const rawList = (data as RPCResult[]) || [];

        // 收集所有條碼，向 drug_items 補充精確的頁碼、序號、照片 Key 與品項 ID
        const barcodes = Array.from(new Set(rawList.map((r) => r.barcode).filter(Boolean)));
        const itemDetailMap = new Map<string, ItemDetail>();

        if (barcodes.length > 0) {
          const { data: itemRows } = await supabase
            .from('drug_items')
            .select('id, barcode, manifest_id, page_number, item_order, photo_url')
            .in('barcode', barcodes);

          if (currentSeq !== searchSeqRef.current) return;

          if (itemRows) {
            itemRows.forEach((row) => {
              itemDetailMap.set(`${row.manifest_id}_${row.barcode}`, {
                id: row.id,
                page_number: row.page_number,
                item_order: row.item_order,
                photo_url: row.photo_url,
              });
            });
          }
        }

        const transformed = rawList.map((raw) => transformToAuditRecord(raw, itemDetailMap));

        setRecords(transformed);
        setIsFromCache(false);

        // Auto-select first item if only 1 match or barcode scan
        if (transformed.length === 1 || (isBarcode && transformed.length > 0)) {
          setSelectedBarcode(transformed[0].barcode);
        } else {
          setSelectedBarcode(null);
        }

        // Cache results in IndexedDB for offline capability
        transformed.forEach((rec) => {
          saveAuditRecord(rec);
        });
      } catch (err: unknown) {
        if (currentSeq !== searchSeqRef.current) return;
        console.warn('Online RPC search failed, falling back to cache:', err);
        // Fallback to offline cache
        setIsFromCache(true);
        const cached = await searchOfflineRecords(trimmed);
        if (currentSeq !== searchSeqRef.current) return;
        setRecords(cached);
        if (cached.length === 1) {
          setSelectedBarcode(cached[0].barcode);
        } else {
          setSelectedBarcode(null);
          if (cached.length === 0) {
            setError(err instanceof Error ? err.message : '查詢發生未預期錯誤');
          }
        }
      } finally {
        if (currentSeq === searchSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [isOffline, supabase, searchOfflineRecords, saveAuditRecord]
  );

  const selectedRecord = useMemo(() => {
    if (!selectedBarcode) return null;
    return records.find((r) => r.barcode === selectedBarcode) || null;
  }, [records, selectedBarcode]);

  return {
    query,
    setQuery,
    records,
    selectedRecord,
    selectedBarcode,
    setSelectedBarcode,
    isLoading,
    error,
    isOffline,
    isFromCache,
    executeSearch,
  };
}
