/** @type {import('next').NextConfig} */
const nextConfig = {
  // Add empty turbopack config to resolve webpack/turbopack conflict
  turbopack: {},
};

module.exports = nextConfig;