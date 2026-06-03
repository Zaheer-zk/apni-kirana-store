import type { Metadata, Viewport } from 'next';
import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { Providers } from '@/components/Providers';
import { getLocale, getMessages } from '@/lib/i18n';

export const metadata: Metadata = {
  title: {
    default: 'Quick Easy Mart — your neighbourhood store, online',
    template: '%s · Quick Easy Mart',
  },
  description:
    'Order groceries, daily essentials and medicines from your nearest kirana store. 30-minute delivery, cash on delivery, no minimum order.',
  applicationName: 'Quick Easy Mart',
  formatDetection: { telephone: false },
  // iOS-specific PWA meta — Next emits these as `apple-mobile-web-app-*`
  // tags so Safari treats us like a native app once added to Home Screen.
  appleWebApp: {
    capable: true,
    title: 'Quick Easy Mart',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // Both 192 and 512 listed for apple-touch-icon so iOS picks the best
    // density. (Apple recommends 180×180, but iOS scales 192 down cleanly
    // and we don't yet have a dedicated 180 asset.)
    apple: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'Quick Easy Mart',
    description: 'Your neighbourhood store, online.',
    images: ['/logo-horizontal.png'],
    siteName: 'Quick Easy Mart',
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
