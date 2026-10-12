'use client';

import { useState, useEffect } from 'react';
import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'pharmacount-query-cache';
const STORE_NAME = 'query-results';
const CACHE_VERSION = 1;

// Default cache expiration times (in milliseconds)
const DEFAULT_EXPIRY_TIMES: Record<string, number> = {
  "drug-search": 24 * 60 * 60 * 1000, // 24 hours
  "drug-trend": 7 * 24 * 60 * 60 * 1000, // 7 days
  heatmap: 24 * 60 * 60 * 1000, // 24 hours
  "manifest-history": 24 * 60 * 60 * 1000, // 24 hours
  "manifest-summary": 60 * 60 * 1000, // 1 hour
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export function useOfflineCache() {
  const [isCached, setIsCached] = useState(false);
  const [dbPromise, setDbPromise] = useState<Promise<IDBPDatabase> | null>(null);

  // Initialize IndexedDB
  useEffect(() => {
    const initDB = async () => {
      const db = await openDB(DB_NAME, CACHE_VERSION, {
        upgrade(db) {
          // Create object store if it doesn't exist
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        },
      });
      setDbPromise(Promise.resolve(db));
    };

    initDB();
  }, []);

  // Get cached data
  const getCachedData = async <T>(key: string): Promise<T | null> => {
    if (!dbPromise) return null;
    
    try {
      const db = await dbPromise;
      const entry = await db.get<CacheEntry<T>>(STORE_NAME, key);
      
      if (!entry) return null;
      
      // Check if expired
      if (Date.now() > entry.expiresAt) {
        // Delete expired entry
        await db.delete(STORE_NAME, key);
        return null;
      }
      
      return entry.data;
    } catch (error) {
      console.error('Error reading from cache:', error);
      return null;
    }
  };

  // Set cached data
  const setCachedData = async <T>(key: string, data: string, cacheType: keyof typeof DEFAULT_EXPIRY_TIMES = 'drug-search'): Promise<void> => {
    if (!dbPromise) return;
    
    try {
      const db = await dbPromise;
      const expiresAt = Date.now() + (DEFAULT_EXPIRY_TIMES[cacheType] ?? DEFAULT_EXPIRY_TIMES['drug-search']);
      
      await db.put(STORE_NAME, {
        key,
        data: JSON.stringify({ data }),
        timestamp: Date.now(),
        expiresAt
      });
      
      setIsCached(true);
    } catch (error) {
      console.error('Error writing to cache:', error);
    }
  };

  // Clear cache
  const clearCache = async (): Promise<void> => {
    if (!dbPromise) return;
    
    try {
      const db = await dbPromise;
      await db.clear(STORE_NAME);
      setIsCached(false);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  };

  // Refresh specific cache entry
  const refreshCache = async (key: string): Promise<void> => {
    await clearCache(); // For simplicity, clear all - in production you might want to be more selective
  };

  // Check if we have any cached data
  const checkCacheStatus = async (): Promise<boolean> => {
    if (!dbPromise) return false;
    
    try {
      const db = await dbPromise;
      const count = await db.count(STORE_NAME);
      return count > 0;
    } catch (error) {
      console.error('Error checking cache status:', error);
      return false;
    }
  };

  // Initialize cache status check
  useEffect(() => {
    checkCacheStatus().then(setIsCached);
  }, [dbPromise]);

  return {
    isCached,
    getCachedData,
    setCachedData,
    clearCache,
    refreshCache,
    checkCacheStatus
  };
}