import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  create: vi.fn(),
  replace: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./admin-assets-data', () => ({ loadAssetsData: mocks.load }));
vi.mock('./asset-mutations', () => ({
  createAdminAsset: mocks.create,
  patchAdminAsset: mocks.replace,
  deleteAdminAsset: mocks.remove,
  reorderAdminAssets: mocks.reorder,
}));

import {
  adminAiAssetCrudSchema,
  inspectAdminAiAssets,
  manageAdminAiAsset,
  reorderAdminAiAssets,
} from './admin-ai-assets';

const assets = {
  banners: [
    {
      id: 1,
      title: 'Atelier',
      titleAr: 'ورشة',
      imageUrl: 'https://cdn.example.com/wide.jpg',
      imageUrlLandscape: 'https://cdn.example.com/wide.jpg',
      imageUrlPortrait: 'https://cdn.example.com/tall.jpg',
      productId: null,
      active: true,
      sortOrder: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 2,
      title: 'Rangement',
      titleAr: 'تخزين',
      imageUrl: 'https://cdn.example.com/storage-wide.jpg',
      imageUrlLandscape: 'https://cdn.example.com/storage-wide.jpg',
      imageUrlPortrait: 'https://cdn.example.com/storage-tall.jpg',
      productId: 18,
      active: false,
      sortOrder: 1,
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    },
  ],
  featuredGroups: [
    {
      id: 7,
      name: 'Sélection atelier',
      nameAr: 'اختيار الورشة',
      cta: 'Voir',
      ctaAr: 'شاهد',
      link: '/fr/products',
      productIds: [12],
      brandIds: [],
      categoryIds: [3],
      prioritizeRecommendations: true,
      active: true,
      sortOrder: 0,
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    },
  ],
  productCards: [
    {
      id: 9,
      productId: 12,
      titleAr: 'مثقاب',
      titleFr: 'Perceuse',
      descriptionAr: 'وصف المنتج',
      descriptionFr: 'Description produit',
      characteristicsAr: ['قوي', 'خفيف', 'عملي'],
      characteristicsFr: ['Puissante', 'Légère', 'Pratique'],
      active: true,
      sortOrder: 0,
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    },
  ],
};

describe('Admin AI assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue(assets);
  });

  it('inspects a bounded surface with active-state counts and exact missing IDs', async () => {
    await expect(
      inspectAdminAiAssets({ kind: 'banner', ids: [1, 99], active: true, limit: 10 }),
    ).resolves.toEqual({
      kind: 'admin_assets',
      banners: {
        counts: { total: 2, active: 1, inactive: 1, matched: 1, returned: 1 },
        items: [assets.banners[0]],
        requestedIds: [1, 99],
        missingIds: [99],
      },
    });
  });

  it('forwards named fields and reports the canonical mutation receipt', async () => {
    const actor = { email: 'admin@example.com', name: 'Admin' };
    mocks.replace.mockImplementation(async (_db, kind, id, data) => ({
      kind,
      id,
      data,
      previous: { title: 'Operator title' },
    }));

    const result = await manageAdminAiAsset(
      {
        operation: 'update',
        asset: {
          kind: 'banner',
          id: 1,
          changes: {
            title: 'Nouvel atelier',
            imageUrlLandscape: 'https://cdn.example.com/new-wide.jpg',
          },
        },
      },
      actor,
    );

    expect(mocks.replace).toHaveBeenCalledWith(
      'database',
      'banner',
      1,
      {
        title: 'Nouvel atelier',
        imageUrlLandscape: 'https://cdn.example.com/new-wide.jpg',
      },
      actor,
    );
    expect(result).toMatchObject({
      ok: true,
      operation: 'update',
      previous: { title: 'Operator title' },
      data: { title: 'Nouvel atelier' },
    });
  });

  it('does not materialize defaults or clear selections in a one-field update', async () => {
    const actor = { email: 'admin@example.com', name: 'Admin' };
    mocks.replace.mockResolvedValue({
      previous: { categoryIds: [3], active: true },
      data: { categoryIds: [3], active: true, prioritizeRecommendations: false },
    });
    const input = {
      operation: 'update' as const,
      asset: {
        kind: 'featured-group' as const,
        id: 7,
        changes: { prioritizeRecommendations: false },
      },
    };

    expect(adminAiAssetCrudSchema.parse(input).asset).toEqual(input.asset);
    await expect(manageAdminAiAsset(input, actor)).resolves.toMatchObject({
      ok: true,
      previous: { categoryIds: [3], active: true },
      data: { categoryIds: [3], active: true, prioritizeRecommendations: false },
    });
    expect(mocks.replace).toHaveBeenCalledWith(
      'database',
      'featured-group',
      7,
      { prioritizeRecommendations: false },
      actor,
    );
  });

  it('creates and deletes through canonical asset mutations', async () => {
    const actor = { email: 'admin@example.com', name: 'Admin' };
    mocks.create.mockResolvedValue({ kind: 'featured-group', id: 8, sortOrder: 1 });
    mocks.remove.mockResolvedValue({
      kind: 'product-card',
      id: 9,
      deleted: true,
      previous: { productId: 12 },
    });

    await expect(
      manageAdminAiAsset(
        {
          operation: 'create',
          asset: {
            kind: 'featured-group',
            data: {
              name: 'Nouveautés',
              nameAr: 'وصل حديثا',
              productIds: [12],
              brandIds: [],
              categoryIds: [],
              prioritizeRecommendations: false,
              active: true,
            },
          },
        },
        actor,
      ),
    ).resolves.toMatchObject({ ok: true, operation: 'create', id: 8 });
    await expect(
      manageAdminAiAsset({ operation: 'delete', asset: { kind: 'product-card', id: 9 } }, actor),
    ).resolves.toMatchObject({
      ok: true,
      operation: 'delete',
      previous: { productId: 12 },
      deleted: true,
    });
  });

  it('derives canonical sort orders from a complete ordered ID list', async () => {
    mocks.reorder.mockResolvedValue({ ok: true, before: [1, 2] });

    await expect(reorderAdminAiAssets({ kind: 'banner', orderedIds: [2, 1] })).resolves.toEqual({
      ok: true,
      kind: 'banner',
      before: [1, 2],
      after: [2, 1],
    });
    expect(mocks.reorder).toHaveBeenCalledWith(
      'database',
      {
        kind: 'banner',
        items: [
          { id: 2, sortOrder: 0 },
          { id: 1, sortOrder: 1 },
        ],
      },
      undefined,
      true,
    );
  });
});
