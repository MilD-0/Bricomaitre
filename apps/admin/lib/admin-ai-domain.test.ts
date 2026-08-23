import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadOrderDetail: vi.fn(),
  loadOrdersPageData: vi.fn(),
  loadProposalItems: vi.fn(),
  loadAccess: vi.fn(),
  loadRoles: vi.fn(),
  loadBulletin: vi.fn(),
  listLandingPages: vi.fn(),
  searchProducts: vi.fn(),
  readProduct: vi.fn(),
  loadAssets: vi.fn(),
  readBrands: vi.fn(),
  readCategories: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./admin-orders-data', () => ({
  loadOrderDetail: mocks.loadOrderDetail,
  loadOrdersPageData: mocks.loadOrdersPageData,
}));
vi.mock('./ai-proposal-inbox', () => ({
  loadAiProposalAssistantItems: mocks.loadProposalItems,
}));
vi.mock('./admin-administration-data', () => ({
  loadAdministrationAccessGrants: mocks.loadAccess,
  loadAdministrationRoles: mocks.loadRoles,
}));
vi.mock('./bulletin-server', () => ({ loadBulletinData: mocks.loadBulletin }));
vi.mock('./landing-pages', () => ({ listLandingPages: mocks.listLandingPages }));
vi.mock('./admin-assets-data', () => ({
  loadAssetsData: mocks.loadAssets,
  searchAssetProductOptions: mocks.searchProducts,
}));
vi.mock('./product-update-workflow', () => ({
  readProductMutationPayload: mocks.readProduct,
}));
vi.mock('./admin-inventory-data', () => ({ loadInventoryPageData: vi.fn() }));
vi.mock('./brands-categories-api', () => ({
  readBrandsPage: mocks.readBrands,
  readCategoriesPage: mocks.readCategories,
}));

import {
  inspectAdminAdministration,
  inspectAdminAssets,
  inspectAdminBulletin,
  inspectAdminLandingPages,
  inspectAdminOrders,
  inspectAdminProducts,
  inspectAdminProposals,
} from './admin-ai-domain';

