import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: { marker: 'db' },
  loadOrderRecordsByIds: vi.fn(),
  loadOrdersPageData: vi.fn(),
  buildDraft: vi.fn(),
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  applyInventory: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('./admin-orders-data', () => ({
  loadOrderRecordsByIds: mocks.loadOrderRecordsByIds,
  loadOrdersPageData: mocks.loadOrdersPageData,
}));
vi.mock('./shopping-list-drafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shopping-list-drafts')>()),
  buildGeneratedShoppingListDraft: mocks.buildDraft,
}));
vi.mock('./shopping-list-drafts.server', () => ({
  loadAdminShoppingListDraft: mocks.loadDraft,
  saveAdminShoppingListDraft: mocks.saveDraft,
}));
vi.mock('./shopping-list-inventory.server', () => ({
  applyShoppingListInventory: mocks.applyInventory,
}));

import {
  applyAdminAiShoppingListInventory,
  inspectAdminAiShoppingList,
  saveAdminAiShoppingList,
} from './admin-ai-shopping-list';
import type { ShoppingListDraftPayload } from './shopping-list-drafts';

const generatedAt = '2026-08-24T10:00:00.000Z';

function line(
  draftId: string,
  productId: number | null,
  quantity: number,
  inventoryQuantity: number | null,
) {
  const covered = Math.min(quantity, inventoryQuantity ?? 0);
  return {
    draftId,
    productId,
    brandId: productId == null ? null : 2,
    brandName: productId == null ? 'Unbranded' : 'Bosch',
    title: draftId,
    quantity,
    unitPrice: 15_000,
    purchasePrice: productId == null ? null : 9_000,
    thumbnailUrl: null,
    inventoryQuantity,
    inventoryDecreaseQuantity: covered,
    inventoryShortageQuantity: quantity - covered,
    inventoryAppliedQuantity: 0,
    inventoryActionEligible: inventoryQuantity != null && covered > 0,
    notes: [],
    checked: false,
    isCustom: false,
    generatedAt,
  };
}

function payload(): ShoppingListDraftPayload {
  const draftItems = [
    line('2:12', 12, 4, 10),
    line('2:18', 18, 2, 2),
    line('none:old', null, 1, null),
  ];
  return {
    sourceMode: 'confirmed',
    orderIds: [31, 32],
    title: 'Confirmed shopping list',
    generatedItems: draftItems.map((item) => ({ ...item })),
    draftItems,
    orders: [
      {
        orderId: 31,
        customerName: 'Ada',
        note: null,
        generatedAt,
        products: [],
      },
      {
        orderId: 32,
        customerName: 'Grace',
        note: null,
        generatedAt,
        products: [],
      },
    ],
  };
}

function order(id: number) {
  return { id, fullName: `Customer ${id}`, note: null, orderProducts: [] };
}

