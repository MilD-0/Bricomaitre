import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { metadata, viewport } from './layout';
import manifest from './manifest';

describe('storefront identity metadata', () => {
  it('publishes a French-default installable manifest with normal and maskable icons', () => {
    expect(manifest()).toMatchObject({
      name: 'Bricomaitre',
      start_url: '/fr',
      lang: 'fr-DZ',
      theme_color: '#f7f7f5',
      icons: expect.arrayContaining([
        expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192' }),
        expect.objectContaining({ src: '/icons/icon-maskable-512.png', purpose: 'maskable' }),
      ]),
    });
  });

  it('uses the complete Bricomaitre wordmark assets for browser and installed-app identity', () => {
    expect(metadata.icons).toMatchObject({
      icon: expect.arrayContaining([
        expect.objectContaining({ url: '/favicon.ico' }),
        expect.objectContaining({ url: '/icon.png', sizes: '512x512' }),
      ]),
      shortcut: ['/favicon.ico'],
      apple: [expect.objectContaining({ url: '/apple-icon.png', sizes: '180x180' })],
    });
    expect(viewport.themeColor).toBe('#f7f7f5');
  });

  it('ships every generated identity asset referenced by metadata', async () => {
    const files = [
      'app/favicon.ico',
      'app/icon.png',
      'app/apple-icon.png',
      'public/icons/icon-192.png',
      'public/icons/icon-512.png',
      'public/icons/icon-maskable-512.png',
    ];

    await Promise.all(files.map(async (file) => {
      const absolute = path.join(process.cwd(), file);
      await access(absolute);
      expect((await stat(absolute)).size).toBeGreaterThan(1_000);
    }));
  });
});
