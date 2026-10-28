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

  const stableId =
    raw.barcode && raw.barcode.trim() !== ''
      ? raw.barcode.trim()
      : raw.product_code && raw.product_code.trim() !== ''
      ? `pc_${raw.product_code.trim()}`
      : `item_${raw.name}_${raw.storage_location || 'default'}`;

  return {
    id: stableId,
    barcode: raw.barcode || '',
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

/**
 * 智慧合併同品項但條碼/代碼欄位存放分散的跨期審計紀錄（防止多筆分裂）
 */
export function consolidateAuditRecords(records: DrugAuditRecord[]): DrugAuditRecord[] {
  if (records.length <= 1) return records;

  const mergedList: DrugAuditRecord[] = [];

  records.forEach((incoming) => {
    const normName = incoming.name.replace(/\s+/g, '');
    const incomingCode = (incoming.productCode || incoming.barcode || '').trim();

    // 尋找是否已有相符的品項
    const existingIdx = mergedList.findIndex((item) => {
      const existingNormName = item.name.replace(/\s+/g, '');
      const nameMatches = existingNormName === normName;
      if (!nameMatches) return false;

      // 儲位相同
      const locMatches = (item.storageLocation || '') === (incoming.storageLocation || '');
      if (!locMatches) return false;

      // 代碼交叉吻合：若兩者皆有 code，比對 code；若其中一個無 code，視為同一藥品合併
      const itemCode = (item.productCode || item.barcode || '').trim();
      if (itemCode && incomingCode) {
        return (
          itemCode === incomingCode ||
          item.productCode === incoming.barcode ||
          item.barcode === incoming.productCode
        );
      }
      return true;
    });

    if (existingIdx === -1) {
      mergedList.push({ ...incoming });
    } else {
      const existing = mergedList[existingIdx];

      // 1. 合併全量歷程並去重（依 manifestId + pageNumber + itemOrder）
      const historyKeySet = new Set(
        existing.allHistory.map((h) => `${h.manifestId}_${h.pageNumber}_${h.itemOrder}`)
      );
      const combinedHistory = [...existing.allHistory];

      incoming.allHistory.forEach((node) => {
        const key = `${node.manifestId}_${node.pageNumber}_${node.itemOrder}`;
        if (!historyKeySet.has(key)) {
          historyKeySet.add(key);
          combinedHistory.push(node);
        }
      });

      // 降序排序
      combinedHistory.sort(
        (a, b) => new Date(b.countedAt).getTime() - new Date(a.countedAt).getTime()
      );

      // 2. 重新聚合成月份分組
      const monthMap = new Map<string, AuditNode[]>();
      combinedHistory.forEach((node) => {
        const key = node.countedAt.slice(0, 7);
        const list = monthMap.get(key) || [];
        list.push(node);
        monthMap.set(key, list);
      });

      const updatedMonthlyGroups: AuditMonthGroup[] = [];
      monthMap.forEach((nodes, monthKey) => {
        const [year, month] = monthKey.split('-');
        const totalAudits = nodes.length;
        const matchCount = nodes.filter((n) => n.discrepancy === 0).length;
        const matchRate = totalAudits > 0 ? Math.round((matchCount / totalAudits) * 100) : 100;
        const netDiscrepancy = nodes.reduce((acc, curr) => acc + curr.discrepancy, 0);

        updatedMonthlyGroups.push({
          monthKey,
          monthLabel: `${year} 年 ${month} 月`,
          totalAudits,
          matchRate,
          netDiscrepancy,
          nodes,
        });
      });
      updatedMonthlyGroups.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

      // 3. 累積數量與數值
      const mergedExpected = existing.currentExpected + incoming.currentExpected;
      const mergedActual = existing.currentActual + incoming.currentActual;
      const mergedDiscrepancy = mergedActual - mergedExpected;
      const mergedErrorCount = existing.errorCount + incoming.errorCount;

      // 4. 更新現有紀錄
      mergedList[existingIdx] = {
        ...existing,
        barcode: existing.barcode || incoming.barcode || '',
        productCode: existing.productCode || incoming.productCode || null,
        storageLocation: existing.storageLocation || incoming.storageLocation || null,
        category: existing.category || incoming.category || null,
        currentExpected: mergedExpected,
        currentActual: mergedActual,
        currentDiscrepancy: mergedDiscrepancy,
        errorCount: mergedErrorCount,
        lastCountedAt:
          new Date(incoming.lastCountedAt || 0) > new Date(existing.lastCountedAt || 0)
            ? incoming.lastCountedAt
            : existing.lastCountedAt,
        allHistory: combinedHistory,
        monthlyGroups: updatedMonthlyGroups,
      };
    }
  });

  return mergedList;
}

export function useAuditSearch() {
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<DrugAuditRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const { isOffline, saveAuditRecord, searchOfflineRecords } = useOfflineAuditCache();
  const searchSeqRef = useRef(0);

  const setSelectedBarcode = useCallback((idOrBarcode: string | null) => {
    setSelectedRecordId(idOrBarcode);
  }, []);

  const executeSearch = useCallback(
    async (searchTerm: string) => {
      const trimmed = searchTerm.trim();
      const currentSeq = ++searchSeqRef.current;

      if (!trimmed) {
        setRecords([]);
        setSelectedRecordId(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

        // 離線 IndexedDB 快取直接搜尋
      if (isOffline) {
        setIsFromCache(true);
        const cached = await searchOfflineRecords(trimmed);
        if (currentSeq !== searchSeqRef.current) return;
        const consolidatedCached = consolidateAuditRecords(cached);
        setRecords(consolidatedCached);
        if (consolidatedCached.length === 1) {
          setSelectedRecordId(consolidatedCached[0].id || consolidatedCached[0].barcode);
        } else {
          setSelectedRecordId(null);
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
        const consolidated = consolidateAuditRecords(transformed);

        setRecords(consolidated);
        setIsFromCache(false);

        // Auto-select first item if only 1 match or barcode scan
        if (consolidated.length === 1 || (isBarcode && consolidated.length > 0)) {
          setSelectedRecordId(consolidated[0].id || consolidated[0].barcode);
        } else {
          setSelectedRecordId(null);
        }

        // Cache results in IndexedDB for offline capability
        consolidated.forEach((rec) => {
          saveAuditRecord(rec);
        });
      } catch (err: unknown) {
        if (currentSeq !== searchSeqRef.current) return;
        console.warn('Online RPC search failed, falling back to cache:', err);
        // Fallback to offline cache
        setIsFromCache(true);
        const cached = await searchOfflineRecords(trimmed);
        if (currentSeq !== searchSeqRef.current) return;
        const consolidatedCached = consolidateAuditRecords(cached);
        setRecords(consolidatedCached);
        if (consolidatedCached.length === 1) {
          setSelectedRecordId(consolidatedCached[0].id || consolidatedCached[0].barcode);
        } else {
          setSelectedRecordId(null);
          if (consolidatedCached.length === 0) {
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
    if (!selectedRecordId) return null;
    return (
      records.find(
        (r) =>
          r.id === selectedRecordId ||
          (r.barcode && r.barcode === selectedRecordId) ||
          (r.productCode && r.productCode === selectedRecordId)
      ) || null
    );
  }, [records, selectedRecordId]);

  return {
    query,
    setQuery,
    records,
    selectedRecord,
    selectedBarcode: selectedRecordId,
    setSelectedBarcode,
    isLoading,
    error,
    isOffline,
    isFromCache,
    executeSearch,
  };
}
