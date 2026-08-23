import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBrand: vi.fn(),
  createCategory: vi.fn(),
  updateBrand: vi.fn(),
  updateCategory: vi.fn(),
  deleteBrand: vi.fn(),
  deleteCategory: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./taxonomy-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./taxonomy-mutations')>()),
  createBrandThroughCanonicalWorkflow: mocks.createBrand,
  createCategoryThroughCanonicalWorkflow: mocks.createCategory,
  updateBrandThroughCanonicalWorkflow: mocks.updateBrand,
  updateCategoryThroughCanonicalWorkflow: mocks.updateCategory,
  deleteBrandThroughCanonicalWorkflow: mocks.deleteBrand,
  deleteCategoryThroughCanonicalWorkflow: mocks.deleteCategory,
}));
vi.mock('./storefront-revalidate', () => ({
  revalidateStorefrontProductMeta: mocks.revalidate,
}));

import { manageAdminAiTaxonomy } from './admin-ai-taxonomy';
import { CategoryHierarchyError } from './category-hierarchy';
import { TaxonomyMutationNotFoundError } from './taxonomy-mutations';

describe('admin AI taxonomy operations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('directly creates the requested active brand and refreshes storefront metadata', async () => {
    mocks.createBrand.mockResolvedValue({
      kind: 'brand',
      id: 8,
      name: 'Atelier Pro',
      slug: 'atelier-pro',
      status: 'active',
    });
    const actor = { email: 'admin@example.com', name: 'Admin' };

    await expect(
      manageAdminAiTaxonomy(
        {
          operation: 'create',
          entity: { kind: 'brand', data: { name: 'Atelier Pro', status: 'active' } },
        },
        actor,
      ),
    ).resolves.toEqual({
      ok: true,
      operation: 'create',
      result: expect.objectContaining({ id: 8, slug: 'atelier-pro', status: 'active' }),
    });
    expect(mocks.createBrand).toHaveBeenCalledWith(
      'database',
      { name: 'Atelier Pro', imageUrl: null, status: 'active' },
      actor,
    );
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });

  it('updates category hierarchy through the canonical cycle check', async () => {
    mocks.updateCategory.mockResolvedValue({
      kind: 'category',
      id: 7,
      changes: { parentId: 3, nameAr: 'أدوات' },
    });

    const result = await manageAdminAiTaxonomy({
      operation: 'update',
      entity: { kind: 'category', id: 7, changes: { parentId: 3, nameAr: 'أدوات' } },
    });

    expect(result).toMatchObject({ ok: true, operation: 'update', result: { id: 7 } });
    expect(mocks.updateCategory).toHaveBeenCalledWith(
      'database',
      7,
      { parentId: 3, nameAr: 'أدوات' },
      undefined,
    );
  });

  it('reports missing deletes and hierarchy conflicts without claiming persistence', async () => {
    mocks.deleteBrand.mockRejectedValue(new TaxonomyMutationNotFoundError('brand', 99));
    mocks.updateCategory.mockRejectedValue(
      new CategoryHierarchyError('A category cannot be its own parent.', 'self_parent'),
    );

    await expect(
      manageAdminAiTaxonomy({
        operation: 'delete',
        entity: { kind: 'brand', id: 99 },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'taxonomy_not_found' } });
    await expect(
      manageAdminAiTaxonomy({
        operation: 'update',
        entity: { kind: 'category', id: 7, changes: { parentId: 7 } },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'self_parent' } });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
