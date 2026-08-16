import { describe, expect, it, vi } from 'vitest';

import {
  storefrontProductDetailResponseSchema,
  storefrontProductTokenSchema,
} from '@bric/storefront-core/contracts';
import {
  normalizeStorefrontProductToken,
  readStorefrontProductByToken,
  selectStorefrontProductTokenMatch,
} from '@bric/storefront-core/catalog';
import { toStorefrontProductDetailDto } from '@bric/storefront-core/dto';

const candidateRows = [
  { id: 12, slug: '42', mongoId: 'mongo-slug' },
  { id: 42, slug: 'numeric-product', mongoId: null },
  { id: 7, slug: 'legacy-product', mongoId: '42' },
];

describe('storefront product detail contract', () => {
  it('normalizes tokens and only accepts positive safe integer ids', () => {
    expect(normalizeStorefrontProductToken(' 42 ')).toEqual({ token: '42', numericId: 42 });
    expect(normalizeStorefrontProductToken('4.2')).toEqual({ token: '4.2', numericId: null });
    expect(normalizeStorefrontProductToken('-1')).toEqual({ token: '-1', numericId: null });
    expect(normalizeStorefrontProductToken('9007199254740992')).toEqual({
      token: '9007199254740992',
      numericId: null,
    });
  });

  it('resolves ambiguous tokens by slug, then legacy Mongo id, then numeric id', () => {
    expect(selectStorefrontProductTokenMatch(candidateRows, '42')).toEqual({
      row: candidateRows[0],
      matchedBy: 'slug',
    });
    expect(selectStorefrontProductTokenMatch(candidateRows, 'mongo-slug')).toEqual({
      row: candidateRows[0],
      matchedBy: 'mongoId',
    });
    expect(selectStorefrontProductTokenMatch(candidateRows, '7')).toEqual({
      row: candidateRows[2],
      matchedBy: 'id',
    });
    expect(selectStorefrontProductTokenMatch(candidateRows, 'missing')).toBeNull();
  });

  it('maps database rows into a validated detail DTO with stable media slots', () => {
    const item = toStorefrontProductDetailDto({
      id: 12,
      slug: 'desk-lamp',
      mongoId: 'legacy-lamp',
      title: 'Desk Lamp',
      titleAr: 'مصباح مكتب',
      description: 'Warm light',
      descriptionAr: null,
      sku: 'DL-1',
      barcode: null,
      price: '1500.00',
      oldPrice: '1750.00',
      active: true,
      inStock: true,
      availabilityStatus: 'in_stock',
      inventoryQuantity: 4,
      brandId: 2,
      categoryId: 3,
      images: [' https://cdn.example.com/lamp.jpg ', ''],
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      updatedAt: new Date('2026-07-02T10:00:00.000Z'),
      brand: { id: 2, name: 'Bric', slug: 'bric', image: null },
      category: {
        id: 3,
        name: 'Lighting',
        nameAr: 'إضاءة',
        slug: 'lighting',
        image: null,
        parentId: null,
        properties: [],
      },
    });

    const response = {
      item,
      resolution: {
        requestedToken: 'legacy-lamp',
        matchedBy: 'mongoId' as const,
        canonicalToken: 'desk-lamp',
      },
    };

    expect(storefrontProductDetailResponseSchema.parse(response)).toEqual(response);
    expect(item.media).toEqual([
      {
        url: 'https://cdn.example.com/lamp.jpg',
        position: 0,
        width: null,
        height: null,
        blurDataUrl: null,
      },
    ]);
  });

  it('reads an active product through the Drizzle database boundary and preserves token resolution', async () => {
    const row = {
      id: 12,
      slug: 'desk-lamp',
      mongoId: 'legacy-lamp',
      title: 'Desk Lamp',
      titleAr: null,
      description: 'Warm light',
      descriptionAr: null,
      sku: 'DL-1',
      barcode: null,
      price: '1500.00',
      oldPrice: null,
      active: true,
      inStock: true,
      availabilityStatus: 'in_stock',
      inventoryQuantity: 4,
      brandId: null,
      categoryId: null,
      images: [],
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      updatedAt: new Date('2026-07-02T10:00:00.000Z'),
      brand: null,
      category: null,
    };
    const limit = vi.fn().mockResolvedValue([row]);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const query = {
      leftJoin: vi.fn(),
      where,
    };
    query.leftJoin.mockReturnValue(query);
    const from = vi.fn(() => query);
    const select = vi.fn(() => ({ from }));

    const response = await readStorefrontProductByToken({ select } as never, ' legacy-lamp ');

    expect(response).toMatchObject({
      item: { id: 12, canonicalToken: 'desk-lamp', title: 'Desk Lamp' },
      resolution: {
        requestedToken: 'legacy-lamp',
        matchedBy: 'mongoId',
        canonicalToken: 'desk-lamp',
      },
    });
    expect(select).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledOnce();
    expect(query.leftJoin).toHaveBeenCalledTimes(2);
    expect(where).toHaveBeenCalledOnce();
    expect(orderBy).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith(1);
  });

  it('rejects empty and oversized URL tokens', () => {
    expect(storefrontProductTokenSchema.safeParse('   ').success).toBe(false);
    expect(storefrontProductTokenSchema.safeParse('x'.repeat(201)).success).toBe(false);
  });
});
