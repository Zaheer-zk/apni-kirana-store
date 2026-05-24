import type { Metadata, Viewport } from 'next';
import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { Providers } from '@/components/Providers';
import { getLocale, getMessages } from '@/lib/i18n';

export const metadata: Metadata = {
  title: {
    default: 'Quick Easy Mart — Driver',
    template: '%s · AKS Driver',
  },
  description:
    'Drive for Quick Easy Mart — manage your deliveries, earnings and profile from any device.',
  applicationName: 'AKS Driver',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'AKS Driver',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
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
