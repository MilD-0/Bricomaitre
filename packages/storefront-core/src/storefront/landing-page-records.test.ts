import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readProduct: vi.fn() }));
vi.mock('./catalog', () => ({ readStorefrontProductById: mocks.readProduct }));

import {
  readPublishedStorefrontLandingPage,
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

describe('storefront landing page revisions', () => {
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
    expect(mocks.readProduct).toHaveBeenCalledWith(db, 8);
  });
});

describe('published landing page language resolution', () => {
  const source = {
    id: 4,
    productId: 8,
    slug: 'perceuse-fr',
    locale: 'fr',
    revision: 3,
    publishedAt: null,
  };
  const translation = { ...source, id: 5, slug: 'perceuse-ar', locale: 'ar' };

  it.each([
    {
      name: 'French to Arabic with different slugs',
      locale: 'ar',
      pages: [source],
      sibling: [translation],
      expected: translation,
    },
    {
      name: 'Arabic to French with different slugs',
      locale: 'fr',
      pages: [translation],
      sibling: [source],
      expected: source,
    },
    { name: 'French-only fallback', locale: 'ar', pages: [source], sibling: [], expected: source },
    {
      name: 'Arabic-only fallback',
      locale: 'fr',
      pages: [translation],
      sibling: [],
      expected: translation,
    },
    {
      name: 'exact locale takes precedence',
      locale: 'ar',
      pages: [source, translation],
      sibling: null,
      expected: translation,
    },
  ])('$name', async ({ locale, pages, sibling, expected }) => {
    const limit = vi.fn().mockResolvedValueOnce(pages);
    if (sibling) limit.mockResolvedValueOnce(sibling);
    limit.mockResolvedValueOnce([{ document }]);
    const where = vi.fn<
      (condition: Parameters<PgDialect['sqlToQuery']>[0]) => { limit: typeof limit }
    >(() => ({ limit }));
    const db = { select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })) };
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
      readPublishedStorefrontLandingPage(db as never, { slug: pages[0]!.slug, locale }),
    ).resolves.toMatchObject({ id: expected.id, slug: expected.slug, locale: expected.locale });
    const queries = where.mock.calls.map((call) => new PgDialect().sqlToQuery(call[0]!));
    expect(queries[0]!.params).toEqual([pages[0]!.slug, 'published']);
    if (sibling) expect(queries[1]!.params).toEqual([8, locale, 'published']);
  });

  it('does not resolve missing or unpublished source slugs', async () => {
    const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) };
    await expect(
      readPublishedStorefrontLandingPage(db as never, { slug: 'missing', locale: 'ar' }),
    ).resolves.toBeNull();
  });
});
