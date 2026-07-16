import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import manifest from './manifest';

describe('storefront identity metadata', () => {
  it('publishes a French-default installable manifest with normal and maskable icons', () => {
    expect(manifest()).toMatchObject({
      name: 'Bricomaitre',
      start_url: '/fr',
      lang: 'fr-DZ',
      theme_color: '#007d82',
      icons: expect.arrayContaining([
        expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192' }),
        expect.objectContaining({ src: '/icons/icon-maskable-512.png', purpose: 'maskable' }),
      ]),
    });
  });

  it('ships every generated identity asset referenced by metadata', async () => {
    const files = [
      'app/favicon.ico',
      'app/icon.png',
      'app/apple-icon.png',
      'public/icons/icon-192.png',
      'public/icons/icon-512.png',
      'public/icons/icon-maskable-512.png',
      'public/brand/bricomaitre-icon-master.png',
    ];

    await Promise.all(files.map(async (file) => {
      const absolute = path.join(process.cwd(), file);
      await access(absolute);
      expect((await stat(absolute)).size).toBeGreaterThan(1_000);
    }));
  });
});
