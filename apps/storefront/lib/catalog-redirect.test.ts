import { describe, expect, it, vi } from 'vitest';

import { resolveLegacyTaxonomyRedirect } from './catalog-redirect';

describe('legacy catalog taxonomy redirects', () => {
  it.each([{ discounted: '1' }, { stock: 'in' }, { minPrice: '0' }, { maxPrice: '2500' }])(
    'preserves compound filters %j instead of dropping them during a taxonomy redirect',
    async (filters) => {
      const load = vi.fn();
      expect(
        await resolveLegacyTaxonomyRedirect('fr', { brand: '8', ...filters }, load),
      ).toBeNull();
      expect(load).not.toHaveBeenCalled();
    },
  );
  it('resolves single ID filters to canonical slug paths', async () => {
    const getCatalogMeta = vi.fn().mockResolvedValue({
      categories: [{ id: 4, slug: 'eclairage' }],
      brands: [{ id: 8, slug: 'wadfow' }],
    });
    await expect(
      resolveLegacyTaxonomyRedirect('fr', { category: '4' }, getCatalogMeta),
    ).resolves.toBe('/fr/categories/eclairage');
    await expect(resolveLegacyTaxonomyRedirect('ar', { brand: '8' }, getCatalogMeta)).resolves.toBe(
      '/ar/brands/wadfow',
    );
  });

  it('does not redirect compound discovery queries or metadata outages', async () => {
    const getCatalogMeta = vi.fn();
    await expect(
      resolveLegacyTaxonomyRedirect('fr', { category: '4', q: 'lampe' }, getCatalogMeta),
    ).resolves.toBeNull();
    expect(getCatalogMeta).not.toHaveBeenCalled();
    getCatalogMeta.mockRejectedValue(new Error('unavailable'));
    await expect(
      resolveLegacyTaxonomyRedirect('fr', { category: '4' }, getCatalogMeta),
    ).resolves.toBeNull();
  });
});
