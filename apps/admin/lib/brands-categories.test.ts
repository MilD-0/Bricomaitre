import { describe, expect, it } from 'vitest';

import { brandsListResponseSchema, categoriesListResponseSchema } from './brands-categories';

const pagination = {
  page: 1,
  limit: 50,
  totalItems: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const audit = {
  createdAt: '2026-08-19T00:00:00.000Z',
  updatedAt: '2026-08-19T00:00:00.000Z',
};

describe('taxonomy list contracts', () => {
  it('keeps product counts returned for brands', () => {
    const response = brandsListResponseSchema.parse({
      writable: true,
      items: [
        {
          id: '12',
          name: 'Wadfow',
          slug: 'wadfow',
          isActive: true,
          status: 'active',
          productCount: 18,
          ...audit,
        },
      ],
      pagination,
    });

    expect(response.items[0]?.productCount).toBe(18);
  });

  it('defaults legacy category responses to zero products', () => {
    const response = categoriesListResponseSchema.parse({
      writable: true,
      items: [
        {
          id: '7',
          name: 'Power tools',
          slug: 'power-tools',
          isActive: false,
          status: 'draft',
          parentId: null,
          parentName: null,
          ...audit,
        },
      ],
      parentOptions: [],
      pagination,
    });

    expect(response.items[0]?.productCount).toBe(0);
  });
});
