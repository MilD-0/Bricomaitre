import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchProducts } = vi.hoisted(() => ({ searchProducts: vi.fn() }));
vi.mock('./admin-assets-data', () => ({ searchAssetProductOptions: searchProducts }));

import {
  adminAiCatalogProductInspectionSchema,
  adminAiArchivedCatalogProductInspectionSchema,
  findAdminCatalogProducts,
} from './admin-ai-catalog';

describe('Admin assistant catalog boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps validated lookup fields to canonical search and rejects unknown or empty requests', async () => {
    const result = { items: [{ id: 12, title: 'Perceuse', sku: 'PER-12' }], total: 1 };
    searchProducts.mockResolvedValue(result);
    await expect(findAdminCatalogProducts({ query: ' PER-12 ' })).resolves.toBe(result);
    expect(searchProducts).toHaveBeenCalledWith({ search: 'PER-12', ids: [], page: 1, limit: 10 });
    searchProducts.mockClear();
    await expect(findAdminCatalogProducts({})).rejects.toThrow();
    await expect(
      findAdminCatalogProducts({ query: 'drill', archived: true } as never),
    ).rejects.toThrow();
    expect(searchProducts).not.toHaveBeenCalled();
  });

  it('keeps the distinct current and archived selection bounds', () => {
    const ids = Array.from({ length: 20 }, (_, index) => index + 1);
    expect(adminAiCatalogProductInspectionSchema.safeParse({ productIds: ids }).success).toBe(
      false,
    );
    expect(
      adminAiArchivedCatalogProductInspectionSchema.safeParse({ productIds: ids }).success,
    ).toBe(true);
    expect(
      adminAiArchivedCatalogProductInspectionSchema.safeParse({ productIds: [...ids, 21] }).success,
    ).toBe(false);
    expect(adminAiCatalogProductInspectionSchema.safeParse({ productIds: [] }).success).toBe(false);
  });
});
