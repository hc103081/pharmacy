import { useEffect, useState } from 'react';

/**
 * 行動裝置鍵盤彈出時，更新 isKeyboardOpen 狀態
 * 並將搜尋輸入框自動滾動到可視區域
 */
export function useScanKeyboard() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleResize = () => {
      const inputEl = document.getElementById('search-barcode');
      if (!window.visualViewport) return;
      const viewportHeight = window.visualViewport.height;
      const windowHeight = window.innerHeight;
      // 鍵盤彈出時 viewport 高度會顯著小於 window 高度
      setIsKeyboardOpen(viewportHeight < windowHeight * 0.85);

      if (!inputEl || document.activeElement !== inputEl) return;
      setTimeout(() => {
        inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    };

    window.visualViewport!.addEventListener('resize', handleResize);
    return () => window.visualViewport!.removeEventListener('resize', handleResize);
  }, []);

  return { isKeyboardOpen };
}