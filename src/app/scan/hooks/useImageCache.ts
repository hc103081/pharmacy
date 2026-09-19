'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 圖片緩存與載入管理 Hook
 * 
 * 功能：
 * 1. 兩級緩存：Map (記憶體) + localStorage (持久化)
 * 2. 批量預載入首屏圖片
 * 3. 載入狀態管理
 * 4. 並發控制與請求去重
 * 5. 自動過期檢查與重試
 */

interface CachedUrlEntry {
  url: string;
  expiresAt: number;
  key: string;
}

type ImageLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface PendingRequest {
  promise: Promise<string | null>;
  resolve: (value: string | null) => void;
  reject: (reason?: any) => void;
}

const CACHE_KEY = 'imageCache_v1';
const MAX_LOCAL_STORAGE_ENTRIES = 500;
const MAX_CONCURRENT_REQUESTS = 6;
const PRESIGNED_URL_TTL = 3600 * 1000; // 1 小時 (ms)

export function useImageCache(manifestId: string | null) {
  // === 記憶體緩存 ===
  const memoryCache = useRef<Map<string, CachedUrlEntry>>(new Map());
  
  // === 載入狀態 ===
  const [loadStatus, setLoadStatusState] = useState<Map<string, ImageLoadStatus>>(new Map());
  
  // === 請求隊列 (並發控制) ===
  const pendingRequests = useRef<Map<string, PendingRequest>>(new Map());
  const activeRequestCount = useRef(0);
  const requestQueue = useRef<Array<() => void>>([]);
  
  // === 初始化：從 localStorage 恢復緩存 ===
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        const parsed: Record<string, CachedUrlEntry> = JSON.parse(stored);
        const now = Date.now();
        let validCount = 0;
        
        Object.entries(parsed).forEach(([key, entry]) => {
          // 只恢復未過期的條目
          if (entry.expiresAt > now) {
            memoryCache.current.set(key, entry);
            validCount++;
          }
        });
        
        console.log(`[ImageCache] Restored ${validCount} valid entries from localStorage`);
      }
    } catch (err) {
      console.warn('[ImageCache] Failed to restore from localStorage:', err);
      // 損壞的緩存清理
      localStorage.removeItem(CACHE_KEY);
    }
  }, []);
  
  // === 緩存持久化到 localStorage ===
  const persistToLocalStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const entries: Record<string, CachedUrlEntry> = {};
      let count = 0;
      
      // 只持久化未過期的條目，按過期時間排序保留最新的
      const sortedEntries = Array.from(memoryCache.current.entries())
        .filter(([, entry]) => entry.expiresAt > Date.now())
        .sort((a, b) => b[1].expiresAt - a[1].expiresAt)
        .slice(0, MAX_LOCAL_STORAGE_ENTRIES);
      
      sortedEntries.forEach(([key, entry]) => {
        entries[key] = entry;
        count++;
      });
      
      localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
      console.log(`[ImageCache] Persisted ${count} entries to localStorage`);
    } catch (err) {
      console.warn('[ImageCache] Failed to persist to localStorage:', err);
    }
  }, []);
  
  // === 並發控制：處理請求隊列 ===
  const processQueue = useCallback(() => {
    while (activeRequestCount.current < MAX_CONCURRENT_REQUESTS && requestQueue.current.length > 0) {
      const next = requestQueue.current.shift();
      if (next) next();
    }
  }, []);
  
  // === 核心：獲取 presigned URL (含緩存/請求/重試) ===
  const getUrl = useCallback(async (key: string): Promise<string | null> => {
    if (!manifestId || !key) return null;
    
    const now = Date.now();
    
    // 1. 檢查記憶體緩存
    const memEntry = memoryCache.current.get(key);
    if (memEntry && memEntry.expiresAt > now) {
      console.log(`[ImageCache] Memory cache HIT: ${key}`);
      return memEntry.url;
    }
    
    // 2. 檢查是否有進行中的請求 (請求去重)
    const existingPending = pendingRequests.current.get(key);
    if (existingPending) {
      console.log(`[ImageCache] Deduplicated request: ${key}`);
      return existingPending.promise;
    }
    
    // 3. 創建新請求
    let resolveFn: (value: string | null) => void;
    let rejectFn: (reason?: any) => void;
    
    const promise = new Promise<string | null>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
    
    const executeRequest = async () => {
      activeRequestCount.current++;
      
      try {
        // 再次檢查緩存 (可能在等待隊列時被其他請求填充)
        const memEntry2 = memoryCache.current.get(key);
        if (memEntry2 && memEntry2.expiresAt > now) {
          resolveFn!(memEntry2.url);
          return;
        }
        
        console.log(`[ImageCache] Fetching presigned URL: ${key}`);
        setLoadStatusState(prev => {
          const next = new Map(prev);
          next.set(key, 'loading');
          return next;
        });
        
        // 呼叫批量 API (單個 key 也用批量端點)
        const res = await fetch('/api/scan/batch-view-urls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manifestId, keys: [key] }),
        });
        
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        
        const data = await res.json();
        const url = data.urls?.[key] || null;
        
        if (url) {
          const expiresAt = now + PRESIGNED_URL_TTL;
          const entry: CachedUrlEntry = { url, expiresAt, key };
          
          // 寫入記憶體緩存
          memoryCache.current.set(key, entry);
          
          // 更新狀態
          setLoadStatusState(prev => {
            const next = new Map(prev);
            next.set(key, 'loaded');
            return next;
          });
          
          // 持久化 (防抖)
          persistToLocalStorage();
          
          console.log(`[ImageCache] Fetched and cached: ${key}`);
          resolveFn!(url);
        } else {
          throw new Error('No URL returned from API');
        }
      } catch (err) {
        console.error(`[ImageCache] Fetch failed for ${key}:`, err);
        setLoadStatusState(prev => {
          const next = new Map(prev);
          next.set(key, 'error');
          return next;
        });
        resolveFn!(null); // 不拋出錯誤，讓 UI 顯示 error 狀態
      } finally {
        activeRequestCount.current--;
        pendingRequests.current.delete(key);
        processQueue();
      }
    };
    
    // 封裝 Promise 以支持去重
    const pending: PendingRequest = { promise, resolve: resolveFn!, reject: rejectFn! };
    pendingRequests.current.set(key, pending);
    
    // 加入隊列
    if (activeRequestCount.current >= MAX_CONCURRENT_REQUESTS) {
      requestQueue.current.push(executeRequest);
    } else {
      executeRequest();
    }
    
    return promise;
  }, [manifestId, persistToLocalStorage, processQueue]);
  
  // === 批量預載入 (用於首屏) ===
  const preloadUrls = useCallback((keys: string[]) => {
    if (!manifestId || keys.length === 0) return;
    
    const now = Date.now();
    const uncachedKeys = keys.filter(key => {
      const entry = memoryCache.current.get(key);
      return !entry || entry.expiresAt <= now;
    });
    
    if (uncachedKeys.length === 0) {
      console.log('[ImageCache] Preload: all keys cached');
      return;
    }
    
    console.log(`[ImageCache] Preloading ${uncachedKeys.length} URLs`);
    
    // 批量請求
    fetch('/api/scan/batch-view-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifestId, keys: uncachedKeys }),
    })
      .then(res => res.json())
      .then(data => {
        const urls = data.urls || {};
        let cachedCount = 0;
        
        Object.entries(urls).forEach(([key, url]) => {
          if (url) {
            const expiresAt = now + PRESIGNED_URL_TTL;
            const entry: CachedUrlEntry = { url: url as string, expiresAt, key };
            memoryCache.current.set(key, entry);
            setLoadStatusState(prev => {
              const next = new Map(prev);
              next.set(key, 'loaded');
              return next;
            });
            cachedCount++;
          }
        });
        
        if (cachedCount > 0) {
          persistToLocalStorage();
        }
        
        console.log(`[ImageCache] Preloaded ${cachedCount}/${uncachedKeys.length} URLs`);
      })
      .catch(err => {
        console.error('[ImageCache] Preload failed:', err);
      });
  }, [manifestId, persistToLocalStorage]);
  
  // === 獲取載入狀態 ===
  const getLoadStatus = useCallback((key: string): ImageLoadStatus => {
    return loadStatus.get(key) || 'idle';
  }, [loadStatus]);
  
  // === 手動設置載入狀態 (供 DrugCard 調用) ===
  const setLoadStatus = useCallback((key: string, status: ImageLoadStatus) => {
    setLoadStatusState(prev => {
      const next = new Map(prev);
      next.set(key, status);
      return next;
    });
  }, []);
  
  // === 緩存統計 (調試用) ===
  const getCacheStats = useCallback(() => {
    let lsCount = 0;
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        lsCount = Object.keys(JSON.parse(stored)).length;
      }
    } catch {}
    
    return {
      memory: memoryCache.current.size,
      localStorage: lsCount,
      hitRate: 0, // 需要額外追蹤統計
    };
  }, []);
  
  // === 清理過期緩存 (定期) ===
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      
      memoryCache.current.forEach((entry, key) => {
        if (entry.expiresAt <= now) {
          memoryCache.current.delete(key);
          cleaned++;
        }
      });
      
      if (cleaned > 0) {
        console.log(`[ImageCache] Cleaned ${cleaned} expired entries`);
        persistToLocalStorage();
      }
    }, 5 * 60 * 1000); // 每 5 分鐘
    
    return () => clearInterval(interval);
  }, [persistToLocalStorage]);
  
  return {
    getUrl,
    preloadUrls,
    getLoadStatus,
    setLoadStatus,
    getCacheStats,
  };
}

// === 導出類型供其他組件使用 ===
export type { ImageLoadStatus, CachedUrlEntry };