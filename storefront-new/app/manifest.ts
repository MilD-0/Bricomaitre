import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bricomaitre',
    short_name: 'Bricomaitre',
    description: 'Outillage, bricolage et matériel professionnel en Algérie.',
    start_url: '/fr',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f7f5',
    theme_color: '#f7f7f5',
    lang: 'fr-DZ',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
