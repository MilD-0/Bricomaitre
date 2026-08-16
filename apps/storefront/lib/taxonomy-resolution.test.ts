import { describe, expect, it, vi } from 'vitest';

import { resolveBrandSlug, resolveCategorySlug } from './taxonomy-resolution';

describe('taxonomy resolution', () => {
  it('distinguishes a matching slug from a missing taxonomy entry', async () => {
    const getCatalogMeta = vi.fn().mockResolvedValue({
      categories: [{ id: 4, slug: 'eclairage', name: 'Éclairage' }],
      brands: [{ id: 8, slug: 'wadfow', name: 'Wadfow' }],
    });
    await expect(resolveCategorySlug('eclairage', getCatalogMeta)).resolves.toEqual({
      status: 'found',
      item: { id: 4, slug: 'eclairage', name: 'Éclairage' },
    });
    await expect(resolveBrandSlug('missing', getCatalogMeta)).resolves.toEqual({
      status: 'missing',
    });
  });

  it('keeps an upstream outage distinct from a missing slug', async () => {
    const error = new Error('catalog metadata unavailable');
    const getCatalogMeta = vi.fn().mockRejectedValue(error);
    await expect(resolveCategorySlug('eclairage', getCatalogMeta)).resolves.toEqual({
      status: 'unavailable',
      error,
    });
  });
});
