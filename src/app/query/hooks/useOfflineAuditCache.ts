'use client';

import { useState, useEffect, useCallback } from 'react';
import { openDB, IDBPDatabase } from 'idb';
import type { DrugAuditRecord } from '@/types/query';

const DB_NAME = 'phama-audit-offline-db';
const STORE_NAME = 'audit-records';
const DB_VERSION = 1;
const MAX_CACHED_ITEMS = 50;

interface CachedAuditEntry {
  barcode: string;
  name: string;
  storageLocation: string | null;
  data: DrugAuditRecord;
  updatedAt: number;
}

let dbInstance: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only available in browser'));
  }
  if (!dbInstance) {
    dbInstance = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'barcode' });
          store.createIndex('updatedAt', 'updatedAt');
          store.createIndex('name', 'name');
        }
      },
    });
  }
  return dbInstance;
}

export function useOfflineAuditCache() {
  const [isOffline, setIsOffline] = useState(false);
  const [cachedCount, setCachedCount] = useState(0);

  // Monitor network status
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateStatus = () => setIsOffline(!navigator.onLine);
    updateStatus();

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  // Update cached count
  const refreshCachedCount = useCallback(async () => {
    try {
      const db = await getDB();
      const count = await db.count(STORE_NAME);
      setCachedCount(count);
    } catch {
      // Ignore in SSR
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDB()
      .then((db) => db.count(STORE_NAME))
      .then((count) => {
        if (!cancelled) {
          setCachedCount(count);
        }
      })
      .catch(() => {
        // Ignore in SSR
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Save a drug audit record into IndexedDB with FIFO 50-limit
   */
  const saveAuditRecord = useCallback(async (record: DrugAuditRecord) => {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const entry: CachedAuditEntry = {
        barcode: record.barcode,
        name: record.name,
        storageLocation: record.storageLocation,
        data: record,
        updatedAt: Date.now(),
      };

      await store.put(entry);

      // Enforce MAX_CACHED_ITEMS (FIFO eviction)
      const count = await store.count();
      if (count > MAX_CACHED_ITEMS) {
        const index = store.index('updatedAt');
        let cursor = await index.openCursor();
        let toDelete = count - MAX_CACHED_ITEMS;
        while (cursor && toDelete > 0) {
          await cursor.delete();
          toDelete--;
          cursor = await cursor.continue();
        }
      }

      await tx.done;
      refreshCachedCount();
    } catch (err) {
      console.warn('Failed to cache audit record into IndexedDB:', err);
    }
  }, [refreshCachedCount]);

  /**
   * Get single cached record by barcode
   */
  const getAuditRecord = useCallback(async (barcode: string): Promise<DrugAuditRecord | null> => {
    try {
      const db = await getDB();
      const entry = (await db.get(STORE_NAME, barcode)) as CachedAuditEntry | undefined;
      return entry ? entry.data : null;
    } catch (err) {
      console.warn('Failed to read from IndexedDB:', err);
      return null;
    }
  }, []);

  /**
   * Search across all cached records by barcode, name or storage location
   */
  const searchOfflineRecords = useCallback(async (query: string): Promise<DrugAuditRecord[]> => {
    try {
      const db = await getDB();
      const allEntries = (await db.getAll(STORE_NAME)) as CachedAuditEntry[];
      const q = query.trim().toLowerCase();
      if (!q) {
        return allEntries
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((e) => e.data);
      }

      return allEntries
        .filter((e) =>
          e.barcode.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q) ||
          (e.storageLocation && e.storageLocation.toLowerCase().includes(q))
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((e) => e.data);
    } catch (err) {
      console.warn('Failed to search offline records in IndexedDB:', err);
      return [];
    }
  }, []);

  return {
    isOffline,
    cachedCount,
    saveAuditRecord,
    getAuditRecord,
    searchOfflineRecords,
    refreshCachedCount,
  };
}
