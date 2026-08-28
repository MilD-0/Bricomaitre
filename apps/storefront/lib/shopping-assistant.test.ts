import { describe, expect, it } from 'vitest';
import {
  shoppingAssistantRequestSchema,
  shoppingAssistantResponseSchema,
} from '@bric/storefront-core/shopping-assistant-contracts';

import {
  buildShoppingAssistantPageContext,
  storefrontDeliverySupportEvidence,
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

  it('returns exact delivery, commune, and public contact evidence from live contracts', () => {
    const evidence = storefrontDeliverySupportEvidence(
      {
        wilayas: [
          { wilayaId: 8, name: 'Béchar' },
          { wilayaId: 16, name: 'Alger' },
        ],
        communes: [
          {
            communeId: 1,
            wilayaId: 8,
            name: 'Abadla',
            postalCode: '08010',
            hasStopDesk: false,
          },
          {
            communeId: 2,
            wilayaId: 16,
            name: 'Bab Ezzouar',
            postalCode: '16042',
            hasStopDesk: true,
          },
        ],
        serviceFees: [
          {
            serviceType: 'livraison',
            wilayaId: 16,
            homeFee: '600.00',
            stopDeskFee: '450.00',
          },
        ],
        weightFees: [
          {
            serviceType: 'livraison',
            startsAtKg: '5.00',
            homeSurcharge: '100.00',
            stopDeskSurcharge: '80.00',
            perAdditionalKg: '20.00',
          },
        ],
        lastSync: null,
      },
      {
        phoneDisplay: '0795 34 28 26',
        phoneHref: 'tel:+213795342826',
        phoneEnabled: true,
        aiAssistantEnabled: true,
        contactEmail: 'support@example.com',
        address: 'Bab Ezzouar, Alger',
        mapUrl: 'https://maps.example.com/shop',
        facebookUrl: 'https://facebook.com/shop',
        aiModel: 'openai/gpt-5.6-luna',
        aiFallbackModel: null,
      },
      'Bab Ezzouar',
    );

    expect(evidence).toMatchObject({
      contact: {
        phone: { display: '0795 34 28 26', href: 'tel:+213795342826' },
        email: 'support@example.com',
      },
      matchedWilayaCount: 1,
      matchedWilayas: [
        {
          wilayaId: 16,
          name: 'Alger',
          fees: { homeDeliveryDzd: '600.00', stopDeskDzd: '450.00' },
          communes: [{ name: 'Bab Ezzouar', postalCode: '16042', hasStopDesk: true }],
        },
      ],
      deliveryWeightSurcharges: [
        {
          startsAtKg: '5.00',
          homeSurchargeDzd: '100.00',
          stopDeskSurchargeDzd: '80.00',
          perAdditionalKgDzd: '20.00',
        },
      ],
    });
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

    const campaign = buildShoppingAssistantPageContext(
      '/fr/landing/perceuse-pro',
      new URLSearchParams(),
      [],
    );
    expect(campaign.currentLandingPageSlug).toBe('perceuse-pro');

    const confirmation = buildShoppingAssistantPageContext(
      '/ar/thank-you',
      new URLSearchParams(`orderId=42&token=${'t'.repeat(32)}`),
      [],
    );
    expect(confirmation.currentOrderToken).toBe('t'.repeat(32));
  });

  it('enforces bounded public-only chat contracts at the app boundary', () => {
    expect(
      shoppingAssistantRequestSchema.safeParse({
        locale: 'fr',
        messages: Array.from({ length: 41 }, () => ({ role: 'user', content: 'outil' })),
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
