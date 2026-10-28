'use client';

import React, { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/components/AuthProvider';
import { TeachingProvider } from '@/components/teaching/TeachingContext';
import { TeachingModal } from '@/components/teaching/TeachingModal';
import { NavigationProgressProvider } from '@/components/navigation/NavigationProgress';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TeachingProvider>
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={null}>
            <NavigationProgressProvider>
              {children}
            </NavigationProgressProvider>
          </Suspense>
          <TeachingModal />
        </QueryClientProvider>
      </TeachingProvider>
    </AuthProvider>
  );
}
