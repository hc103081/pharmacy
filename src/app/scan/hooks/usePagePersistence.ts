import { useState, useRef, useCallback } from 'react';

export function usePagePersistence(manifestId: string | null) {
  const initializedRef = useRef(false);
  const [lastVisitedPage, setLastVisitedPage] = useState<number | null>(null);
  const lastVisitedPageRef = useRef<number | null>(null);
  const [lastScrollY, setLastScrollY] = useState<number | null>(null);
  const lastScrollYRef = useRef<number | null>(null);

  const saveState = useCallback(
    (page: number) => {
      if (!manifestId) return;
      localStorage.setItem(
        `scan_state_${manifestId}`,
        JSON.stringify({
          page,
          scrollY: window.scrollY,
        })
      );
    },
    [manifestId]
  );

  const restorePage = useCallback((): number | null => {
    if (!manifestId) return null;
    const savedState = localStorage.getItem(`scan_state_${manifestId}`);
    if (savedState) {
      try {
        const { page } = JSON.parse(savedState);
        return page;
      } catch {
        return null;
      }
    }
    return null;
  }, [manifestId]);

  return {
    initializedRef,
    lastVisitedPage,
    setLastVisitedPage,
    lastVisitedPageRef,
    lastScrollY,
    setLastScrollY,
    lastScrollYRef,
    saveState,
    restorePage,
  };
}