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
  themeColor: '#16A34A',
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/icon-192.png',
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
