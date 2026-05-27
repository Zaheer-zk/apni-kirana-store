import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Wires next-intl to ./i18n/request.ts — see customer-web next.config.ts.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// NextConfig in Next.js 16's published .d.ts no longer declares the
// `typescript` top-level block even though `next build` still honours it.
// Build the config as a plain object first, then cast — mirrors the
// pattern used in apps/customer-web/next.config.ts.
// The `eslint` top-level key was removed in Next 16 (warns on every start),
// so it is intentionally absent.
const config = {
  // Monorepo workspace packages compiled in-place — Next has to transpile
  // them because they ship raw TS/TSX (no `dist/` build step).
  transpilePackages: ['@aks/shared', '@aks/ui'],
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.quickeasymart.com' },
    ],
  },
  async headers() {
    // The service worker MUST be served from the site origin with the right
    // Service-Worker-Allowed header so it can control the whole app scope.
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

const nextConfig = config as unknown as NextConfig;
export default withNextIntl(nextConfig);
