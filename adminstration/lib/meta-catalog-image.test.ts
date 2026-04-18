import { afterEach, describe, expect, it } from 'vitest';

import { buildMetaCatalogImageUrl, getAdminBaseUrl } from './meta-catalog-image';

describe('meta-catalog-image', () => {
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;

  afterEach(() => {
    process.env.NEXTAUTH_URL = originalNextAuthUrl;
  });

  it('uses NEXTAUTH_URL as the admin base url when configured', () => {
    process.env.NEXTAUTH_URL = 'https://admin.example.com/';

    expect(getAdminBaseUrl()).toBe('https://admin.example.com');
  });

  it('builds a stable public meta image URL with a version param', () => {
    process.env.NEXTAUTH_URL = 'https://admin.example.com';

    expect(buildMetaCatalogImageUrl(42, '2026-04-12T00:00:00.000Z')).toBe(
      'https://admin.example.com/api/products/meta-image/42?v=1775952000000',
    );
  });
});
