import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { TeachingProvider } from "@/components/teaching/TeachingContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PhamaCount - ?亙??箄皜?蝟餌絞",
  description: "?訾????暺?蝞∠?蝟餌絞嚗?湔?蝣潭????抒?摮???撠?",
};

import { TeachingModal } from '@/components/teaching/TeachingModal';

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
            {children}
            <TeachingModal />
          </TeachingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}