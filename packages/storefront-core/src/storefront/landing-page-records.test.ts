import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readProduct: vi.fn() }));
vi.mock('./catalog', () => ({ readStorefrontProductByToken: mocks.readProduct }));

import {
  buildIndexableLandingPageProductJoin,
  readIndexableStorefrontLandingPages,
  readStorefrontLandingPageRevision,
} from './landing-page-records';

const document = {
  schemaVersion: 1,
  theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' },
  seo: {
    title: 'Perceuse 20V',
    description: 'Découvrez la perceuse 20V pour vos travaux.',
    indexable: false,
  },
  blocks: [
    {
      id: 'hero',
      type: 'product-hero',
      variant: 'media-left',
      heading: 'Perceuse 20V',
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
      heading: 'Commandez maintenant',
      body: '',
      primaryCtaLabel: 'Commander',
      imageUrl: null,
      imageAlt: '',
    },
  ],
};

describe('indexable storefront landing pages', () => {
  it('requires the referenced product to remain active', () => {
    const query = new PgDialect().sqlToQuery(buildIndexableLandingPageProductJoin()!);

    expect(query.sql).toContain('"products"."id" = "landing_pages"."product_id"');
    expect(query.sql).toContain('"products"."active" =');
    expect(query.params).toEqual([true]);
  });

  it('keeps direct-link campaign pages out of storefront discovery', async () => {
    await expect(readIndexableStorefrontLandingPages({} as never)).resolves.toEqual([]);
  });

  it('loads the exact current draft revision for a signed preview', async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 4,
          productId: 8,
          slug: 'perceuse-20v',
          locale: 'fr',
          revision: 3,
          publishedAt: null,
        },
      ])
      .mockResolvedValueOnce([{ document }]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit })),
        })),
      })),
    };
    mocks.readProduct.mockResolvedValue({
      item: {
        id: 8,
        canonicalToken: 'perceuse-20v',
        title: 'Perceuse 20V',
        titleAr: null,
        description: null,
        descriptionAr: null,
        sku: null,
        barcode: null,
        price: '12000.00',
        oldPrice: null,
        availability: { status: 'in_stock', inStock: true, quantity: 3 },
        media: [],
        brand: null,
        category: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-17T00:00:00.000Z',
      },
    });

    await expect(
      readStorefrontLandingPageRevision(db as never, {
        slug: 'perceuse-20v',
        locale: 'fr',
        revision: 3,
      }),
    ).resolves.toMatchObject({
      id: 4,
      slug: 'perceuse-20v',
      revision: 3,
      publishedAt: null,
      document,
    });
    expect(mocks.readProduct).toHaveBeenCalledWith(db, '8');
  });
});
