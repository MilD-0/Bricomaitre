import { describe, expect, it } from 'vitest';

import {
  shoppingAssistantCatalogSearchSchema,
  shoppingAssistantRequestSchema,
  shoppingAssistantResponseSchema,
  shoppingAssistantStreamEventSchema,
} from './shopping-assistant-contracts';

describe('shopping assistant contracts', () => {
  it('accepts a bounded localized conversation and customer-safe product response', () => {
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

  it('rejects unsupported locales, extra fields, and unbounded history', () => {
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
        messages: Array.from({ length: 9 }, () => ({ role: 'user', content: 'drill' })),
      }).success,
    ).toBe(false);
  });

  it('bounds catalog searches to five products to limit model context', () => {
    expect(
      shoppingAssistantCatalogSearchSchema.safeParse({
        query: 'drill',
        inStockOnly: true,
        limit: 5,
      }).success,
    ).toBe(true);
    expect(
      shoppingAssistantCatalogSearchSchema.safeParse({
        query: 'drill',
        inStockOnly: true,
        limit: 6,
      }).success,
    ).toBe(false);
  });

  it('defines bounded incremental response frames', () => {
    expect(
      shoppingAssistantStreamEventSchema.parse({ type: 'status', status: 'thinking' }),
    ).toEqual({ type: 'status', status: 'thinking' });
    expect(
      shoppingAssistantStreamEventSchema.safeParse({ type: 'text-delta', delta: '' }).success,
    ).toBe(false);
    expect(
      shoppingAssistantStreamEventSchema.safeParse({ type: 'error', code: 'provider_details' })
        .success,
    ).toBe(false);
  });
});
