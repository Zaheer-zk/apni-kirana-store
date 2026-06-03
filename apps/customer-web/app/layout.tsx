import type { Metadata, Viewport } from 'next';
import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { Providers } from '@/components/Providers';
import { getLocale, getMessages } from '@/lib/i18n';

// SEO config — single source of truth so per-page metadata can opt in.
const SITE_URL = 'https://quickeasymart.com';
const SITE_NAME = 'Quick Easy Mart';
const SITE_DESCRIPTION =
  'Order groceries, daily essentials and medicines from your nearest kirana store. Delivered in 30 minutes. Cash on delivery available, no minimum order.';
const SITE_KEYWORDS = [
  'grocery delivery',
  'kirana online',
  'online grocery store',
  'hyperlocal delivery',
  'instant grocery',
  '30 minute delivery',
  'cash on delivery groceries',
  'fresh vegetables online',
  'medicine delivery',
  'household essentials',
  'india grocery delivery',
];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — your neighbourhood store, online · grocery delivery in 30 minutes`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: { telephone: false, email: false, address: false },
  alternates: {
    canonical: '/',
    languages: {
      'en-IN': '/',
      'hi-IN': '/?lang=hi',
    },
  },
  category: 'shopping',
  // iOS-specific PWA meta — Next emits these as `apple-mobile-web-app-*`
  // tags so Safari treats us like a native app once added to Home Screen.
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — your neighbourhood store, online`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/logo-horizontal.png',
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — grocery delivery in 30 minutes`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ['/logo-horizontal.png'],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  verification: {
    // Fill these in from search-console / bing-webmaster when you verify
    // domain ownership. Leaving null avoids emitting empty meta tags.
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
};

// Organization + WebSite JSON-LD — emitted in <head> so Google can build
// the brand sitelinks search box + knowledge panel. Single block applies
// site-wide; per-page Product/Store JSON-LD goes in those specific pages.
const ORG_JSONLD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/logo-horizontal.png`,
      sameAs: [
        // Add real socials when set up:
        // 'https://www.instagram.com/quickeasymart',
        // 'https://www.facebook.com/quickeasymart',
        // 'https://twitter.com/quickeasymart',
      ],
      contactPoint: [
        {
          '@type': 'ContactPoint',
          contactType: 'customer service',
          email: 'support@quickeasymart.com',
          areaServed: 'IN',
          availableLanguage: ['English', 'Hindi'],
        },
      ],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      publisher: { '@id': `${SITE_URL}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
      inLanguage: ['en-IN', 'hi-IN'],
    },
  ],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#16A34A',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages(locale);
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Organization + WebSite structured data. Inlined so the script
            is in the static HTML at first paint — Googlebot doesn't need
            to wait for JS hydration. */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
        />
      </head>
      <body suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
