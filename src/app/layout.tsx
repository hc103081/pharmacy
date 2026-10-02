import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { TeachingProvider } from "@/components/teaching/TeachingContext";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Create a client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const metadata: Metadata = {
  title: "PhamaCount - 藥局智能清點系統",
  description: "智能藥品清點與數位化管理系統",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-dvh flex flex-col overflow-hidden">
        <AuthProvider>
          <TeachingProvider>
            <QueryClientProvider client={queryClient}>
              {children}
              <TeachingModal />
            </QueryClientProvider>
          </TeachingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}