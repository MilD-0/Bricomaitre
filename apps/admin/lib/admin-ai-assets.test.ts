import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  replace: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./asset-mutations', () => ({
  createAdminAsset: mocks.create,
  replaceAdminAsset: mocks.replace,
  deleteAdminAsset: mocks.remove,
}));

import { manageAdminAiAsset } from './admin-ai-assets';

describe('admin AI asset CRUD', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a complete bilingual featured group with resolved selections', async () => {
    mocks.create.mockResolvedValue({ kind: 'featured-group', id: 7, sortOrder: 2 });
    const actor = { email: 'admin@example.com', name: 'Admin' };
    const asset = {
      kind: 'featured-group' as const,
      data: {
        name: 'Sélection atelier',
        nameAr: 'اختيار الورشة',
        cta: 'Voir la sélection',
        ctaAr: 'شاهد الاختيار',
        link: '/fr/products',
        productIds: [12, 18],
        brandIds: [],
        categoryIds: [],
        showAtTopOfProductsPage: true,
        active: false,
      },
    };

    await expect(manageAdminAiAsset({ operation: 'create', asset }, actor)).resolves.toEqual({
      ok: true,
      operation: 'create',
      kind: 'featured-group',
      id: 7,
      sortOrder: 2,
    });
    expect(mocks.create).toHaveBeenCalledWith('database', 'featured-group', asset.data, actor);
  });

  it('replaces and deletes exact inspected assets', async () => {
    const banner = {
      kind: 'banner' as const,
      id: 4,
      data: {
        title: 'Livraison nationale',
        titleAr: 'توصيل وطني',
        imageUrlLandscape: 'https://cdn.example.com/wide.jpg',
        imageUrlPortrait: 'https://cdn.example.com/tall.jpg',
        productId: null,
        active: true,
      },
    };
    mocks.replace.mockResolvedValue({ kind: 'banner', id: 4, data: banner.data });
    mocks.remove.mockResolvedValue({ kind: 'product-card', id: 9, deleted: true });

    await expect(
      manageAdminAiAsset({ operation: 'replace', asset: banner }),
    ).resolves.toMatchObject({ ok: true, operation: 'replace', kind: 'banner', id: 4 });
    await expect(
      manageAdminAiAsset({
        operation: 'delete',
        asset: { kind: 'product-card', id: 9 },
      }),
    ).resolves.toEqual({
      ok: true,
      operation: 'delete',
      kind: 'product-card',
      id: 9,
      deleted: true,
    });
  });
});
