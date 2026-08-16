import { describe, expect, it } from 'vitest';

import { productListQuerySchema, productPatchSchema, productPayloadSchema } from './products';

describe('productPayloadSchema', () => {
  it('accepts a valid minimal payload and applies defaults', () => {
    const parsed = productPayloadSchema.parse({
      title: 'Test product',
      price: 19.99,
    });

    expect(parsed.active).toBe(true);
    expect(parsed.inStock).toBe(true);
    expect(parsed.availabilityStatus).toBe('in_stock');
    expect(parsed.inventoryQuantity).toBe(0);
    expect(parsed.images).toEqual([]);
  });

  it('coerces numeric inputs and respects nullable numeric fields', () => {
    const parsed = productPayloadSchema.parse({
      title: 'Coercion',
      price: '10.5',
      oldPrice: '12',
      purchasePrice: '8.25',
      brandId: '3',
      categoryId: '5',
    });

    expect(parsed.price).toBe(10.5);
    expect(parsed.oldPrice).toBe(12);
    expect(parsed.purchasePrice).toBe(8.25);
    expect(parsed.brandId).toBe(3);
    expect(parsed.categoryId).toBe(5);

    const nullableParsed = productPayloadSchema.parse({
      title: 'Nullable',
      price: 1,
      oldPrice: null,
    });

    expect(nullableParsed.oldPrice).toBeNull();
  });

  it('rejects invalid payloads', () => {
    const result = productPayloadSchema.safeParse({
      title: '',
      slug: 'invalid',
      price: -1,
      images: ['not-a-url'],
    });

    expect(result.success).toBe(false);
  });

  it('validates partial product toggle updates', () => {
    expect(productPatchSchema.parse({ active: false })).toEqual({ active: false });
    expect(productPatchSchema.parse({ inStock: true })).toEqual({ inStock: true });
    expect(productPatchSchema.safeParse({}).success).toBe(false);
  });

  it('parses paginated product list queries', () => {
    expect(
      productListQuerySchema.parse({
        page: '2',
        limit: '50',
        search: 'drill',
        brandId: '3',
        categoryId: '',
        imageOrigin: 'external',
        sortKey: 'price',
        sortDirection: 'asc',
      }),
    ).toEqual({
      page: 2,
      limit: 50,
      search: 'drill',
      brandId: 3,
      categoryId: null,
      imageOrigin: 'external',
      sort: [],
      sortKey: 'price',
      sortDirection: 'asc',
      sortRules: [{ key: 'price', direction: 'asc' }],
    });
  });

  it('prefers ordered multi-sort params over legacy single-sort fields', () => {
    expect(
      productListQuerySchema.parse({
        sort: ['active:asc', 'inStock:desc'],
        sortKey: 'price',
        sortDirection: 'asc',
      }).sortRules,
    ).toEqual([
      { key: 'active', direction: 'asc' },
      { key: 'inStock', direction: 'desc' },
    ]);
  });
});
