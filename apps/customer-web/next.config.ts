import type { NextConfig } from 'next';

// NextConfig in Next.js 16's published .d.ts no longer declares `eslint`
// or `typescript` top-level blocks even though `next build` still honours
// them. Build the config as a plain object first, then cast — keeps
// parity with the admin app and avoids a tsc error from a runtime-only
// option.
const config = {
  // Monorepo workspace packages compiled in-place — Next has to transpile
  // them because they ship raw TS/TSX (no `dist/` build step).
  transpilePackages: ['@aks/shared', '@aks/ui'],
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
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
export default nextConfig;
