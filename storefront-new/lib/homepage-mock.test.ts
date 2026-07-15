import { describe, expect, it } from 'vitest';

import { homepageCategories, homepageProducts, normalizeHomepageConcept } from './homepage-mock';

describe('homepage mock merchandising', () => {
  it('normalizes unknown and repeated concept selectors to a safe concept', () => {
    expect(normalizeHomepageConcept(undefined)).toBe('1');
    expect(normalizeHomepageConcept('2')).toBe('2');
    expect(normalizeHomepageConcept(['3', '1'])).toBe('3');
    expect(normalizeHomepageConcept('campaign')).toBe('1');
  });

  it('keeps every mock category and product bilingual and navigable', () => {
    expect(homepageCategories).toHaveLength(6);
    expect(homepageCategories.every((item) => item.id > 0 && item.name.fr && item.name.ar && item.slug)).toBe(true);
    expect(homepageProducts.every(({ product, category }) => product.slug && product.titleAr && product.images.length === 1 && category.ar)).toBe(true);
  });
});