describe('admin AI order shopping lists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildDraft.mockResolvedValue(payload());
    mocks.loadDraft.mockResolvedValue(null);
    mocks.saveDraft.mockImplementation(async (_db, draft) => ({
      scopeKey: 'status:confirmed',
      revision: 0,
      ...draft,
      updatedAt: generatedAt,
      updatedByName: 'Admin',
    }));
  });

  it('loads every page of a status cohort before building the preview', async () => {
    mocks.loadOrdersPageData.mockImplementation(async ({ page, inHouseStatus }) => ({
      items: page === 1 ? [order(31)] : [order(32)],
      pagination: { page, totalPages: 2 },
      inHouseStatus,
    }));

    const result = await inspectAdminAiShoppingList({
      sourceMode: 'confirmed',
      orderIds: [],
      title: null,
    });

    expect(mocks.loadOrdersPageData).toHaveBeenNthCalledWith(
      1,
      { page: 1, limit: 100, inHouseStatus: 2 },
      false,
    );
    expect(mocks.loadOrdersPageData).toHaveBeenNthCalledWith(
      2,
      { page: 2, limit: 100, inHouseStatus: 2 },
      false,
    );
    expect(mocks.buildDraft).toHaveBeenCalledWith(
      expect.objectContaining({ orders: [order(31), order(32)], sourceMode: 'confirmed' }),
    );
    expect(result.summary).toEqual({
      orderCount: 2,
      lineCount: 3,
      totalUnits: 7,
      inventoryCoveredUnits: 6,
      shortageUnits: 1,
      unmatchedLines: 1,
    });
    expect(result.lines).toHaveLength(3);
    expect(result.linePagination).toEqual({
      page: 1,
      limit: 50,
      totalItems: 3,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
    expect(result).not.toHaveProperty('draft');
  });

  it('searches and paginates compact draft lines without returning the full shared draft', async () => {
    mocks.loadOrdersPageData.mockResolvedValue({
      items: [order(31)],
      pagination: { page: 1, totalPages: 1 },
    });

    const result = await inspectAdminAiShoppingList({
      sourceMode: 'confirmed',
      orderIds: [],
      title: null,
      query: '18',
      page: 1,
      limit: 1,
    });

    expect(result.lines).toEqual([expect.objectContaining({ draftId: '2:18', productId: 18 })]);
    expect(result.linePagination).toMatchObject({ totalItems: 1, totalPages: 1 });
    expect(JSON.stringify(result)).not.toContain('generatedItems');
  });

  it('reports missing selected orders and saves through the shared draft store', async () => {
    mocks.loadOrderRecordsByIds.mockResolvedValue([order(31)]);
    const actor = { email: 'admin@example.com', name: 'Admin' };

    const result = await saveAdminAiShoppingList(
      { sourceMode: 'selected', orderIds: [31, 404], title: 'Supplier run' },
      actor,
    );

    expect(result.missingOrderIds).toEqual([404]);
    expect(mocks.loadOrderRecordsByIds).toHaveBeenCalledOnce();
    expect(mocks.loadOrderRecordsByIds).toHaveBeenCalledWith([31, 404]);
    expect(mocks.saveDraft).toHaveBeenCalledWith(mocks.db, expect.any(Object), actor);
    expect(result).toMatchObject({ ok: true, action: 'created' });
    expect(result).not.toHaveProperty('draft');
  });

  it('applies exact eligible draft lines and reports every non-applicable or rejected line', async () => {
    const draft = payload();
    mocks.loadDraft.mockResolvedValue({
      scopeKey: 'status:confirmed',
      revision: 0,
      ...draft,
      updatedAt: generatedAt,
      updatedByName: 'Admin',
    });
    mocks.applyInventory.mockResolvedValue({
      ok: true,
      complete: false,
      draft: { ...draft, scopeKey: 'status:confirmed', revision: 1 },
      items: [{ productId: 12, previousQuantity: 10, nextQuantity: 6 }],
      skipped: [{ productId: 18, reason: 'insufficient', available: 1 }],
    });

    const result = await applyAdminAiShoppingListInventory({
      sourceMode: 'confirmed',
      orderIds: [],
      selection: 'exact',
      draftIds: ['2:12', '2:18', 'none:old', 'missing:99'],
    });

    expect(mocks.applyInventory).toHaveBeenCalledWith(
      mocks.db,
      {
        requestId: expect.any(String),
        sourceMode: 'confirmed',
        orderIds: [31, 32],
        revision: 0,
        draftIds: ['2:12', '2:18'],
      },
      undefined,
    );
    expect(result).toMatchObject({
      ok: true,
      complete: false,
      applied: [{ productId: 12, previousQuantity: 10, nextQuantity: 6 }],
      skipped: [{ productId: 18, reason: 'insufficient', available: 1 }],
      applicationSummary: {
        appliedLineCount: 1,
        appliedUnits: 4,
        inventoryRejectedCount: 1,
      },
      selectionSkipped: [
        { draftId: 'none:old', productId: null, reason: 'unmatched_product' },
        { draftId: 'missing:99', productId: null, reason: 'missing_draft_line' },
      ],
    });
    expect(result).not.toHaveProperty('draft');
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });
});
