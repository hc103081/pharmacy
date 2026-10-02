import type { NextConfig } from "next";
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/rpc\/search_drugs_cross_manifest/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'drug-search-cache',
        expiration: { maxEntries: 200, maxAgeSeconds: 24 * 60 * 60 },
        plugins: [
          {
            cacheWillUpdate: async ({ response }) => {
              if (response.status === 200) return response;
              return null;
            },
          },
        ],
      },
    },
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/rpc\/get_drug_trend_data/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'trend-data-cache',
        expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/rpc\/get_location_category_heatmap/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'heatmap-cache',
        expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
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
};

export default withPWA(nextConfig);