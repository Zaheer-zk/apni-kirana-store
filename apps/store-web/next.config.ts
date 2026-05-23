import type { NextConfig } from 'next';

// Mirrors apps/customer-web/next.config.ts. NextConfig in Next 16's typings
// no longer declares `eslint`/`typescript` top-level blocks even though
// `next build` honours them — build as a plain object first, then cast.
const config = {
  // Workspace packages compiled in-place — Next has to transpile them
  // because they ship raw TS/TSX (no `dist/` build step).
  transpilePackages: ['@aks/shared', '@aks/ui'],
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.quickeasymart.com' },
    ],
  },
  // PWA plumbing lives in `app/manifest.ts` (web app manifest) + the
  // hand-written `public/sw.js` service worker registered by
  // `components/PwaRegister.tsx`. We avoid `next-pwa` because it currently
  // lags Next 16's App Router and ships a much bigger SW than we need —
  // this store dashboard only needs offline-shell + asset caching.
};

const nextConfig = config as unknown as NextConfig;
export default nextConfig;
