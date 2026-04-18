import type { Metadata, Viewport } from 'next';
import './globals.css';

const APP_NAME = 'Bric Admin';
const APP_DESCRIPTION = 'Internal operations, catalog, orders, inventory, and analytics workspace.';
const APP_THEME_COLOR = '#0f172a';

export const viewport: Viewport = {
  themeColor: APP_THEME_COLOR,
  colorScheme: 'dark light',
};

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} | Administration`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
        color: APP_THEME_COLOR,
      },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