describe('admin AI domain adapters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves complete operational order, customer, and staff context', async () => {
    mocks.loadOrderDetail.mockResolvedValue({
      id: 42,
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-21T10:00:00.000Z',
      confirmed: 2,
      noAnswerCount: 1,
      delivery: 0,
      state: 16,
      productSubtotal: 4_000,
      deliveryFee: 500,
      totalAmount: 4_500,
      firstName: 'Private',
      lastName: 'Customer',
      fullName: 'Private Customer',
      email: 'customer@example.com',
      phoneNumber1: '0555000000',
      phoneNumber2: null,
      homeAddress: 'Private address',
      note: 'Private note',
      orderProducts: [
        {
          productId: 9,
          title: 'Drill',
          quantity: 2,
          unitPrice: 2_000,
          lineTotal: 4_000,
          missing: false,
          rawValue: 'private raw value',
        },
      ],
      statusHistory: [
        {
          status: 2,
          noAnswerCount: 1,
          changedAt: '2026-08-21T10:00:00.000Z',
          changedBy: 'staff@example.com',
          changedByName: 'Staff Member',
        },
      ],
    });

    const result = await inspectAdminOrders({ orderIds: [42] });
    expect(result.items[0]).toMatchObject({
      id: 42,
      status: 2,
      totalAmount: 4_500,
      customer: {
        fullName: 'Private Customer',
        email: 'customer@example.com',
        phoneNumber1: '0555000000',
        note: 'Private note',
      },
      delivery: { state: 16, homeAddress: 'Private address' },
      products: [{ productId: 9, title: 'Drill', quantity: 2, rawValue: 'private raw value' }],
      statusHistory: [{ changedBy: 'staff@example.com', changedByName: 'Staff Member' }],
    });
  });

  it('passes only server-selected proposal scopes to the canonical inbox service', async () => {
    mocks.loadProposalItems.mockResolvedValue([{ id: 7 }]);

    await expect(
      inspectAdminProposals({ scopes: ['taxonomy'], proposalIds: [7], query: 'brand', limit: 10 }),
    ).resolves.toEqual([{ id: 7 }]);
    expect(mocks.loadProposalItems).toHaveBeenCalledWith('database', {
      scopes: ['taxonomy'],
      ids: [7],
      search: 'brand',
      limit: 10,
    });
  });

  it('expands resolved product matches into complete canonical mutation records', async () => {
    mocks.searchProducts.mockResolvedValue({
      items: [{ id: 12, title: 'Perceuse', slug: 'perceuse' }],
      page: 1,
      limit: 10,
      total: 1,
    });
    mocks.readProduct.mockResolvedValue({
      title: 'Perceuse',
      slug: 'perceuse',
      price: 12_000,
      purchasePrice: 7_000,
      active: true,
      inStock: true,
      inventoryQuantity: 4,
      promoCodes: [{ code: 'PRO', promoPrice: 11_000, active: true }],
    });

    await expect(inspectAdminProducts({ productIds: [12], limit: 10 })).resolves.toMatchObject({
      items: [
        {
          id: 12,
          title: 'Perceuse',
          price: 12_000,
          purchasePrice: 7_000,
          inventoryQuantity: 4,
          promoCodes: [{ code: 'PRO', promoPrice: 11_000 }],
        },
      ],
      total: 1,
    });
    expect(mocks.readProduct).toHaveBeenCalledWith('database', 12);
  });

  it('checks product duplicates and resolves named taxonomy in one creation read', async () => {
    mocks.searchProducts.mockResolvedValue({ items: [], page: 1, limit: 10, total: 0 });
    mocks.readBrands.mockResolvedValue({
      items: [
        { id: 2, name: 'Bosch', slug: 'bosch', isActive: true, featured: false, productCount: 4 },
      ],
      pagination: { totalItems: 1 },
    });
    mocks.readCategories.mockResolvedValue({
      items: [
        {
          id: 3,
          name: 'Perceuses',
          nameAr: 'مثاقب',
          slug: 'perceuses',
          parentId: null,
          parentName: null,
          isActive: true,
          featured: false,
          productCount: 8,
        },
      ],
      pagination: { totalItems: 1 },
    });

    await expect(
      inspectAdminProducts({
        query: 'Perceuse compacte',
        brandQuery: 'Bosch',
        categoryQuery: 'Perceuses',
      }),
    ).resolves.toMatchObject({
      items: [],
      total: 0,
      taxonomyMatches: {
        brands: { items: [{ id: 2, name: 'Bosch' }], total: 1 },
        categories: { items: [{ id: 3, name: 'Perceuses' }], total: 1 },
      },
    });
  });

  it('resolves asset selection references in the same canonical inspection', async () => {
    mocks.loadAssets.mockResolvedValue({
      banners: [],
      featuredGroups: [{ id: 7, name: 'Sélection atelier' }],
      productCards: [],
    });
    mocks.searchProducts.mockResolvedValue({ items: [{ id: 12, title: 'Perceuse' }], total: 1 });
    mocks.readBrands.mockResolvedValue({
      items: [
        { id: 2, name: 'Bosch', slug: 'bosch', isActive: true, featured: false, productCount: 4 },
      ],
      pagination: { totalItems: 1 },
    });
    mocks.readCategories.mockResolvedValue({
      items: [],
      pagination: { totalItems: 0 },
    });

    await expect(
      inspectAdminAssets({
        kind: 'featuredGroups',
        productQuery: 'Perceuse',
        brandQuery: 'Bosch',
        limit: 10,
      }),
    ).resolves.toMatchObject({
      featuredGroups: [{ id: 7, name: 'Sélection atelier' }],
      matches: {
        products: { items: [{ id: 12, title: 'Perceuse' }] },
        brands: { items: [{ id: 2, name: 'Bosch' }], total: 1 },
        categories: null,
      },
    });
  });

  it('reads complete landing-page documents by exact page or product scope', async () => {
    mocks.listLandingPages.mockResolvedValue([
      {
        id: 5,
        productId: 12,
        productTitle: 'Perceuse',
        locale: 'fr',
        slug: 'perceuse-5',
        status: 'draft',
        draftRevision: 3,
        publishedRevision: null,
        updatedAt: '2026-08-23T00:00:00.000Z',
        document: { blocks: [{ id: 'hero', type: 'product-hero' }] },
      },
      {
        id: 6,
        productId: 18,
        productTitle: 'Scie',
        locale: 'ar',
        slug: 'scie-6',
        document: { blocks: [] },
      },
    ]);

    await expect(
      inspectAdminLandingPages({ landingPageIds: [5, 99], productIds: [12], limit: 10 }),
    ).resolves.toMatchObject({
      items: [
        {
          id: 5,
          productId: 12,
          draftRevision: 3,
          document: { blocks: [{ id: 'hero', type: 'product-hero' }] },
        },
      ],
      requestedLandingPageIds: [5, 99],
      missingLandingPageIds: [99],
    });
  });

  it('returns complete administration and Bulletin identities and content', async () => {
    mocks.loadAccess.mockResolvedValue({
      items: [
        { email: 'employee@example.com', role: 'employee', roleLabel: null },
        { email: 'analyst@example.com', role: 'viewer', roleLabel: 'Analyst' },
      ],
    });
    mocks.loadRoles.mockResolvedValue({
      items: [
        {
          id: 3,
          name: 'Analyst',
          slug: 'analyst',
          description: null,
          permissions: ['analytics_manage'],
        },
      ],
      availablePermissions: ['analytics_manage', 'settings_manage'],
    });
    mocks.loadBulletin.mockResolvedValue({
      availableTags: ['launch'],
      posts: [
        {
          id: 5,
          title: 'Launch plan',
          body: 'Ready for review.',
          tags: ['launch'],
          pinned: true,
          updatedAt: '2026-08-22T10:00:00.000Z',
          author: { name: 'Admin', email: 'admin@example.com' },
          attachments: [{ fileName: 'plan.pdf', fileUrl: 'https://private.example/plan.pdf' }],
          replies: [{ author: { email: 'reply@example.com' } }],
          reactions: [{ emoji: '👍', count: 2, users: [{ email: 'reaction@example.com' }] }],
        },
      ],
    });

    const administration = await inspectAdminAdministration();
    const bulletin = await inspectAdminBulletin({
      viewer: { userId: null, permissions: [] },
      limit: 10,
    });
    expect(administration).toMatchObject({
      accessGrantCount: 2,
      accessGrants: [
        { email: 'employee@example.com', role: 'employee' },
        { email: 'analyst@example.com', roleLabel: 'Analyst' },
      ],
    });
    expect(bulletin.posts[0]).toMatchObject({
      title: 'Launch plan',
      author: { name: 'Admin', email: 'admin@example.com' },
      attachments: [{ fileName: 'plan.pdf', fileUrl: 'https://private.example/plan.pdf' }],
      replies: [{ author: { email: 'reply@example.com' } }],
      reactions: [{ emoji: '👍', count: 2, users: [{ email: 'reaction@example.com' }] }],
    });
  });
});
