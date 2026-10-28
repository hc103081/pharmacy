'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface NavigationProgressContextType {
  isNavigating: boolean;
  message: string;
  startNavigation: (message?: string) => void;
  stopNavigation: () => void;
}

const NavigationProgressContext = createContext<NavigationProgressContextType>({
  isNavigating: false,
  message: '頁面跳轉中...',
  startNavigation: () => {},
  stopNavigation: () => {},
});

export function useNavigationProgress() {
  return useContext(NavigationProgressContext);
}

export function NavigationProgressProvider({ children }: { children: React.ReactNode }) {
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('頁面載入中...');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const safetyTimerRef = useRef<NodeJS.Timeout | null>(null);

  const stopNavigation = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    // 衝至 100% 後淡出
    setProgress(100);
    const timeout = setTimeout(() => {
      setIsNavigating(false);
      setProgress(0);
      setMessage('頁面載入中...');
    }, 200);

    return () => clearTimeout(timeout);
  }, []);

  const startNavigation = useCallback((msg = '頁面載入中...') => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);

    setMessage(msg);
    setIsNavigating(true);
    setProgress(15);

    // 模擬動態平滑前進到 85% 等待
    progressTimerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) {
          if (progressTimerRef.current) clearInterval(progressTimerRef.current);
          return 85;
        }
        const diff = Math.max(1, (85 - prev) * 0.15);
        return Math.min(85, prev + diff);
      });
    }, 100);

    // 8 秒防呆超時重置，避免網路斷線等極端情況卡住
    safetyTimerRef.current = setTimeout(() => {
      stopNavigation();
    }, 8000);
  }, [stopNavigation]);

  // 路由改變時關閉跳轉指示
  useEffect(() => {
    stopNavigation();
  }, [pathname, searchParams, stopNavigation]);

  // 攔截所有內部 <a> 標籤點擊
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      // 忽視非主鍵點擊或輔助鍵（Ctrl / Cmd / Shift 開新分頁）
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      const targetAttr = target.getAttribute('target');

      // 忽視外部連結、在新分頁開啟、錨點、下載或 mailto/tel
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || targetAttr === '_blank') {
        return;
      }

      // 檢查是否同源且為不同路徑
      try {
        const url = new URL(href, window.location.href);
        const currentUrl = new URL(window.location.href);

        // 不同主機名則忽略
        if (url.origin !== currentUrl.origin) return;

        // 如果完全相同路徑與查詢參數則忽略
        if (url.pathname === currentUrl.pathname && url.search === currentUrl.search && !url.hash) {
          return;
        }

        // 觸發跳轉指示
        startNavigation('頁面跳轉中...');
      } catch {
        // 非合法 URL 則忽略
      }
    };

    document.addEventListener('click', handleAnchorClick, { capture: true });
    return () => {
      document.removeEventListener('click', handleAnchorClick, { capture: true });
    };
  }, [startNavigation]);

  // 清除計時器
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    };
  }, []);

  return (
    <NavigationProgressContext.Provider value={{ isNavigating, message, startNavigation, stopNavigation }}>
      {children}
      {/* 頂部極光藍發光進度條 */}
      <div
        className={`fixed top-0 left-0 right-0 z-[100] pointer-events-none transition-opacity duration-300 ${
          isNavigating ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          className="h-1 bg-gradient-to-r from-blue-500 via-[#00f2fe] to-cyan-300 shadow-[0_0_12px_rgba(0,242,254,0.9),0_0_4px_rgba(0,242,254,0.6)] transition-all duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 頂部微浮動科技感跳轉提示膠囊 (Mobile & Desktop) */}
      {isNavigating && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0a1936]/95 border border-[#00f2fe]/50 shadow-[0_4px_20px_rgba(0,242,254,0.35)] backdrop-blur-md">
            <Loader2 className="w-3.5 h-3.5 text-[#00f2fe] animate-spin shrink-0" />
            <span className="text-xs font-semibold text-[#00f2fe] tracking-wide whitespace-nowrap">
              {message}
            </span>
          </div>
        </div>
      )}
    </NavigationProgressContext.Provider>
  );
}
