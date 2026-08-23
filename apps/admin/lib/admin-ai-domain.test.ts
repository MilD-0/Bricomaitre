import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadOrderDetail: vi.fn(),
  loadOrdersPageData: vi.fn(),
  loadProposalItems: vi.fn(),
  loadAccess: vi.fn(),
  loadRoles: vi.fn(),
  loadBulletin: vi.fn(),
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
vi.mock('./admin-assets-data', () => ({
  loadAssetsData: vi.fn(),
  searchAssetProductOptions: vi.fn(),
}));
vi.mock('./admin-inventory-data', () => ({ loadInventoryPageData: vi.fn() }));
vi.mock('./brands-categories-api', () => ({
  readBrandsPage: vi.fn(),
  readCategoriesPage: vi.fn(),
}));

import {
  inspectAdminAdministration,
  inspectAdminBulletin,
  inspectAdminOrders,
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
      products: [
        { productId: 9, title: 'Drill', quantity: 2, rawValue: 'private raw value' },
      ],
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
