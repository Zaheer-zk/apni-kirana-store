import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Wires next-intl to ./i18n/request.ts so useTranslations() works inside
// server components. Without this the SSR layer throws "Couldn't find
// next-intl config file" and every page returns 500.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// NextConfig in Next.js 16's published .d.ts no longer declares `typescript`
// top-level block even though `next build` still honours it. Build the
// config as a plain object first, then cast — keeps parity with the admin
// app and avoids a tsc error from a runtime-only option.
// The `eslint` top-level key was removed in Next 16 (warns on every start),
// so it is intentionally absent.
const config = {
  // Monorepo workspace packages compiled in-place — Next has to transpile
  // them because they ship raw TS/TSX (no `dist/` build step).
  transpilePackages: ['@aks/shared', '@aks/ui'],
  typescript: { ignoreBuildErrors: true },
  images: {
    // Customer storefront frequently loads product photos from Cloudinary +
    // a few public CDNs. Allow them so `next/image` doesn't 400 in prod.
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.quickeasymart.com' },
    ],
  },
};

const nextConfig = config as unknown as NextConfig;
export default withNextIntl(nextConfig);
