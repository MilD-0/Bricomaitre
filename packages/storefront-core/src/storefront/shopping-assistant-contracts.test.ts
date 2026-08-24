import { describe, expect, it } from 'vitest';

import {
  shoppingAssistantCartManagementSchema,
  shoppingAssistantCatalogSearchSchema,
  shoppingAssistantCatalogSearchResultSchema,
  shoppingAssistantRequestSchema,
  shoppingAssistantResponseSchema,
  shoppingAssistantStreamEventSchema,
} from './shopping-assistant-contracts';

describe('shopping assistant contracts', () => {
  it('accepts a bounded localized conversation and public product response', () => {
    expect(
      shoppingAssistantRequestSchema.parse({
        locale: 'fr',
        messages: [{ role: 'user', content: 'Je cherche une perceuse' }],
      }).messages,
    ).toHaveLength(1);
    expect(
      shoppingAssistantResponseSchema.parse({
        message: 'Voici une option.',
        mode: 'fallback',
        products: [
          {
            id: 1,
            token: 'drill',
            title: 'Perceuse',
            titleAr: null,
            description: null,
            descriptionAr: null,
            sku: 'P-1',
            characteristics: ['13 mm chuck'],
            characteristicsAr: ['ظرف 13 مم'],
            price: '5000.00',
            oldPrice: null,
            inStock: true,
            availabilityStatus: 'in_stock',
            imageUrl: null,
            brand: null,
            category: null,
          },
        ],
      }).products[0],
    ).not.toHaveProperty('purchasePrice');
  });

  it('accepts substantial continuity while rejecting unsupported locales and unbounded history', () => {
    expect(
      shoppingAssistantRequestSchema.safeParse({
        locale: 'en',
        messages: [{ role: 'user', content: 'drill' }],
      }).success,
    ).toBe(false);
    expect(
      shoppingAssistantRequestSchema.safeParse({
        locale: 'fr',
        messages: [{ role: 'user', content: 'drill', email: 'buyer@example.com' }],
      }).success,
    ).toBe(false);
    expect(
      shoppingAssistantRequestSchema.safeParse({
        locale: 'fr',
        messages: Array.from({ length: 40 }, () => ({ role: 'user', content: 'drill' })),
      }).success,
    ).toBe(true);
    expect(
      shoppingAssistantRequestSchema.safeParse({
        locale: 'fr',
        messages: Array.from({ length: 41 }, () => ({ role: 'user', content: 'drill' })),
      }).success,
    ).toBe(false);
  });

  it('uses the full public catalog filter and pagination contract', () => {
    expect(
      shoppingAssistantCatalogSearchSchema.parse({
        search: 'drill',
        brandId: 4,
        categoryId: 8,
        discounted: true,
        stock: 'in',
        minPrice: 1_000,
        maxPrice: 20_000,
        sortKey: 'price',
        sortDirection: 'asc',
        page: 42,
        limit: 24,
      }),
    ).toMatchObject({ page: 42, limit: 24, stock: 'in', discounted: true });
    expect(shoppingAssistantCatalogSearchSchema.safeParse({ limit: 25 }).success).toBe(false);
    expect(
      shoppingAssistantCatalogSearchSchema.safeParse({ minPrice: 20, maxPrice: 10 }).success,
    ).toBe(false);
    expect(
      shoppingAssistantCatalogSearchResultSchema.parse({
        products: [],
        total: 1_043,
        page: 42,
        limit: 24,
        hasMore: true,
      }),
    ).toMatchObject({ total: 1_043, hasMore: true });
  });

  it('accepts current page, cart, and prior recommendation context', () => {
    const request = shoppingAssistantRequestSchema.parse({
      locale: 'fr',
      context: {
        pathname: '/fr/products/perceuse',
        currentProductToken: 'perceuse',
        currentLandingPageSlug: null,
        currentOrderToken: null,
        catalogQuery: null,
        cartItems: [{ productId: 12, quantity: 2 }],
      },
      messages: [
        { role: 'assistant', content: 'Voici une option.', productIds: [12] },
        { role: 'user', content: 'Compare-la avec une autre.' },
      ],
    });

    expect(request.context?.cartItems).toEqual([{ productId: 12, quantity: 2 }]);
    expect(request.context?.currentLandingPageSlug).toBeNull();
    expect(request.context?.currentOrderToken).toBeNull();
    expect(request.messages[0]?.productIds).toEqual([12]);
  });

  it('defines bounded incremental response frames', () => {
    expect(
      shoppingAssistantStreamEventSchema.parse({ type: 'status', status: 'thinking' }),
    ).toEqual({ type: 'status', status: 'thinking' });
    expect(
      shoppingAssistantStreamEventSchema.parse({
        type: 'tool',
        name: 'search_catalog',
        status: 'completed',
      }),
    ).toEqual({ type: 'tool', name: 'search_catalog', status: 'completed' });
    expect(
      shoppingAssistantStreamEventSchema.safeParse({ type: 'text-delta', delta: '' }).success,
    ).toBe(false);
    expect(
      shoppingAssistantStreamEventSchema.safeParse({ type: 'error', code: 'provider_details' })
        .success,
    ).toBe(false);
    expect(
      shoppingAssistantStreamEventSchema.parse({
        type: 'result',
        mode: 'ai',
        products: [],
      }),
    ).toMatchObject({ cartMutations: [] });
  });

  it('defines bounded cart operations with explicit remove quantities', () => {
    expect(
      shoppingAssistantCartManagementSchema.parse({
        operations: [
          { action: 'add', productId: 12, quantity: 2 },
          { action: 'remove', productId: 18, quantity: 0 },
        ],
      }).operations,
    ).toHaveLength(2);
    expect(
      shoppingAssistantCartManagementSchema.safeParse({
        operations: [{ action: 'add', productId: 12, quantity: 21 }],
      }).success,
    ).toBe(false);
  });
});
