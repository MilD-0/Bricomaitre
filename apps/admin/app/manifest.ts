import type { MetadataRoute } from 'next';

const APP_NAME = 'Bric Admin';
const APP_DESCRIPTION = 'Internal operations, catalog, orders, inventory, and analytics workspace.';
const APP_THEME_COLOR = '#0f172a';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: APP_NAME,
    short_name: 'Admin',
    description: APP_DESCRIPTION,
    start_url: '/en',
    scope: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: APP_THEME_COLOR,
    orientation: 'portrait',
    lang: 'en',
    dir: 'ltr',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/mask-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
