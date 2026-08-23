import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  create: vi.fn(),
  replace: vi.fn(),
  archive: vi.fn(),
  revalidateTags: vi.fn(),
  revalidateProducts: vi.fn(),
  revalidateLandingPages: vi.fn(),
  startFeed: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./product-update-workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./product-update-workflow')>()),
  readProductMutationPayload: mocks.read,
  createProductThroughCanonicalWorkflow: mocks.create,
  replaceProductThroughCanonicalWorkflow: mocks.replace,
  archiveProductThroughCanonicalWorkflow: mocks.archive,
}));
vi.mock('./server-cache', () => ({
  CACHE_TAGS: { products: 'products', productsMeta: 'products-meta' },
  revalidateServerTags: mocks.revalidateTags,
}));
vi.mock('./storefront-revalidate', () => ({
  revalidateStorefrontProducts: mocks.revalidateProducts,
  revalidateStorefrontLandingPages: mocks.revalidateLandingPages,
}));
vi.mock('./background-jobs', () => ({
  startProductCatalogFeedRefreshJob: mocks.startFeed,
}));
vi.mock('./sentry', () => ({
  getRequestId: () => 'request-1',
  captureAdminException: mocks.capture,
}));

import {
  archiveAdminAiProducts,
  createAdminAiProduct,
  updateAdminAiProducts,
} from './admin-ai-products';
import { ProductMutationNotFoundError } from './product-update-workflow';

const current = {
  title: 'Perceuse',
  slug: 'perceuse',
  titleAr: null,
  description: 'Une perceuse.',
  descriptionAr: null,
  sku: 'DRILL-1',
  barcode: null,
  price: 100,
  oldPrice: null,
  purchasePrice: 60,
  active: true,
  inStock: true,
  availabilityStatus: 'in_stock' as const,
  inventoryQuantity: 8,
  brandId: 2,
  categoryId: 3,
  images: ['https://cdn.example.com/drill.jpg'],
  promoCodes: [
    {
      code: 'SAVE10',
      promoPrice: 90,
      active: true,
      startsAt: null,
      endsAt: null,
    },
  ],
};

describe('admin AI direct product updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue(current);
    mocks.replace.mockImplementation(async (_db, id, next) => ({
      id,
      slug: next.slug,
      title: next.title,
      price: next.price.toFixed(2),
      purchasePrice: next.purchasePrice?.toFixed(2) ?? null,
      active: next.active,
      inStock: next.inStock,
      availabilityStatus: next.availabilityStatus,
      brandId: next.brandId,
      categoryId: next.categoryId,
      promoCodeCount: next.promoCodes.length,
    }));
    mocks.startFeed.mockResolvedValue({ kind: 'started' });
    mocks.create.mockResolvedValue({
      id: 21,
      slug: 'perceuse-compacte',
      title: 'Perceuse compacte',
      price: '12900.00',
      purchasePrice: '8000.00',
      active: true,
      inStock: true,
      inventoryQuantity: 5,
      promoCodeCount: 0,
    });
    mocks.archive.mockImplementation(async (_db, productId) => ({ productId, archived: true }));
  });

  it('creates one complete canonical product and refreshes the catalog once', async () => {
    const actor = { email: 'admin@example.com', name: 'Admin' };
    const result = await createAdminAiProduct(
      {
        product: {
          title: 'Perceuse compacte',
          price: 12_900,
          purchasePrice: 8_000,
          inventoryQuantity: 5,
          brandId: 2,
          categoryId: 3,
        },
      },
      actor,
    );

    expect(mocks.create).toHaveBeenCalledWith(
      'database',
      expect.objectContaining({
        title: 'Perceuse compacte',
        price: 12_900,
        purchasePrice: 8_000,
        inventoryQuantity: 5,
        brandId: 2,
        categoryId: 3,
        active: true,
        inStock: true,
        promoCodes: [],
      }),
      actor,
    );
    expect(result).toMatchObject({
      ok: true,
      created: { id: 21, slug: 'perceuse-compacte' },
      catalogFeedRefresh: 'queued',
    });
    expect(mocks.revalidateProducts).toHaveBeenCalledOnce();
    expect(mocks.revalidateLandingPages).not.toHaveBeenCalled();
    expect(mocks.startFeed).toHaveBeenCalledWith('product:ai-create', 'request-1');
  });

  it('merges only requested fields, aligns availability, and refreshes all consumers once', async () => {
    const actor = { email: 'admin@example.com', name: 'Admin' };
    const result = await updateAdminAiProducts(
      {
        items: [
          {
            productId: 12,
            changes: { titleAr: 'مثقاب', inStock: false, purchasePrice: 62 },
          },
        ],
      },
      actor,
    );

    expect(mocks.replace).toHaveBeenCalledWith(
      'database',
      12,
      expect.objectContaining({
        title: 'Perceuse',
        titleAr: 'مثقاب',
        price: 100,
        purchasePrice: 62,
        inStock: false,
        availabilityStatus: 'out_of_stock',
        inventoryQuantity: 8,
        promoCodes: current.promoCodes,
      }),
      actor,
    );
    expect(result).toMatchObject({
      ok: true,
      updatedCount: 1,
      failedCount: 0,
      catalogFeedRefresh: 'queued',
      updated: [
        {
          id: 12,
          changedFields: ['titleAr', 'purchasePrice', 'inStock'],
          previous: { titleAr: null, purchasePrice: 60, inStock: true },
        },
      ],
    });
    expect(mocks.revalidateTags).toHaveBeenCalledWith('products', 'products-meta');
    expect(mocks.revalidateProducts).toHaveBeenCalledOnce();
    expect(mocks.revalidateLandingPages).toHaveBeenCalledOnce();
    expect(mocks.startFeed).toHaveBeenCalledOnce();
  });

  it('reports invalid merged promo economics without hiding successful sibling updates', async () => {
    const result = await updateAdminAiProducts({
      items: [
        { productId: 12, changes: { title: 'Perceuse Pro' } },
        { productId: 13, changes: { price: 80 } },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      requestedCount: 2,
      updatedCount: 1,
      failedCount: 1,
      failed: [
        {
          productId: 13,
          code: 'invalid_product_update',
          issues: [{ path: 'promoCodes.0.promoPrice' }],
        },
      ],
    });
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.startFeed).toHaveBeenCalledOnce();
  });

  it('does not refresh storefront or catalog feeds when every update is rejected', async () => {
    await updateAdminAiProducts({ items: [{ productId: 12, changes: { price: 80 } }] });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.revalidateProducts).not.toHaveBeenCalled();
    expect(mocks.startFeed).not.toHaveBeenCalled();
  });

  it('archives exact products with partial missing-product reporting and one refresh', async () => {
    mocks.archive
      .mockResolvedValueOnce({ id: 12, archived: true })
      .mockRejectedValueOnce(new ProductMutationNotFoundError(99));

    const result = await archiveAdminAiProducts(
      { productIds: [12, 99] },
      { email: 'admin@example.com', name: 'Admin' },
    );

    expect(result).toMatchObject({
      ok: false,
      requestedCount: 2,
      archivedCount: 1,
      failedCount: 1,
      archived: [{ id: 12, archived: true }],
      failed: [{ productId: 99, code: 'product_not_found' }],
      catalogFeedRefresh: 'queued',
    });
    expect(mocks.revalidateProducts).toHaveBeenCalledOnce();
    expect(mocks.revalidateLandingPages).toHaveBeenCalledOnce();
    expect(mocks.startFeed).toHaveBeenCalledWith('product:ai-archive', 'request-1');
  });
});
