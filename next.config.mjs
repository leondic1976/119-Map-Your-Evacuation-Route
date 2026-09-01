/** @type {import('next').NextConfig} */
const basePath = process.env.BASE_PATH || '';

const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  productionBrowserSourceMaps: false,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_OFFLINE: process.env.NEXT_PUBLIC_OFFLINE || '',
  },
};

export default nextConfig;
