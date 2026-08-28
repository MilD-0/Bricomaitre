import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findProducts: vi.fn(),
  readProduct: vi.fn(),
  readArchivedProduct: vi.fn(),
  readBrand: vi.fn(),
  readCategory: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./admin-ai-domain', () => ({ findAdminProducts: mocks.findProducts }));
vi.mock('./product-update-workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./product-update-workflow')>()),
  readProductMutationPayload: mocks.readProduct,
  readArchivedProductMutationPayload: mocks.readArchivedProduct,
}));
vi.mock('./brands-categories-api', () => ({
  readBrand: mocks.readBrand,
  readCategory: mocks.readCategory,
}));

import { ProductMutationNotFoundError } from './product-update-workflow';
import { ADMIN_AI_CATALOG_KNOWLEDGE } from './admin-ai-catalog-knowledge';
import {
  findAdminCatalogProducts,
  inspectAdminArchivedCatalogProducts,
  inspectAdminCatalogProducts,
} from './admin-ai-catalog';

describe('Admin assistant catalog evidence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the catalog contract compact and centered on consequential boundaries', () => {
    expect(ADMIN_AI_CATALOG_KNOWLEDGE.availability).toContain(
      'inventoryQuantity is the internal count',
    );
    expect(ADMIN_AI_CATALOG_KNOWLEDGE.availability).toContain(
      'Restoring only removes the archive state',
    );
    expect(ADMIN_AI_CATALOG_KNOWLEDGE.taxonomy).toContain(
      'Making taxonomy inactive does not hide its products',
    );
    expect(ADMIN_AI_CATALOG_KNOWLEDGE.historyAndPerformance).toContain(
      'Use Analytics for dated business performance',
    );
    expect(JSON.stringify(ADMIN_AI_CATALOG_KNOWLEDGE).length).toBeLessThan(1_500);
  });

  it('uses the existing lightweight product finder without expanding its result', async () => {
    const result = { items: [{ id: 12, title: 'Perceuse', sku: 'PER-12' }], total: 1 };
    mocks.findProducts.mockResolvedValue(result);

    await expect(findAdminCatalogProducts({ query: 'PER-12' })).resolves.toBe(result);
    expect(mocks.findProducts).toHaveBeenCalledWith({
      query: 'PER-12',
      productIds: [],
      page: 1,
      limit: 10,
    });
  });

  it('returns exact current product facts with resolved taxonomy', async () => {
    mocks.readProduct.mockResolvedValue({
      title: 'Perceuse',
      titleAr: 'مثقاب',
      slug: 'perceuse',
      description: 'Compacte',
      descriptionAr: null,
      sku: 'PER-12',
      barcode: '613000000012',
      price: 12_000,
      oldPrice: 13_000,
      purchasePrice: 7_000,
      active: true,
      inStock: false,
      availabilityStatus: 'out_of_stock',
      inventoryQuantity: 0,
      brandId: 2,
      categoryId: 3,
      images: ['https://cdn.example.com/perceuse.jpg'],
      promoCodes: [{ code: 'PRO', promoPrice: 11_000, active: true }],
    });
    mocks.readBrand.mockResolvedValue({
      id: '2',
      name: 'Bosch',
      slug: 'bosch',
      isActive: false,
    });
    mocks.readCategory.mockResolvedValue({
      id: '3',
      name: 'Perceuses',
      nameAr: 'مثاقب',
      slug: 'perceuses',
      isActive: true,
      parentId: '1',
      parentName: 'Outillage',
    });

    await expect(inspectAdminCatalogProducts({ productIds: [12] })).resolves.toEqual({
      kind: 'catalog_products',
      requestedIds: [12],
      missingIds: [],
      items: [
        {
          id: 12,
          archivedAt: null,
          identity: {
            title: 'Perceuse',
            titleAr: 'مثقاب',
            slug: 'perceuse',
            sku: 'PER-12',
            barcode: '613000000012',
          },
          pricing: {
            sellingPriceDzd: 12_000,
            compareAtPriceDzd: 13_000,
            purchaseCostDzd: 7_000,
            promoCodes: [{ code: 'PRO', promoPrice: 11_000, active: true }],
          },
          availability: {
            active: true,
            inStock: false,
            status: 'out_of_stock',
            inventoryQuantity: 0,
          },
          taxonomy: {
            brand: { id: 2, name: 'Bosch', slug: 'bosch', active: false },
            category: {
              id: 3,
              name: 'Perceuses',
              nameAr: 'مثاقب',
              slug: 'perceuses',
              active: true,
              parentId: 1,
              parentName: 'Outillage',
            },
            assignedBrandId: 2,
            assignedCategoryId: 3,
          },
          content: {
            description: 'Compacte',
            descriptionAr: null,
            images: ['https://cdn.example.com/perceuse.jpg'],
          },
        },
      ],
    });
    expect(mocks.readProduct).toHaveBeenCalledWith('database', 12);
  });

  it('returns full archived product facts only for exact archived IDs', async () => {
    mocks.readArchivedProduct.mockImplementation(async (_db, productId: number) => {
      if (productId === 404) throw new ProductMutationNotFoundError(productId);
      return {
        archivedAt: '2026-08-28T05:00:00.000Z',
        product: {
          title: 'Legacy drill',
          titleAr: null,
          slug: 'legacy-drill',
          description: 'Retained description',
          descriptionAr: null,
          sku: 'OLD-12',
          barcode: null,
          price: 9_000,
          oldPrice: null,
          purchasePrice: 5_500,
          active: false,
          inStock: false,
          availabilityStatus: 'out_of_stock',
          inventoryQuantity: 4,
          brandId: null,
          categoryId: null,
          images: [],
          promoCodes: [],
        },
      };
    });

    await expect(
      inspectAdminArchivedCatalogProducts({ productIds: [12, 404, 12] }),
    ).resolves.toMatchObject({
      kind: 'archived_catalog_products',
      requestedIds: [12, 404],
      missingIds: [404],
      items: [
        {
          id: 12,
          archivedAt: '2026-08-28T05:00:00.000Z',
          availability: {
            active: false,
            inStock: false,
            inventoryQuantity: 4,
          },
        },
      ],
    });
  });

  it('deduplicates exact IDs, reports missing products, and preserves other failures', async () => {
    mocks.readProduct.mockImplementation(async (_db, productId: number) => {
      if (productId === 404) throw new ProductMutationNotFoundError(productId);
      if (productId === 500) throw new Error('Database unavailable');
      return {
        title: 'Scie',
        titleAr: null,
        slug: 'scie',
        description: null,
        descriptionAr: null,
        sku: null,
        barcode: null,
        price: 8_000,
        oldPrice: null,
        purchasePrice: null,
        active: true,
        inStock: true,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 3,
        brandId: null,
        categoryId: null,
        images: [],
        promoCodes: [],
      };
    });

    await expect(inspectAdminCatalogProducts({ productIds: [8, 404, 8] })).resolves.toMatchObject({
      requestedIds: [8, 404],
      missingIds: [404],
      items: [{ id: 8 }],
    });
    await expect(inspectAdminCatalogProducts({ productIds: [500] })).rejects.toThrow(
      'Database unavailable',
    );
  });
});
