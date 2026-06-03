import type { MetadataRoute } from 'next';

/**
 * PWA web app manifest for driver.quickeasymart.com.
 *
 * Served as `/manifest.webmanifest` by the Next 16 metadata API. Drivers
 * can install this on Android home screen → standalone window, no browser
 * chrome. The placeholder icons in `/icons/` should be replaced with the
 * real brand assets before launch — see `docs/driver-web.md`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Quick Easy Mart — Driver',
    short_name: 'Quick Easy Mart Driver',
    description:
      'Manage your deliveries, earnings and profile on Quick Easy Mart.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F9FAFB',
    theme_color: '#16A34A',
    lang: 'en',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['business', 'productivity'],
  };
}
