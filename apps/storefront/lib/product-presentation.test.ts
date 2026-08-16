import { describe, expect, it } from 'vitest';

import {
  formatProductPrice,
  getLocalizedProductCopy,
  hasProductDiscount,
  parseProductPrice,
} from './product-presentation';

const product = {
  id: 12,
  canonicalToken: 'desk-lamp',
  title: 'Lampe de travail',
  titleAr: 'مصباح العمل',
  description: 'Éclairage stable',
  descriptionAr: 'إضاءة ثابتة',
  sku: 'DL-1',
  barcode: null,
  price: '1500.00',
  oldPrice: '1750.00',
  availability: { status: 'in_stock', inStock: true, quantity: 4 },
  media: [],
  brand: null,
  category: {
    id: 3,
    name: 'Lighting',
    nameAr: 'الإضاءة',
    slug: 'lighting',
    image: null,
    parentId: null,
    properties: [],
  },
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-02T10:00:00.000Z',
};

describe('product presentation', () => {
  it('selects complete Arabic copy and falls back field by field', () => {
    expect(getLocalizedProductCopy(product, 'ar')).toMatchObject({
      title: 'مصباح العمل',
      description: 'إضاءة ثابتة',
      categoryName: 'الإضاءة',
    });
    expect(
      getLocalizedProductCopy({ ...product, titleAr: ' ', descriptionAr: null }, 'ar'),
    ).toMatchObject({
      title: 'Lampe de travail',
      description: 'Éclairage stable',
    });
  });

  it('normalizes and localizes DZD prices without trusting malformed values', () => {
    expect(parseProductPrice('1500.00')).toBe(1500);
    expect(parseProductPrice('not-a-price')).toBe(0);
    expect(formatProductPrice('1500.00', 'fr')).toContain('1 500');
    expect(formatProductPrice('1500.00', 'ar')).toContain('1.500');
  });

  it('shows compare-at pricing only for a real discount', () => {
    expect(hasProductDiscount(product)).toBe(true);
    expect(hasProductDiscount({ ...product, oldPrice: '1200.00' })).toBe(false);
  });
});
