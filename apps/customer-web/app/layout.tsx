import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: {
    default: 'Apni Kirana — your neighbourhood store, online',
    template: '%s · Apni Kirana',
  },
  description:
    'Order groceries, daily essentials and medicines from your nearest kirana store. 30-minute delivery, cash on delivery, no minimum order.',
  applicationName: 'Apni Kirana',
  formatDetection: { telephone: false },
  // iOS-specific PWA meta — Next emits these as `apple-mobile-web-app-*`
  // tags so Safari treats us like a native app once added to Home Screen.
  appleWebApp: {
    capable: true,
    title: 'Apni Kirana',
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
    title: 'Apni Kirana',
    description: 'Your neighbourhood store, online.',
    images: ['/logo-horizontal.png'],
    siteName: 'Apni Kirana',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#16A34A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
