import { describe, expect, it } from 'vitest';
import {
  shoppingAssistantRequestSchema,
  shoppingAssistantResponseSchema,
} from '@bric/storefront-core/shopping-assistant-contracts';

import {
  catalogSearchQuery,
  buildShoppingAssistantPageContext,
  classifyShoppingAssistantIntent,
  deterministicAssistantMessage,
  shoppingAssistantInstructions,
  toAssistantCatalogProduct,
} from './shopping-assistant';

describe('storefront shopping assistant', () => {
  it('maps only public catalog fields and truncates model context', () => {
    const result = toAssistantCatalogProduct(
      {
        id: 12,
        slug: 'desk-lamp',
        mongoId: null,
        title: 'Lamp',
        titleAr: 'مصباح',
        description: 'x'.repeat(700),
        descriptionAr: null,
        sku: 'DL-1',
        barcode: null,
        price: '4500.00',
        oldPrice: null,
        active: true,
        inStock: true,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 3,
        brandId: 2,
        categoryId: 3,
        images: ['/lamp.jpg'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      { brand: 'Bric Pro', category: 'Lighting' },
      {
        id: 7,
        productId: 12,
        titleAr: 'مصباح مكتب احترافي',
        titleFr: 'Lampe de chantier',
        descriptionAr: 'إضاءة عملية',
        descriptionFr: 'Éclairage de travail orientable',
        characteristicsAr: ['بطارية 20 فولت'],
        characteristicsFr: ['Batterie 20 V', 'Tête orientable'],
        sortOrder: 1,
        active: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    );
    expect(result).toMatchObject({
      token: 'desk-lamp',
      title: 'Lampe de chantier',
      brand: 'Bric Pro',
      price: '4500.00',
      inStock: true,
      sku: 'DL-1',
      description: 'Éclairage de travail orientable',
      characteristics: ['Batterie 20 V', 'Tête orientable'],
    });
    expect(result.description?.length).toBeLessThanOrEqual(500);
    expect(result).not.toHaveProperty('inventoryQuantity');
  });

  it('normalizes contradictory raw availability to the customer-facing in-stock flag', () => {
    const result = toAssistantCatalogProduct({
      id: 12,
      slug: 'desk-lamp',
      mongoId: null,
      title: 'Lamp',
      titleAr: null,
      description: null,
      descriptionAr: null,
      sku: null,
      barcode: null,
      price: '4500.00',
      oldPrice: null,
      active: true,
      inStock: true,
      availabilityStatus: 'out_of_stock',
      inventoryQuantity: 3,
      brandId: null,
      categoryId: null,
      images: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result).toMatchObject({ inStock: true, availabilityStatus: 'in_stock' });
  });

  it('defines grounded shopper behavior and localized deterministic fallback', () => {
    expect(shoppingAssistantInstructions('fr')).toContain('Never invent specifications');
    expect(shoppingAssistantInstructions('fr')).toContain('Algerian dinars');
    expect(shoppingAssistantInstructions('fr')).toContain('never label them Dhs');
    expect(shoppingAssistantInstructions('fr')).toContain('never mention internal field names');
    expect(shoppingAssistantInstructions('fr')).toContain('narrow mobile shopping drawer');
    expect(shoppingAssistantInstructions('fr')).toContain('Never use Markdown tables');
    expect(shoppingAssistantInstructions('ar')).toContain('Answer in Arabic');
    expect(shoppingAssistantInstructions('ar')).toContain('retry once');
    expect(deterministicAssistantMessage('fr', 2)).toContain('catalogue');
    expect(deterministicAssistantMessage('ar', 0)).toContain('الكتالوج');
  });

  it('classifies assistant questions into analytics intents', () => {
    expect(classifyShoppingAssistantIntent('Compare ces deux perceuses')).toBe(
      'product_comparison',
    );
    expect(classifyShoppingAssistantIntent('كم سعر هذا المنتج؟')).toBe('price');
    expect(classifyShoppingAssistantIntent('Je cherche une ponceuse')).toBe('product_search');
    expect(classifyShoppingAssistantIntent('Bonjour')).toBe('other');
  });

  it('reduces conversational prompts to catalog search terms without losing models', () => {
    expect(catalogSearchQuery('Trouve-moi une lampe WADFOW disponible. Réponse très courte.')).toBe(
      'lampe WADFOW',
    );
    expect(catalogSearchQuery('Je cherche un perforateur SDS+ HITACHI DH24PH')).toBe(
      'perforateur SDS+ HITACHI DH24PH',
    );
    expect(catalogSearchQuery('أريد مصباح WADFOW متوفر')).toBe('مصباح WADFOW');
  });

  it('carries the current catalog filters, product, and cart into assistant context', () => {
    const catalog = buildShoppingAssistantPageContext(
      '/fr/products',
      new URLSearchParams(
        'q=perceuse&brand=2&category=3&discounted=1&stock=in&minPrice=1000&maxPrice=20000&sort=price-asc&page=4',
      ),
      [
        {
          productId: 12,
          token: 'perceuse',
          title: 'Perceuse',
          imageUrl: null,
          unitPrice: 12_500,
          quantity: 2,
          availabilityStatus: 'in_stock',
        },
      ],
    );
    expect(catalog.catalogQuery).toMatchObject({
      search: 'perceuse',
      brandId: 2,
      categoryId: 3,
      discounted: true,
      stock: 'in',
      sortKey: 'price',
      sortDirection: 'asc',
      page: 4,
      limit: 24,
    });
    expect(catalog.cartItems).toEqual([{ productId: 12, quantity: 2 }]);

    const product = buildShoppingAssistantPageContext(
      '/ar/products/perceuse%20pro',
      new URLSearchParams(),
      [],
    );
    expect(product.currentProductToken).toBe('perceuse pro');
    expect(product.catalogQuery).toBeNull();
  });

  it('enforces bounded public-only chat contracts at the app boundary', () => {
    expect(
      shoppingAssistantRequestSchema.safeParse({
        locale: 'fr',
        messages: Array.from({ length: 31 }, () => ({ role: 'user', content: 'outil' })),
      }).success,
    ).toBe(false);
    expect(
      shoppingAssistantResponseSchema.safeParse({
        mode: 'ai',
        message: 'Suggestion',
        products: [
          {
            id: 1,
            token: 'tool',
            title: 'Tool',
            titleAr: null,
            description: null,
            descriptionAr: null,
            sku: null,
            characteristics: [],
            characteristicsAr: [],
            price: '10',
            oldPrice: null,
            inStock: true,
            availabilityStatus: 'in_stock',
            imageUrl: null,
            brand: null,
            category: null,
            purchasePrice: '5',
          },
        ],
      }).success,
    ).toBe(false);
  });
});
