import type { MetadataRoute } from 'next';

/**
 * PWA manifest for store.quickeasymart.com. Lighthouse needs:
 *   - `name` + `short_name`
 *   - `start_url` (we use `/` so the install opens the dashboard)
 *   - `display: 'standalone'` so the app gets its own window chrome
 *   - At least one icon ≥192×192 and one ≥512×512 (the two PNGs in
 *     `public/icons/` are placeholders — swap in the real brand assets
 *     before launch)
 *   - HTTPS — provided by nginx + Let's Encrypt at deploy time
 *
 * Next.js generates `/manifest.webmanifest` from this file at build time.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Quick Easy Mart — Store',
    short_name: 'AKS Store',
    description:
      'Manage your Quick Easy Mart store — accept orders, update stock and change opening hours.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F9FAFB',
    theme_color: '#16A34A',
    categories: ['business', 'productivity', 'shopping'],
    icons: [
      // Two purposes from the same files. Real artwork should ship one
      // distinct maskable variant (safe zone within the inner 40% of the
      // canvas) — these placeholders are solid green so either purpose
      // renders cleanly while we wait on real assets.
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
