import { describe, expect, it } from 'vitest';

import { buildProductCategoryBreadcrumbs } from './product-breadcrumbs';

const categories = [
  { id: 1, name: 'Tools', nameAr: 'الأدوات', slug: 'tools', parentId: null },
  { id: 2, name: 'Power tools', nameAr: 'الأدوات الكهربائية', slug: 'power-tools', parentId: 1 },
  { id: 3, name: 'Drills', nameAr: 'المثاقب', slug: 'drills', parentId: 2 },
];

describe('product category breadcrumbs', () => {
  it('builds a localized, root-first and navigable ancestry chain', () => {
    expect(buildProductCategoryBreadcrumbs(categories[2], categories, 'ar')).toEqual([
      { id: 1, label: 'الأدوات', href: '/ar/categories/tools' },
      { id: 2, label: 'الأدوات الكهربائية', href: '/ar/categories/power-tools' },
      { id: 3, label: 'المثاقب', href: '/ar/categories/drills' },
    ]);
  });

  it('falls back safely when ancestry is missing or cyclic', () => {
    expect(buildProductCategoryBreadcrumbs(
      { id: 3, name: 'Drills', nameAr: null, slug: null, parentId: 99 },
      [],
      'fr',
    )).toEqual([{ id: 3, label: 'Drills', href: '/fr/products?category=3' }]);

    const cyclic = [
      { id: 1, name: 'One', nameAr: null, slug: 'one', parentId: 2 },
      { id: 2, name: 'Two', nameAr: null, slug: 'two', parentId: 1 },
    ];
    expect(buildProductCategoryBreadcrumbs(cyclic[0], cyclic, 'fr')).toHaveLength(2);
  });
});
