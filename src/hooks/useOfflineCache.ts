import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'pharmacount-query-cache';
const STORE_NAME = 'query-results';

export async function cacheQueryResult(key: string, data: unknown) {
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) { db.createObjectStore(STORE_NAME); },
  });
  await db.put(STORE_NAME, { data, timestamp: Date.now() }, key);
}

export async function getCachedQueryResult(key: string, maxAgeMs = 24 * 60 * 60 * 1000) {
  const db = await openDB(DB_NAME, 1);
  const entry = await db.get(STORE_NAME, key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > maxAgeMs) return null;
  return entry.data;
}

// Optional: React hook wrapper
import { useState, useEffect } from 'react';

export function useOfflineCache<T>(key: string, maxAgeMs = 24 * 60 * 60 * 1000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadCache() {
      setLoading(true);
      const cached = await getCachedQueryResult<T>(key, maxAgeMs);
      setData(cached);
      setLoading(false);
    }
    loadCache();
  }, [key, maxAgeMs]);

  return { data, loading };
}