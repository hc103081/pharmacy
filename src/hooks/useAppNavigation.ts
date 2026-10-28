'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import { useNavigationProgress } from '@/components/navigation/NavigationProgress';

export function useAppNavigation() {
  const router = useRouter();
  const { startNavigation, stopNavigation } = useNavigationProgress();
  const [, startTransition] = useTransition();

  const push = useCallback(
    (href: string, message = '跳轉載入中...') => {
      startNavigation(message);
      startTransition(() => {
        router.push(href);
      });
    },
    [router, startNavigation]
  );

  const replace = useCallback(
    (href: string, message = '跳轉載入中...') => {
      startNavigation(message);
      startTransition(() => {
        router.replace(href);
      });
    },
    [router, startNavigation]
  );

  const back = useCallback(
    (message = '返回中...') => {
      startNavigation(message);
      startTransition(() => {
        router.back();
      });
    },
    [router, startNavigation]
  );

  return {
    ...router,
    push,
    replace,
    back,
    startNavigation,
    stopNavigation,
  };
}
