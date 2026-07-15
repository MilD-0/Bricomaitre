import { describe, expect, it } from 'vitest';

import { buildProductCategoryBreadcrumbs } from './product-breadcrumbs';

const categories = [
  { id: 1, name: 'Tools', nameAr: 'الأدوات', parentId: null },
  { id: 2, name: 'Power tools', nameAr: 'الأدوات الكهربائية', parentId: 1 },
  { id: 3, name: 'Drills', nameAr: 'المثاقب', parentId: 2 },
];

describe('product category breadcrumbs', () => {
  it('builds a localized, root-first and navigable ancestry chain', () => {
    expect(buildProductCategoryBreadcrumbs(categories[2], categories, 'ar')).toEqual([
      { id: 1, label: 'الأدوات', href: '/ar/products?category=1' },
      { id: 2, label: 'الأدوات الكهربائية', href: '/ar/products?category=2' },
      { id: 3, label: 'المثاقب', href: '/ar/products?category=3' },
    ]);
  });

  it('falls back safely when ancestry is missing or cyclic', () => {
    expect(buildProductCategoryBreadcrumbs(
      { id: 3, name: 'Drills', nameAr: null, parentId: 99 },
      [],
      'fr',
    )).toEqual([{ id: 3, label: 'Drills', href: '/fr/products?category=3' }]);

    const cyclic = [
      { id: 1, name: 'One', nameAr: null, parentId: 2 },
      { id: 2, name: 'Two', nameAr: null, parentId: 1 },
    ];
    expect(buildProductCategoryBreadcrumbs(cyclic[0], cyclic, 'fr')).toHaveLength(2);
  });
});
