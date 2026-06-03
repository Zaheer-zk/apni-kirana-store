import type { MetadataRoute } from 'next';

// Public-facing robots policy. Auth-only paths (/orders, /cart, /checkout,
// /account, /addresses, /wallet, /change-password, /reset-password) are
// disallowed so search engines don't index empty post-login screens.
// /api/* is also disallowed (backend lives at api.quickeasymart.com, but
// any local API routes shouldn't be crawled).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/orders',
          '/orders/',
          '/cart',
          '/checkout',
          '/account',
          '/account/',
          '/addresses',
          '/wallet',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/change-password',
        ],
      },
    ],
    sitemap: 'https://quickeasymart.com/sitemap.xml',
    host: 'https://quickeasymart.com',
  };
}
