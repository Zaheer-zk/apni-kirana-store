import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: {
    default: 'Quick Easy Mart — your neighbourhood store, online',
    template: '%s · Quick Easy Mart',
  },
  description:
    'Order groceries, daily essentials and medicines from your nearest kirana store. 30-minute delivery, cash on delivery, no minimum order.',
  applicationName: 'Quick Easy Mart',
  themeColor: '#16A34A',
  formatDetection: { telephone: false },
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
