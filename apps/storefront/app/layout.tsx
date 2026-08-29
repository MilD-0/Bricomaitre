import type { Metadata, Viewport } from 'next';

import './globals.css';

import { getStorefrontSiteUrl } from '@/lib/site-url';

export const metadata: Metadata = {
  metadataBase: new URL(getStorefrontSiteUrl()),
  applicationName: 'Bricomaitre',
  title: {
    default: 'Bricomaitre',
    template: '%s | Bricomaitre',
  },
  description: 'Outillage, bricolage et matériel professionnel avec livraison partout en Algérie.',
  creator: 'Bricomaitre',
  publisher: 'Bricomaitre',
  category: 'shopping',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#f7f7f5',
  colorScheme: 'light',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
