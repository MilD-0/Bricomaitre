import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  readBrand: vi.fn(),
  readCategory: vi.fn(),
  resolveBrandSlug: vi.fn(),
  resolveCategorySlug: vi.fn(),
  assertParent: vi.fn(),
}));

vi.mock('./action-history', () => ({ mutateEntityWithHistory: mocks.mutate }));
vi.mock('./brands-categories-api', () => ({
  readBrand: mocks.readBrand,
  readCategory: mocks.readCategory,
  resolveBrandSlug: mocks.resolveBrandSlug,
  resolveCategorySlug: mocks.resolveCategorySlug,
}));
vi.mock('./category-hierarchy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./category-hierarchy')>()),
  assertCategoryParentAllowed: mocks.assertParent,
}));

import {
  createBrandThroughCanonicalWorkflow,
  deleteBrandThroughCanonicalWorkflow,
  updateCategoryThroughCanonicalWorkflow,
} from './taxonomy-mutations';

describe('canonical taxonomy mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveBrandSlug.mockResolvedValue('atelier-pro');
    mocks.resolveCategorySlug.mockResolvedValue('outillage-electrique');
    mocks.readBrand.mockResolvedValue({ id: '8', name: 'Atelier Pro' });
    mocks.readCategory.mockResolvedValue({ id: '7', name: 'Outillage' });
  });

  it('creates an explicitly requested draft brand with complete action history', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 8 }]);
    const values = vi.fn().mockReturnValue({ returning });
    const tx = { insert: vi.fn().mockReturnValue({ values }) };
    mocks.mutate.mockImplementation(async (_db, config) => config.execute(tx));
    const actor = { email: 'admin@example.com', name: 'Admin' };

    const result = await createBrandThroughCanonicalWorkflow(
      'database' as never,
      { name: 'Atelier Pro', status: 'draft' },
      actor,
    );

    expect(mocks.resolveBrandSlug).toHaveBeenCalledWith('Atelier Pro', undefined, 'database');
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Atelier Pro',
        slug: 'atelier-pro',
        isActive: false,
        createdBy: 'admin@example.com',
      }),
    );
    expect(result).toMatchObject({ id: 8, slug: 'atelier-pro', status: 'draft' });
  });

  it('reparents and localizes a category only after the cycle-safe hierarchy check', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const tx = { update: vi.fn().mockReturnValue({ set }) };
    mocks.mutate.mockImplementation(async (_db, config) => config.execute(tx));

    const result = await updateCategoryThroughCanonicalWorkflow(
      'database' as never,
      7,
      { name: 'Outillage électrique', nameAr: 'أدوات كهربائية', parentId: 3 },
      { email: 'admin@example.com' },
    );

    expect(mocks.assertParent).toHaveBeenCalledWith(tx, 7, 3, { lockHierarchy: true });
    expect(mocks.resolveCategorySlug).toHaveBeenCalledWith('Outillage électrique', 7, tx);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Outillage électrique',
        nameAr: 'أدوات كهربائية',
        parentId: 3,
        slug: 'outillage-electrique',
      }),
    );
    expect(result).toMatchObject({ id: 7, slug: 'outillage-electrique' });
  });

  it('deletes the exact inspected brand through the canonical action record', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const tx = { delete: vi.fn().mockReturnValue({ where }) };
    mocks.mutate.mockImplementation(async (_db, config) => config.execute(tx));

    await expect(
      deleteBrandThroughCanonicalWorkflow('database' as never, 8, {
        email: 'admin@example.com',
      }),
    ).resolves.toEqual({ kind: 'brand', id: 8, deleted: true });
    expect(mocks.mutate).toHaveBeenCalledWith(
      'database',
      expect.objectContaining({ entityType: 'brands', entityId: 8, operation: 'delete' }),
    );
  });
});
