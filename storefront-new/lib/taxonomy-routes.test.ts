import { describe, expect, it } from 'vitest';

import { findTaxonomyBySlug, getBrandPath, getCategoryPath } from './taxonomy-routes';

describe('taxonomy routes', () => {
  it('uses locale-aware canonical taxonomy paths while retaining an ID fallback', () => {
    expect(getCategoryPath('fr', { id: 4, slug: 'outillage-electrique' })).toBe('/fr/categories/outillage-electrique');
    expect(getBrandPath('ar', { id: 6, slug: 'wadfow' })).toBe('/ar/brands/wadfow');
    expect(getCategoryPath('fr', { id: 4, slug: null })).toBe('/fr/products?category=4');
  });

  it('keeps canonical slug casing strict so alternate spellings cannot create duplicate pages', () => {
    expect(findTaxonomyBySlug([{ id: 2, slug: 'bric-pro' }], 'bric-pro')).toEqual({ id: 2, slug: 'bric-pro' });
    expect(findTaxonomyBySlug([{ id: 2, slug: 'bric-pro' }], 'BRIC-PRO')).toBeNull();
  });
});
