import type { Metadata, Viewport } from 'next';

import './globals.css';
import './styles/site-navigation.css';
import './styles/shopping-assistant.css';
import './styles/mobile-navigation.css';
import './styles/cart-drawer.css';
import './styles/home.css';
import './styles/shared-content.css';
import './styles/product.css';
import './styles/catalog.css';
import './styles/checkout.css';
import './styles/landing-page.css';
import './styles/skeletons.css';

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
