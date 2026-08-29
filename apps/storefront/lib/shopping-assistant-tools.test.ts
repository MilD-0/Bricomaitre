import { shoppingAssistantRequestSchema } from '@bric/storefront-core/shopping-assistant-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildShoppingAssistantTools } from './shopping-assistant-tools';

const settings = {
  phoneDisplay: '0795 34 28 26',
  phoneHref: 'tel:+213795342826',
  phoneEnabled: true,
  aiAssistantEnabled: true,
  contactEmail: 'support@bricomaitre.com',
  address: 'Alger',
  mapUrl: null,
  facebookUrl: null,
  aiModel: 'openai/gpt-5.6-luna',
  aiFallbackModel: null,
};

function catalogProduct(id: number) {
  return {
    id,
    slug: `product-${id}`,
    mongoId: null,
    title: `Produit ${id}`,
    titleAr: `منتج ${id}`,
    description: `Description ${id}`,
    descriptionAr: null,
    sku: `SKU-${id}`,
    barcode: null,
    price: '5000.00',
    oldPrice: null,
    active: true,
    inStock: true,
    availabilityStatus: 'in_stock',
    inventoryQuantity: 4,
    brandId: null,
    categoryId: null,
    images: [`/product-${id}.jpg`],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}

function productDetail(id: number) {
  return {
    item: {
      id,
      canonicalToken: `product-${id}`,
      title: `Produit ${id}`,
      titleAr: `منتج ${id}`,
      description: `Description détaillée ${id}`,
      descriptionAr: null,
      sku: `SKU-${id}`,
      barcode: null,
      price: '5000.00',
      oldPrice: null,
      availability: { status: 'in_stock', inStock: true, quantity: 4 },
      media: [],
      brand: null,
      category: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    },
    resolution: {
      requestedToken: String(id),
      matchedBy: 'id' as const,
      canonicalToken: `product-${id}`,
    },
  };
}

function request(
  context: Partial<
    NonNullable<ReturnType<typeof shoppingAssistantRequestSchema.parse>['context']>
  > = {},
) {
  return shoppingAssistantRequestSchema.parse({
    locale: 'fr',
    messages: [{ role: 'user', content: 'Aidez-moi à choisir.' }],
    context: {
      pathname: '/fr/products',
      currentProductToken: null,
      currentLandingPageSlug: null,
      currentOrderToken: null,
      catalogQuery: null,
      cartItems: [],
      ...context,
    },
  });
}

async function execute(toolDefinition: unknown, input: unknown) {
  return (toolDefinition as { execute: (value: unknown) => Promise<unknown> }).execute(input);
}

describe('Storefront assistant tools', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes only the lean customer capability surface', () => {
    const runtime = buildShoppingAssistantTools({ request: request(), settings });

    expect(Object.keys(runtime.tools)).toEqual([
      'read_storefront_guidance',
      'search_catalog',
      'inspect_products',
      'inspect_order',
      'inspect_delivery_support',
      'inspect_promotion',
      'manage_cart',
      'present_products',
    ]);
  });

  it('lets the model inspect repeated bounded groups without a one-call guard', async () => {
    const fetchProductDetail = vi.fn(async (token: string) => productDetail(Number(token)));
    const runtime = buildShoppingAssistantTools({
      request: request(),
      settings,
      dependencies: {
        fetchAssets: async () => ({ banners: [], featuredGroups: [], productCards: [] }),
        fetchProductDetail,
      },
    });

    const first = await execute(runtime.tools.inspect_products, {
      targets: Array.from({ length: 8 }, (_, index) => ({
        kind: 'product_id',
        productId: index + 1,
      })),
    });
    const second = await execute(runtime.tools.inspect_products, {
      targets: [{ kind: 'product_id', productId: 9 }],
    });

    expect(first).toMatchObject({
      products: expect.arrayContaining([
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 8 }),
      ]),
    });
    expect(second).toMatchObject({ products: [expect.objectContaining({ id: 9 })] });
    expect(fetchProductDetail).toHaveBeenCalledTimes(9);
  });

  it('returns the linked campaign document only through current-page inspection', async () => {
    const getLandingPage = vi.fn(async () => ({
      id: 4,
      slug: 'lampe-atelier',
      locale: 'fr' as const,
      revision: 3,
      publishedAt: null,
      document: {
        schemaVersion: 1 as const,
        theme: {
          accent: 'orange' as const,
          density: 'comfortable' as const,
          shell: 'campaign' as const,
        },
        seo: {
          title: 'Offre lampe atelier',
          description: 'La campagne publique de la lampe atelier.',
          indexable: false,
        },
        blocks: [
          {
            id: 'hero',
            type: 'product-hero' as const,
            variant: 'media-left' as const,
            heading: 'Éclairez chaque chantier',
            subheading: '',
            imageUrl: null,
            imageAlt: '',
            primaryCtaLabel: 'Commander',
            showAddToCart: true,
            surface: 'plain' as const,
            width: 'wide' as const,
          },
          {
            id: 'final',
            type: 'final-cta' as const,
            variant: 'solid' as const,
            heading: 'Commandez maintenant',
            body: '',
            primaryCtaLabel: 'Commander',
            imageUrl: null,
            imageAlt: '',
            surface: 'plain' as const,
            width: 'wide' as const,
          },
        ],
      },
      product: productDetail(12).item,
    }));
    const runtime = buildShoppingAssistantTools({
      request: request({
        pathname: '/fr/landing/lampe-atelier',
        currentLandingPageSlug: 'lampe-atelier',
      }),
      settings,
      dependencies: {
        fetchAssets: async () => ({ banners: [], featuredGroups: [], productCards: [] }),
        getLandingPage: getLandingPage as never,
      },
    });

    const evidence = await execute(runtime.tools.inspect_products, {
      targets: [{ kind: 'current_page' }],
    });

    expect(getLandingPage).toHaveBeenCalledWith('fr', 'lampe-atelier');
    expect(evidence).toMatchObject({
      products: [expect.objectContaining({ id: 12 })],
      currentCampaign: {
        slug: 'lampe-atelier',
        locale: 'fr',
        document: { seo: { title: 'Offre lampe atelier' } },
      },
    });
  });

  it('keeps product cards optional after a catalog search', async () => {
    const runtime = buildShoppingAssistantTools({
      request: request(),
      settings,
      dependencies: {
        fetchAssets: async () => ({ banners: [], featuredGroups: [], productCards: [] }),
        fetchCatalog: async () => ({ items: [catalogProduct(12)], total: 1 }),
        fetchCatalogMeta: async () => ({ brands: [], categories: [] }),
      },
    });

    const searchResult = await execute(runtime.tools.search_catalog, {});
    expect(JSON.stringify(searchResult)).not.toContain('Description 12');
    expect(runtime.result().products).toEqual([]);

    const presentation = await execute(runtime.tools.present_products, { productIds: [12] });
    expect(JSON.stringify(presentation)).not.toContain('Description 12');
    expect(runtime.result().products).toMatchObject([{ id: 12, token: 'product-12' }]);
  });

  it('collapses repeated cart reasoning into one final browser change', async () => {
    const fetchCartValidation = vi.fn(async (productIds: number[]) => ({
      items: productIds.map(catalogProduct),
    }));
    const runtime = buildShoppingAssistantTools({
      request: request({ cartItems: [{ productId: 12, quantity: 1 }] }),
      settings,
      dependencies: { fetchCartValidation },
    });

    await execute(runtime.tools.manage_cart, {
      operations: [{ action: 'add', productId: 12, quantity: 2 }],
    });
    await execute(runtime.tools.manage_cart, {
      operations: [{ action: 'set_quantity', productId: 12, quantity: 4 }],
    });

    expect(runtime.result().cartMutations).toEqual([
      { action: 'set_quantity', productId: 12, quantity: 4 },
    ]);
    expect(fetchCartValidation).toHaveBeenCalledTimes(2);
  });

  it('uses the linked token internally while returning only customer-safe order evidence', async () => {
    const fetchOrderByToken = vi.fn(
      async () =>
        ({
          id: 44,
          publicToken: 'private-order-token-1234567890',
          phoneNumber1: '0550000000',
          homeAddress: 'Private address',
          note: 'Private note',
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-02T00:00:00.000Z',
          confirmed: 7,
          delivery: 0,
          productSubtotal: 5000,
          deliveryFee: 600,
          totalAmount: 5600,
          promoCode: null,
          promoDiscountAmount: 0,
          orderProducts: [{ productId: 12, title: 'Produit 12', quantity: 1 }],
          statusHistory: [
            { id: 1, status: 2, noAnswerCount: 0, changedAt: '2026-08-01T01:00:00.000Z' },
          ],
        }) as never,
    );
    const runtime = buildShoppingAssistantTools({
      request: request({ currentOrderToken: 'private-order-token-1234567890' }),
      settings,
      dependencies: { fetchOrderByToken },
    });

    const evidence = await execute(runtime.tools.inspect_order, {});
    const serialized = JSON.stringify(evidence);

    expect(fetchOrderByToken).toHaveBeenCalledWith('private-order-token-1234567890');
    expect(evidence).toMatchObject({
      orderId: 44,
      tracking: { current: 'onWay', variant: 'progress' },
    });
    expect(serialized).not.toContain('private-order-token');
    expect(serialized).not.toContain('0550000000');
    expect(serialized).not.toContain('Private address');
    expect(serialized).not.toContain('Private note');
  });

  it('keeps retrieved guidance compact and omits an unconfirmed return policy', async () => {
    const runtime = buildShoppingAssistantTools({ request: request(), settings });
    const guidance = await execute(runtime.tools.read_storefront_guidance, {
      topics: ['ordering', 'tracking', 'delivery'],
    });
    const serialized = JSON.stringify(guidance);

    expect(serialized).toContain('payment on delivery');
    expect(serialized).not.toMatch(/refund|before opening|return policy/i);
    expect(serialized.length).toBeLessThan(1_500);
  });
});
