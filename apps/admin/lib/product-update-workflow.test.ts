import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  toValues: vi.fn(),
  toPromoRows: vi.fn(),
  assertUnique: vi.fn(),
}));

vi.mock('./action-history', () => ({ mutateEntityWithHistory: mocks.mutate }));
vi.mock('./product-mutations', () => ({
  toProductMutationValues: mocks.toValues,
  toProductPromoRows: mocks.toPromoRows,
}));
vi.mock('./product-integrity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./product-integrity')>()),
  assertUniqueProductIdentifiers: mocks.assertUnique,
}));

import {
  archiveProductThroughCanonicalWorkflow,
  createProductThroughCanonicalWorkflow,
  ProductMutationNotFoundError,
  readArchivedProductMutationPayload,
  restoreProductThroughCanonicalWorkflow,
} from './product-update-workflow';

describe('canonical product lifecycle workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.toValues.mockResolvedValue({
      title: 'Perceuse compacte',
      slug: 'perceuse-compacte',
      price: '12900.00',
      purchasePrice: '8000.00',
      active: true,
      inStock: true,
      availabilityStatus: 'in_stock',
      inventoryQuantity: 5,
      brandId: 2,
      categoryId: 3,
    });
    mocks.toPromoRows.mockReturnValue([
      { productId: 21, code: 'PRO', normalizedCode: 'pro', promoPrice: '11900.00' },
    ]);
  });

  it('creates the product and promo rows in one action-history transaction', async () => {
    const productReturning = vi.fn().mockResolvedValue([{ id: 21 }]);
    const productValues = vi.fn().mockReturnValue({ returning: productReturning });
    const promoValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: productValues })
        .mockReturnValueOnce({ values: promoValues }),
    };
    mocks.mutate.mockImplementation(async (_db, config) => config.execute(tx));
    const actor = { email: 'admin@example.com', name: 'Admin' };

    const result = await createProductThroughCanonicalWorkflow(
      'database' as never,
      {
        title: 'Perceuse compacte',
        price: 12_900,
        purchasePrice: 8_000,
        inventoryQuantity: 5,
        brandId: 2,
        categoryId: 3,
        promoCodes: [{ code: 'PRO', promoPrice: 11_900, startsAt: null, endsAt: null }],
      },
      actor,
    );

    expect(mocks.assertUnique).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        slug: 'perceuse-compacte',
        price: '12900.00',
      }),
    );
    expect(productValues).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'perceuse-compacte' }),
    );
    expect(promoValues).toHaveBeenCalledWith([
      expect.objectContaining({ productId: 21, normalizedCode: 'pro' }),
    ]);
    expect(mocks.mutate).toHaveBeenCalledWith(
      'database',
      expect.objectContaining({
        entityType: 'products',
        operation: 'create',
        actor,
        resolveEntityId: expect.any(Function),
      }),
    );
    expect(result).toMatchObject({
      id: 21,
      slug: 'perceuse-compacte',
      inventoryQuantity: 5,
      promoCodeCount: 1,
    });
  });

  it('archives a product without deleting its historical record', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 21 }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const tx = { update: vi.fn().mockReturnValue({ set }) };
    mocks.mutate.mockImplementation(async (_db, config) => config.execute(tx));

    await expect(
      archiveProductThroughCanonicalWorkflow('database' as never, 21, {
        email: 'admin@example.com',
      }),
    ).resolves.toEqual({ id: 21, archived: true });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        archivedAt: expect.any(Date),
        active: false,
        inStock: false,
        availabilityStatus: 'out_of_stock',
      }),
    );
    expect(mocks.mutate).toHaveBeenCalledWith(
      'database',
      expect.objectContaining({ entityId: 21, operation: 'update' }),
    );
  });

  it('reads the retained payload and timestamp for an exact archived product', async () => {
    const archivedAt = new Date('2026-08-28T05:00:00.000Z');
    const database = {
      query: {
        products: {
          findFirst: vi.fn().mockResolvedValue({
            id: 21,
            title: 'Archived drill',
            slug: 'archived-drill',
            titleAr: null,
            description: null,
            descriptionAr: null,
            sku: 'OLD-21',
            barcode: null,
            price: '9000.00',
            oldPrice: null,
            purchasePrice: '5000.00',
            active: false,
            inStock: false,
            availabilityStatus: 'out_of_stock',
            inventoryQuantity: 3,
            brandId: 2,
            categoryId: 3,
            images: [],
            archivedAt,
          }),
        },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([
            {
              code: 'OLD',
              promoPrice: '8000.00',
              active: false,
              startsAt: null,
              endsAt: archivedAt,
            },
          ]),
        })),
      })),
    };

    await expect(readArchivedProductMutationPayload(database as never, 21)).resolves.toEqual({
      archivedAt: archivedAt.toISOString(),
      product: expect.objectContaining({
        title: 'Archived drill',
        price: 9_000,
        inventoryQuantity: 3,
        promoCodes: [expect.objectContaining({ code: 'OLD', promoPrice: 8_000, active: false })],
      }),
    });
  });

  it('reports a missing archive target', async () => {
    mocks.mutate.mockResolvedValue([]);
    await expect(
      archiveProductThroughCanonicalWorkflow('database' as never, 404, {}),
    ).rejects.toBeInstanceOf(ProductMutationNotFoundError);
  });

  it('restores only an archived product without silently making it sellable', async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: 21,
        title: 'Perceuse compacte',
        active: false,
        inStock: false,
        availabilityStatus: 'out_of_stock',
      },
    ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const tx = { update: vi.fn().mockReturnValue({ set }) };
    mocks.mutate.mockImplementation(async (_db, config) => config.execute(tx));

    await expect(
      restoreProductThroughCanonicalWorkflow('database' as never, 21, {
        email: 'admin@example.com',
      }),
    ).resolves.toEqual({
      id: 21,
      title: 'Perceuse compacte',
      active: false,
      inStock: false,
      availabilityStatus: 'out_of_stock',
      archived: false,
    });
    expect(set).toHaveBeenCalledWith({ archivedAt: null, updatedAt: expect.any(Date) });
    expect(mocks.mutate).toHaveBeenCalledWith(
      'database',
      expect.objectContaining({ entityId: 21, operation: 'update' }),
    );
  });

  it('reports a product that is missing or no longer archived during restore', async () => {
    mocks.mutate.mockResolvedValue([]);
    await expect(
      restoreProductThroughCanonicalWorkflow('database' as never, 404, {}),
    ).rejects.toBeInstanceOf(ProductMutationNotFoundError);
  });
});
