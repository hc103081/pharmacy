import type { NextConfig } from "next";

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'supabase-api',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24,
        },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  // 允許內網 IP 訪問開發資源 (HMR、webpack 等)
  allowedDevOrigins: ['192.168.1.111'],
  // 強制使用 Webpack (Next.js 16+ 預設 Turbopack)
  turbopack: {},
};

export default withPWA(nextConfig);