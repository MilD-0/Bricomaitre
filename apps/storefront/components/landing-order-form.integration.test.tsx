import {
  landingPageDocumentSchema,
  type StorefrontLandingPageResponse,
} from '@bric/storefront-core/landing-pages';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), settings: vi.fn() }));

vi.mock('@/lib/storefront-api', () => ({
  getStorefrontEcotrackCatalog: mocks.catalog,
  getStorefrontSettings: mocks.settings,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock('@/components/checkout-form', () => ({
  CheckoutForm: ({
    directItem,
    catalog,
    landingAttribution,
    embedded,
  }: {
    directItem: { productId: number; quantity: number };
    catalog: { wilayas: unknown[] };
    landingAttribution: { landingPageId: number; landingRevision: number };
    embedded: boolean;
  }) => (
    <section
      data-testid="inline-order"
      data-product={directItem.productId}
      data-quantity={directItem.quantity}
      data-wilayas={catalog.wilayas.length}
      data-landing={landingAttribution.landingPageId}
      data-revision={landingAttribution.landingRevision}
      data-embedded={embedded}
    />
  ),
}));

import { LandingOrderForm } from './landing-order-form';

const page = {
  id: 4,
  slug: 'lampe-atelier',
  locale: 'fr',
  revision: 2,
  publishedAt: null,
  document: landingPageDocumentSchema.parse({
    schemaVersion: 1,
    theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' },
    seo: { title: 'Lampe', description: 'Lampe de travail', indexable: true },
    blocks: [
      {
        id: 'hero',
        type: 'product-hero',
        variant: 'media-left',
        heading: 'Lampe',
        subheading: '',
        imageUrl: null,
        imageAlt: '',
        primaryCtaLabel: 'Commander',
        showAddToCart: true,
      },
      {
        id: 'final',
        type: 'final-cta',
        variant: 'solid',
        heading: 'Commander',
        body: '',
        primaryCtaLabel: 'Commander',
        imageUrl: null,
        imageAlt: '',
      },
    ],
  }),
  product: {
    id: 12,
    canonicalToken: 'desk-lamp',
    title: 'Lampe de travail',
    titleAr: 'مصباح العمل',
    description: null,
    descriptionAr: null,
    sku: null,
    barcode: null,
    price: '4500.00',
    oldPrice: null,
    availability: { status: 'in_stock', inStock: true, quantity: 4 },
    media: [],
    brand: null,
    category: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
  },
} as StorefrontLandingPageResponse;

describe('LandingOrderForm', () => {
  beforeEach(() => {
    mocks.catalog.mockReset().mockResolvedValue({
      wilayas: [{ wilayaId: 16, name: 'Alger' }],
      communes: [],
      serviceFees: [],
      weightFees: [],
      lastSync: null,
    });
    mocks.settings.mockReset().mockResolvedValue({
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: true,
      aiAssistantEnabled: false,
    });
  });

  it('binds the live landing product, delivery catalog, and revision attribution to an embedded checkout', async () => {
    const html = renderToStaticMarkup(await LandingOrderForm({ page, locale: 'fr' }));
    expect(html).toContain('data-product="12"');
    expect(html).toContain('data-quantity="1"');
    expect(html).toContain('data-wilayas="1"');
    expect(html).toContain('data-landing="4"');
    expect(html).toContain('data-revision="2"');
    expect(html).toContain('data-embedded="true"');
  });

  it('does not expose an order submission form for an unavailable product', async () => {
    const unavailable = {
      ...page,
      product: {
        ...page.product,
        availability: { status: 'out_of_stock' as const, inStock: false, quantity: 0 },
      },
    };
    const html = renderToStaticMarkup(await LandingOrderForm({ page: unavailable, locale: 'fr' }));
    expect(html).toContain('Ce produit est actuellement indisponible.');
    expect(html).not.toContain('data-testid="inline-order"');
  });
});
