import type { Metadata, Viewport } from 'next';
import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { Providers } from '@/components/Providers';
import { getLocale, getMessages } from '@/lib/i18n';

export const metadata: Metadata = {
  metadataBase: new URL('https://store.quickeasymart.com'),
  title: {
    default: 'Quick Easy Mart — Store dashboard',
    template: '%s · Store dashboard',
  },
  description:
    'Manage your kirana store on Quick Easy Mart — accept orders, update stock, change opening hours and grow with hyperlocal delivery.',
  applicationName: 'Quick Easy Mart Store',
  manifest: '/manifest.webmanifest',
  formatDetection: { telephone: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Quick Easy Mart Store',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  // Auth-gated dashboard — no value in being indexed; every page renders
  // the same login wall for crawlers. Leaving the open-graph tags off too
  // since there's no public preview to share.
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
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
      <body suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
