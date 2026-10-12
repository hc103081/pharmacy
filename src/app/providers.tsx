'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/components/AuthProvider';
import { TeachingProvider } from '@/components/teaching/TeachingContext';
import { TeachingModal } from '@/components/teaching/TeachingModal';

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
          {children}
          <TeachingModal />
        </QueryClientProvider>
      </TeachingProvider>
    </AuthProvider>
  );
}