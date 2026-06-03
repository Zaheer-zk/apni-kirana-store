import type { MetadataRoute } from 'next';

// Sitemap — static public routes for now. A future enhancement is to
// fetch live catalog items + active stores from /api/v1/catalog and emit
// per-item URLs (deferred until we have stable, share-worthy item pages).
//
// Generated at build time. Re-deploys produce a fresh lastModified
// per route, which is fine — Google treats lastModified as a hint, not
// a contract.

const SITE_URL = 'https://quickeasymart.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/search`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    // Static informational routes go here as we add them:
    //   /about, /contact, /faq, /privacy, /terms
    // For now the customer-web has none of these public pages.
  ];
}
