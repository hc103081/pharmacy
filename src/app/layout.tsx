import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "PhamaCount - 藥局智能清點系統",
  description: "智能藥品清點與數位化管理系統",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-TW"
      className="h-full antialiased font-sans"
    >
      <body className="h-dvh flex flex-col overflow-hidden">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}