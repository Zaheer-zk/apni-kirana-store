import type { MetadataRoute } from 'next';

/**
 * PWA manifest for the customer storefront. Lets users "Add to Home screen"
 * on Android Chrome and (via Safari Share → Add) on iOS — the site behaves
 * like an installed app until they download the real one from the stores.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Quick Easy Mart',
    short_name: 'Quick Easy Mart',
    description: 'Your neighbourhood kirana store, online. 30-minute delivery.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFDF7',
    theme_color: '#16A34A',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
