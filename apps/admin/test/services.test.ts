import { getLiveStorefrontAiStats } from '../lib/stats-experience-ai';
import { loadMetaPerformance } from '../lib/analytics/acquisition-data';
import { resolveAnalyticsFilters } from '../lib/analytics/date-range';
import { analyticsQuerySchema } from '../lib/analytics/contract';
import { getProfitTrackerReport } from '../lib/profit-tracker';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  adminMutationIdempotency,
  analyticsDailyRollups,
  analyticsJourneys,
  analyticsSessions,
  brands,
  bulletinPostAttachments,
  bulletinPostReactions,
  bulletinPosts,
  bulletinPostTags,
  bulletinReplies,
  bulletinReplyReactions,
  bulletinTags,
  categories,
  ecotrackOrderStates,
  importBatches,
  orderAcquisitionAttribution,
  orderAiInfluence,
  orderLineItems,
  orders,
  processedOrders,
  productPromoCodes,
  products,
  shoppingListDrafts,
  storefrontOrderIdempotency,
} from '@bric/db/schema';
import { applyRateLimit } from '@bric/runtime/rate-limit';
import { getRedis } from '@bric/runtime/redis';
import {
  ingestStorefrontAnalyticsEvent,
  type StorefrontAnalyticsEvent,
} from '@bric/storefront-core/analytics';
import { storefrontOrderCreateRequestSchema } from '@bric/storefront-core/contracts';
import {
  deleteExpiredAnalyticsEventsBatch,
  deleteExpiredAnalyticsSessionsBatch,
  deleteExpiredOrderIdempotencyBatch,
  rollUpNextExpiredAnalyticsDay,
} from '@bric/storefront-core/maintenance';
import {
  buildIdempotencyFingerprint,
  claimStorefrontOrderIdempotency,
} from '@bric/storefront-core/order-idempotency';
import { createStorefrontOrder, readStorefrontOrderByToken } from '@bric/storefront-core/orders';
import { dayInTimezone } from '../lib/analytics/date-range';

import { applyHistoryAction, getActionEntityConfig } from '../lib/action-history';
import { queryAdminOrders } from '../lib/admin-ai-order-query';
import { loadActiveShipmentPageRows } from '../lib/admin-ecotrack-shipment-view';
import { loadOrdersPageData } from '../lib/admin-orders-data';
import { getAnalyticsSnapshot } from '../lib/analytics-snapshots';
import {
  createBulletinReply,
  deleteBulletinPost,
  setBulletinPostReaction,
  setBulletinReplyReaction,
} from '../lib/bulletin-mutations';
import { parseEcotrackShipmentListQuery } from '../lib/ecotrack-shipment-list';
import { getReportingDb } from '../lib/reporting-db';
import { getStorefrontExperienceStats } from '../lib/stats-experience';
import { ADMIN_REPORTING_TIMEZONE } from '../lib/stats-experience-shared';
import { buildWebsiteProductMetricsQuery } from '../lib/stats-live-commerce';
import { deleteImportBatch, importStatsSpreadsheet } from '../lib/stats-order-import';

import {
  buildGeneratedShoppingListDraft,
  mergeShoppingListDraft,
} from '../lib/shopping-list-drafts';
import {
  resetAdminShoppingListDraft,
  saveAdminShoppingListDraft,
  ShoppingListDraftConflictError,
} from '../lib/shopping-list-drafts.server';
import { applyShoppingListInventory } from '../lib/shopping-list-inventory.server';
vi.mock('../lib/server-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/server-cache')>()),
  revalidateServerTags: vi.fn(),
}));
vi.mock('../lib/storefront-revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/storefront-revalidate')>()),
  revalidateStorefrontProducts: vi.fn(),
}));

const runId = randomUUID();

describe('real PostgreSQL and Redis contracts', () => {
  afterAll(async () => {
    await Promise.allSettled([getRedis().quit(), getPool().end(), getReportingDb().$client.end()]);
  });

  it('queues snapshot queries separately from interactive reads with two nonparallel connections', async () => {
    const reporting = getReportingDb();
    const held = await Promise.all([reporting.$client.connect(), reporting.$client.connect()]);
    const computation = getAnalyticsSnapshot(
      { view: 'storefront', range: '7d', grain: 'auto' },
      { refresh: true, remember: false },
    );
    try {
      await vi.waitFor(() => expect(reporting.$client.waitingCount).toBeGreaterThan(0));
      expect(reporting.$client.totalCount).toBe(2);
      const interactive = await getDb().execute(sql`select 42 as value`);
      expect(interactive.rows).toEqual([{ value: 42 }]);
    } finally {
      held.forEach((connection) => connection.release());
    }
    const result = await computation;
    expect(result.filters.range).toBe('7d');
    expect(result.data.kind).toBe('storefront');
    const settings = await reporting.execute(sql`
      select current_setting('max_parallel_workers_per_gather') as parallel,
        current_setting('application_name') as application
    `);
    expect(settings.rows).toEqual([{ parallel: '0', application: 'bric-admin-reporting' }]);
    const analytics = await getAnalyticsSnapshot(
      { view: 'storefront', range: '7d', grain: 'auto' },
      { refresh: true, remember: false },
    );
    expect(analytics.diagnostics.cache?.state).toBe('miss');
    expect(reporting.$client.totalCount).toBe(2);
  });

  it('saves loads and resets a thousand-order selected scope with a bounded database identity', async () => {
    const { loadAdminShoppingListDraft } = await import('../lib/shopping-list-drafts.server');
    const { buildShoppingListScopeKey } = await import('../lib/shopping-list-drafts');
    const db = getDb();
    const created = await db
      .insert(orders)
      .values(
        Array.from({ length: 1000 }, (_, i) => ({
          firstName: `${runId}-scope-${i}`,
          phoneNumber1: '0661920628',
        })),
      )
      .returning({ id: orders.id });
    const ids = created.map(({ id }) => id);
    const scopeKey = buildShoppingListScopeKey('selected', ids);
    try {
      const generated = await buildGeneratedShoppingListDraft({
        sourceMode: 'selected',
        title: `${runId}-large-selection`,
        orders: ids.map((id) => ({
          id,
          fullName: 'Large selection',
          note: null,
          orderProducts: [],
        })),
        resolveProductDetails: async () => null,
        resolveBrandName: async () => 'Unbranded',
      });
      const saved = await saveAdminShoppingListDraft(db, { ...generated, revision: null });
      expect(saved.scopeKey).toBe(scopeKey);
      expect(saved.scopeKey).toHaveLength(80);
      const loaded = await loadAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: [...ids].reverse(),
      });
      expect(loaded?.orderIds).toEqual([...ids].sort((a, b) => a - b));
      expect(loaded?.orders).toHaveLength(1000);
      const reset = await resetAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: ids,
        revision: saved.revision,
      });
      expect(reset.scopeKey).toBe(scopeKey);
      expect(reset.orderIds).toEqual(saved.orderIds);
      expect(reset.revision).toBe(saved.revision + 1);
      await expect(
        resetAdminShoppingListDraft(db, {
          sourceMode: 'selected',
          orderIds: ids,
          revision: saved.revision,
        }),
      ).rejects.toBeInstanceOf(ShoppingListDraftConflictError);
    } finally {
      await db.delete(shoppingListDrafts).where(eq(shoppingListDrafts.scopeKey, scopeKey));
      await db.delete(orders).where(inArray(orders.id, ids));
    }
  });

  it('preserves multiple product offers through public order creation and operator repricing', async () => {
    const { updateAdminOrder } = await import('../lib/admin-order-update');
    const { resolveOrderCommercialState, UnorderableCartError } =
      await import('@bric/storefront-core/order-commercial');
    const db = getDb();
    const catalog = await db
      .insert(products)
      .values([
        {
          title: `${runId}-offer-a`,
          slug: `${runId}-offer-a`,
          price: '1000',
          active: true,
          inStock: true,
        },
        {
          title: `${runId}-offer-b`,
          slug: `${runId}-offer-b`,
          price: '2000',
          active: true,
          inStock: true,
        },
      ])
      .returning();
    const a = catalog[0]!.id,
      b = catalog[1]!.id;
    const productPromos = [
      { productId: a, code: 'SHARED' },
      { productId: b, code: 'B' },
    ];
    const createdIds: number[] = [];
    await db.insert(productPromoCodes).values([
      { productId: a, code: 'SHARED', normalizedCode: 'shared', promoPrice: '800' },
      { productId: b, code: 'B', normalizedCode: 'b', promoPrice: '1500' },
      { productId: b, code: 'SHARED', normalizedCode: 'shared', promoPrice: '1' },
    ]);
    try {
      for (const cartProducts of [
        [String(a), String(b)],
        [String(b), String(a)],
      ]) {
        const { item: order } = await createStorefrontOrder(
          db,
          storefrontOrderCreateRequestSchema.parse({
            phoneNumber1: '0550000991',
            cartProducts,
            productPromos,
            expectedProductSubtotal: 2300,
          }),
        );
        createdIds.push(order.id);
        expect(order.productSubtotal).toBe(2300);
        expect(order.productPromos).toEqual(expect.arrayContaining(productPromos));
        expect(order.orderProducts.map((line) => line.unitPrice).sort((x, y) => x - y)).toEqual([
          800, 1500,
        ]);
      }
      const updated = await updateAdminOrder(
        db,
        createdIds[0]!,
        { cartProducts: [String(a), String(b), String(b)] },
        { email: `offers-${runId}@example.com` },
      );
      expect(updated.productSubtotal).toBe(3800);
      const [stored] = await db.select().from(orders).where(eq(orders.id, createdIds[0]!));
      expect(stored!.productPromos).toEqual(expect.arrayContaining(productPromos));
      expect(Number(stored!.productSubtotal)).toBe(3800);
      const lines = await db
        .select()
        .from(orderLineItems)
        .where(eq(orderLineItems.orderId, createdIds[0]!));
      expect(lines.find((line) => line.productId === b)).toMatchObject({
        quantity: 2,
        effectiveUnitPrice: '1500.00',
        discountAmount: '1000.00',
      });
      await db
        .update(productPromoCodes)
        .set({ active: false })
        .where(and(eq(productPromoCodes.productId, b), eq(productPromoCodes.normalizedCode, 'b')));
      await expect(
        createStorefrontOrder(
          db,
          storefrontOrderCreateRequestSchema.parse({
            phoneNumber1: '0550000991',
            cartProducts: [String(a), String(b)],
            productPromos,
            expectedProductSubtotal: 2300,
          }),
        ),
      ).rejects.toBeInstanceOf(UnorderableCartError);
      const wrongPair = await resolveOrderCommercialState(db, {
        cartProducts: [String(a)],
        productPromos: [{ productId: a, code: 'B' }],
        requireOrderable: true,
      });
      expect(wrongPair.productSubtotal).toBe(1000);
      expect(wrongPair.productPromos).toEqual([]);
    } finally {
      if (createdIds.length) await db.delete(orders).where(inArray(orders.id, createdIds));
      await db.delete(actionLogs).where(eq(actionLogs.createdBy, `offers-${runId}@example.com`));
      await db.delete(products).where(inArray(products.id, [a, b]));
    }
  });

  it('atomically bounds shopping deductions across concurrent requests, retries, reopen and quantity increases', async () => {
    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({ title: runId, slug: `inventory-${runId}`, price: '10', inventoryQuantity: 10 })
      .returning();
    const [order] = await db
      .insert(orders)
      .values({ firstName: runId, phoneNumber1: '0661920628' })
      .returning();
    await db.insert(orderLineItems).values({
      orderId: order!.id,
      productId: product!.id,
      contentId: String(product!.id),
      rawValue: String(product!.id),
      titleSnapshot: runId,
      originalUnitPrice: '10',
      effectiveUnitPrice: '10',
      quantity: 2,
      lineTotal: '20',
    });
    let scopeKey = '';
    const requestPrefix = `inventory-${runId}`;
    try {
      const generated = await buildGeneratedShoppingListDraft({
        sourceMode: 'selected',
        title: 'Audit inventory',
        orders: [
          {
            id: order!.id,
            fullName: 'Audit',
            note: null,
            orderProducts: [
              {
                productId: product!.id,
                rawValue: String(product!.id),
                title: runId,
                unitPrice: 10,
                quantity: 2,
                lineTotal: 20,
                thumbnailUrl: null,
                missing: false,
              },
            ],
          },
        ],
        resolveProductDetails: async () => ({ inventoryQuantity: 10, purchasePrice: null }),
        resolveBrandName: async () => 'Unbranded',
      });
      const draft = await saveAdminShoppingListDraft(db, {
        ...generated,
        revision: null,
        draftItems: generated.draftItems.map((item) => ({
          ...item,
          inventoryManualAppliedQuantity: 999,
          inventoryLegacyAppliedQuantity: 999,
          inventoryOrderAppliedQuantity: 999,
          inventoryAppliedQuantity: 999,
        })),
      });
      expect(draft.draftItems[0]!.inventoryAppliedQuantity).toBe(0);
      scopeKey = draft.scopeKey;
      const input = {
        sourceMode: draft.sourceMode,
        orderIds: draft.orderIds,
        revision: draft.revision,
        draftIds: draft.draftItems.map((item) => item.draftId),
        requestId: `${requestPrefix}-one`,
      };
      const concurrent = await Promise.allSettled([
        applyShoppingListInventory(db, input),
        applyShoppingListInventory(db, { ...input, requestId: `${requestPrefix}-two` }),
      ]);
      expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = concurrent.find(
        (result) => result.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ShoppingListDraftConflictError);
      const first = concurrent.find(
        (result) => result.status === 'fulfilled',
      ) as PromiseFulfilledResult<Awaited<ReturnType<typeof applyShoppingListInventory>>>;
      const successfulId =
        concurrent[0]!.status === 'fulfilled' ? input.requestId : `${requestPrefix}-two`;
      const retry = await applyShoppingListInventory(db, { ...input, requestId: successfulId });
      expect(retry).toEqual(first.value);
      const repeat = await applyShoppingListInventory(db, {
        ...input,
        revision: retry.draft.revision,
        requestId: `${requestPrefix}-repeat`,
      });
      expect(repeat.items).toEqual([]);
      expect(
        (await db.select().from(products).where(eq(products.id, product!.id)))[0]!
          .inventoryQuantity,
      ).toBe(8);
      const increased = await saveAdminShoppingListDraft(db, {
        ...repeat.draft,
        draftItems: repeat.draft.draftItems.map((item) => ({
          ...item,
          quantity: 5,
          inventoryDecreaseQuantity: 3,
        })),
      });
      const extra = await applyShoppingListInventory(db, {
        ...input,
        revision: increased.revision,
        requestId: `${requestPrefix}-extra`,
      });
      expect(extra.items[0]).toMatchObject({ previousQuantity: 8, nextQuantity: 5 });
      expect(extra.draft.draftItems[0]).toMatchObject({
        inventoryAppliedQuantity: 5,
        inventoryDecreaseQuantity: 0,
      });
      const reset = await resetAdminShoppingListDraft(db, {
        ...input,
        revision: extra.draft.revision,
      });
      const resetApply = await applyShoppingListInventory(db, {
        ...input,
        revision: reset.revision,
        requestId: `${requestPrefix}-reset`,
      });
      expect(resetApply.items).toEqual([]);
      const removed = await saveAdminShoppingListDraft(db, { ...resetApply.draft, draftItems: [] });
      expect(removed.generatedItems[0]!.inventoryAppliedQuantity).toBe(5);
      const readded = await saveAdminShoppingListDraft(db, {
        ...removed,
        draftItems: [
          {
            ...generated.draftItems[0]!,
            draftId: `custom:${product!.id}`,
            quantity: 5,
            inventoryAppliedQuantity: 0,
            inventoryDecreaseQuantity: 5,
            isCustom: true,
          },
        ],
      });
      expect(readded.draftItems[0]).toMatchObject({
        inventoryAppliedQuantity: 5,
        inventoryDecreaseQuantity: 0,
      });
      const reapply = await applyShoppingListInventory(db, {
        ...input,
        draftIds: readded.draftItems.map((item) => item.draftId),
        revision: readded.revision,
        requestId: `${requestPrefix}-readd`,
      });
      expect(reapply.items).toEqual([]);
      const duplicated = await saveAdminShoppingListDraft(db, {
        ...reapply.draft,
        draftItems: [
          {
            ...readded.draftItems[0]!,
            draftId: 'duplicate:first',
            quantity: 3,
            inventoryAppliedQuantity: 5,
            inventoryDecreaseQuantity: 3,
          },
          {
            ...readded.draftItems[0]!,
            draftId: 'duplicate:second',
            quantity: 2,
            inventoryAppliedQuantity: 5,
            inventoryDecreaseQuantity: 2,
          },
        ],
      });
      expect(duplicated.draftItems.map((item) => item.inventoryAppliedQuantity)).toEqual([3, 2]);
      const reordered = await saveAdminShoppingListDraft(db, {
        ...duplicated,
        draftItems: [...duplicated.draftItems].reverse(),
      });
      expect(reordered.draftItems.map((item) => item.inventoryAppliedQuantity)).toEqual([2, 3]);
      const ledgerOnly = await saveAdminShoppingListDraft(db, {
        ...reordered,
        generatedItems: [],
        draftItems: [],
      });
      expect(ledgerOnly.generatedItems[0]).toMatchObject({
        inventoryAppliedQuantity: 5,
        inventoryLedgerOnly: true,
      });
      const resetLedger = await resetAdminShoppingListDraft(db, {
        ...input,
        revision: ledgerOnly.revision,
      });
      expect(resetLedger.draftItems).toEqual([]);
      expect(resetLedger.generatedItems[0]!.inventoryAppliedQuantity).toBe(5);
      expect(
        (await db.select().from(products).where(eq(products.id, product!.id)))[0]!
          .inventoryQuantity,
      ).toBe(5);
    } finally {
      if (scopeKey)
        await db.delete(shoppingListDrafts).where(eq(shoppingListDrafts.scopeKey, scopeKey));
      await db.delete(adminMutationIdempotency).where(
        inArray(
          adminMutationIdempotency.requestId,
          ['one', 'two', 'repeat', 'extra', 'reset', 'readd'].map(
            (suffix) => `${requestPrefix}-${suffix}`,
          ),
        ),
      );
      await db
        .delete(actionLogs)
        .where(and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, product!.id)));
      await db.delete(orders).where(eq(orders.id, order!.id));
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });

  it('deducts overlapping order requirements once while keeping manual extras scoped', async () => {
    const { orderInventoryAllocations } = await import('@bric/db/schema');
    const { loadAdminShoppingListDraft } = await import('../lib/shopping-list-drafts.server');
    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({
        title: `overlap-${runId}`,
        slug: `overlap-${runId}`,
        price: '10',
        inventoryQuantity: 50,
      })
      .returning();
    const created = await db
      .insert(orders)
      .values([1, 2, 3].map((i) => ({ firstName: `${runId}-${i}`, phoneNumber1: '0661920628' })))
      .returning();
    const ids = created.map((order) => order.id);
    const scopes: string[] = [];
    const requests: string[] = [];
    const build = async (
      orderIds: number[],
      sourceMode: 'selected' | 'posted' | 'dispatched' = 'selected',
    ) =>
      buildGeneratedShoppingListDraft({
        sourceMode,
        title: `overlap-${runId}`,
        orders: orderIds.map((id) => ({
          id,
          fullName: 'Overlap',
          note: null,
          orderProducts: [
            {
              productId: product!.id,
              rawValue: String(product!.id),
              title: product!.title,
              quantity: 2,
              unitPrice: 10,
              lineTotal: 20,
              thumbnailUrl: null,
              missing: false,
            },
          ],
        })),
        resolveProductDetails: async () => ({ inventoryQuantity: 50, purchasePrice: null }),
        resolveBrandName: async () => 'Unbranded',
      });
    const save = async (
      orderIds: number[],
      sourceMode: 'selected' | 'posted' | 'dispatched' = 'selected',
    ) => {
      const d = await saveAdminShoppingListDraft(db, {
        ...(await build(orderIds, sourceMode)),
        revision: null,
      });
      scopes.push(d.scopeKey);
      return d;
    };
    const apply = async (d: Awaited<ReturnType<typeof save>>) => {
      const requestId = randomUUID();
      requests.push(requestId);
      return applyShoppingListInventory(db, {
        sourceMode: d.sourceMode,
        orderIds: d.orderIds,
        revision: d.revision,
        draftIds: d.draftItems.map((item) => item.draftId),
        requestId,
      });
    };
    try {
      await db.insert(orderLineItems).values(
        ids.map((orderId) => ({
          orderId,
          productId: product!.id,
          contentId: String(product!.id),
          rawValue: String(product!.id),
          titleSnapshot: product!.title,
          originalUnitPrice: '10',
          effectiveUnitPrice: '10',
          quantity: 2,
          lineTotal: '20',
        })),
      );
      let a = await save([ids[0]!]);
      a = await saveAdminShoppingListDraft(db, {
        ...a,
        draftItems: a.draftItems.map((item) => ({ ...item, inventoryDecreaseQuantity: 1 })),
      });
      await apply(a);
      const ab = await save([ids[0]!, ids[1]!]);
      const bc = await save([ids[1]!, ids[2]!]);
      const concurrent = await Promise.all([apply(ab), apply(bc)]);
      expect(
        concurrent.reduce(
          (sum, result) =>
            sum +
            result.items.reduce((n, item) => n + item.previousQuantity - item.nextQuantity, 0),
          0,
        ),
      ).toBe(5);
      expect(
        (await db.select().from(products).where(eq(products.id, product!.id)))[0]!
          .inventoryQuantity,
      ).toBe(44);
      expect(
        (
          await db
            .select()
            .from(orderInventoryAllocations)
            .where(inArray(orderInventoryAllocations.orderId, ids))
        ).map((row) => row.quantity),
      ).toEqual([2, 2, 2]);
      for (const sourceMode of ['posted', 'dispatched'] as const) {
        const [existing] = await db
          .select()
          .from(shoppingListDrafts)
          .where(eq(shoppingListDrafts.scopeKey, `status:${sourceMode}`));
        if (existing) continue;
        const status = await save(ids, sourceMode);
        expect((await apply(status)).items).toEqual([]);
      }
      let reloaded = (await loadAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: [ids[0]!],
      }))!;
      expect(reloaded.draftItems[0]!.inventoryQuantity).toBe(44);
      reloaded = await saveAdminShoppingListDraft(db, {
        ...reloaded,
        draftItems: reloaded.draftItems.map((item) => ({
          ...item,
          quantity: 3,
          inventoryDecreaseQuantity: 1,
        })),
      });
      const extra = await apply(reloaded);
      expect(extra.items[0]).toMatchObject({ previousQuantity: 44, nextQuantity: 43 });
      expect(extra.draft.generatedItems[0]).toMatchObject({
        inventoryOrderAppliedQuantity: 2,
        inventoryManualAppliedQuantity: 1,
      });
      const reset = await resetAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: [ids[0]!],
        revision: extra.draft.revision,
      });
      expect((await apply(reset)).items).toEqual([]);
      await db
        .update(orderLineItems)
        .set({ quantity: 3, lineTotal: '30' })
        .where(and(eq(orderLineItems.orderId, ids[1]!), eq(orderLineItems.productId, product!.id)));
      const edited = await save([ids[1]!]);
      const increased = await saveAdminShoppingListDraft(db, {
        ...edited,
        draftItems: edited.draftItems.map((item) => ({
          ...item,
          quantity: 3,
          inventoryDecreaseQuantity: 1,
        })),
      });
      expect((await apply(increased)).items[0]).toMatchObject({
        previousQuantity: 43,
        nextQuantity: 42,
      });
      await db.delete(orders).where(eq(orders.id, ids[0]!));
      const deletedOrderDraft = (await loadAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: [ids[0]!],
      }))!;
      expect((await apply(deletedOrderDraft)).items).toEqual([]);
      expect(
        (
          await db
            .select()
            .from(orderInventoryAllocations)
            .where(eq(orderInventoryAllocations.orderId, ids[0]!))
        )[0]!.quantity,
      ).toBe(2);
    } finally {
      if (scopes.length)
        await db.delete(shoppingListDrafts).where(inArray(shoppingListDrafts.scopeKey, scopes));
      if (requests.length)
        await db
          .delete(adminMutationIdempotency)
          .where(inArray(adminMutationIdempotency.requestId, requests));
      await db
        .delete(actionLogs)
        .where(and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, product!.id)));
      await db.delete(orders).where(inArray(orders.id, ids));
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });

  it('refreshes changing status cohorts and applies each order product only once', async () => {
    const { orderInventoryAllocations } = await import('@bric/db/schema');
    const rollback = new Error('shopping refresh fixture rollback');
    await expect(
      getDb().transaction(async (tx) => {
        const db = tx as unknown as ReturnType<typeof getDb>;
        // Isolate this status scope inside a transaction that always rolls back.
        await tx
          .delete(shoppingListDrafts)
          .where(eq(shoppingListDrafts.scopeKey, 'status:confirmed'));
        const [product] = await tx
          .insert(products)
          .values({
            title: `Refresh ${runId}`,
            slug: `refresh-${runId}`,
            price: '10',
            inventoryQuantity: 20,
          })
          .returning();
        const cohort = await tx
          .insert(orders)
          .values(
            [1, 2, 3].map((i) => ({
              firstName: `refresh-${runId}-${i}`,
              phoneNumber1: '0661920628',
            })),
          )
          .returning();
        await tx.insert(orderLineItems).values(
          cohort.map((order) => ({
            orderId: order.id,
            productId: product!.id,
            contentId: String(product!.id),
            rawValue: String(product!.id),
            titleSnapshot: product!.title,
            originalUnitPrice: '10',
            effectiveUnitPrice: '10',
            quantity: 2,
            lineTotal: '20',
          })),
        );
        const generate = (ids: number[]) =>
          buildGeneratedShoppingListDraft({
            sourceMode: 'confirmed',
            title: 'Refresh verification',
            orders: ids.map((id) => ({
              id,
              fullName: 'Refresh',
              note: null,
              orderProducts: [
                {
                  productId: product!.id,
                  rawValue: String(product!.id),
                  title: product!.title,
                  quantity: 2,
                  unitPrice: 10,
                  lineTotal: 20,
                  thumbnailUrl: null,
                  missing: false,
                },
              ],
            })),
            resolveProductDetails: async () => ({ inventoryQuantity: 20, purchasePrice: null }),
            resolveBrandName: async () => 'Unbranded',
          });
        let draft = await saveAdminShoppingListDraft(db, {
          ...(await generate([cohort[0]!.id])),
          revision: null,
        });
        const apply = () =>
          applyShoppingListInventory(db, {
            sourceMode: draft.sourceMode,
            orderIds: draft.orderIds,
            revision: draft.revision,
            draftIds: draft.draftItems.map((item) => item.draftId),
            requestId: randomUUID(),
          });
        draft = (await apply()).draft;
        expect(draft.draftItems[0]!.inventoryAppliedQuantity).toBe(2);
        const refresh = async (ids: number[]) => {
          draft = await saveAdminShoppingListDraft(db, {
            ...mergeShoppingListDraft(await generate(ids), draft),
            revision: draft.revision,
          });
        };
        await refresh([cohort[0]!.id, cohort[1]!.id]);
        expect(draft.draftItems[0]).toMatchObject({
          quantity: 4,
          inventoryAppliedQuantity: 2,
          inventoryDecreaseQuantity: 2,
        });
        const growth = await apply();
        expect(growth.items[0]).toMatchObject({ previousQuantity: 18, nextQuantity: 16 });
        draft = growth.draft;
        // Replace a consumed order with a new order, leaving total demand unchanged.
        await refresh([cohort[1]!.id, cohort[2]!.id]);
        expect(draft.orders.map((order) => order.orderId)).toEqual([cohort[1]!.id, cohort[2]!.id]);
        expect(draft.draftItems[0]).toMatchObject({
          quantity: 4,
          inventoryAppliedQuantity: 2,
          inventoryDecreaseQuantity: 2,
        });
        const replacement = await apply();
        expect(replacement.items[0]).toMatchObject({ previousQuantity: 16, nextQuantity: 14 });
        draft = replacement.draft;
        await refresh([cohort[1]!.id, cohort[2]!.id]);
        const repeat = await apply();
        expect(repeat.items).toEqual([]);
        draft = repeat.draft;
        await refresh([]);
        expect(draft.draftItems).toEqual([]);
        const [remaining] = await tx.select().from(products).where(eq(products.id, product!.id));
        expect(remaining!.inventoryQuantity).toBe(14);
        const allocations = await tx
          .select()
          .from(orderInventoryAllocations)
          .where(eq(orderInventoryAllocations.productId, product!.id));
        expect(allocations).toHaveLength(3);
        expect(allocations.every((allocation) => allocation.quantity === 2)).toBe(true);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('preserves legacy deductions and lets an operator attribute ambiguous partials without changing stock', async () => {
    const { orderInventoryAllocations } = await import('@bric/db/schema');
    const { loadAdminShoppingListDraft } = await import('../lib/shopping-list-drafts.server');
    const {
      loadShoppingListAllocationReview,
      reconcileShoppingListAllocationReview,
      ShoppingListAllocationReviewError,
    } = await import('../lib/shopping-list-stock-allocations');
    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({
        title: `legacy-${runId}`,
        slug: `legacy-${runId}`,
        price: '10',
        inventoryQuantity: 50,
      })
      .returning();
    const created = await db
      .insert(orders)
      .values(
        [1, 2, 3].map((i) => ({ firstName: `legacy-${runId}-${i}`, phoneNumber1: '0661920628' })),
      )
      .returning();
    const ids = created.map((order) => order.id);
    const scopes: string[] = [];
    const requests: string[] = [];
    const build = async (orderIds: number[]) =>
      buildGeneratedShoppingListDraft({
        sourceMode: 'selected',
        title: `legacy-${runId}`,
        orders: orderIds.map((id) => ({
          id,
          fullName: 'Legacy',
          note: null,
          orderProducts: [
            {
              productId: product!.id,
              rawValue: String(product!.id),
              title: product!.title,
              quantity: 2,
              unitPrice: 10,
              lineTotal: 20,
              thumbnailUrl: null,
              missing: false,
            },
          ],
        })),
        resolveProductDetails: async () => ({ inventoryQuantity: 50, purchasePrice: null }),
        resolveBrandName: async () => 'Unbranded',
      });
    try {
      await db.insert(orderLineItems).values(
        ids.map((orderId) => ({
          orderId,
          productId: product!.id,
          contentId: String(product!.id),
          rawValue: String(product!.id),
          titleSnapshot: product!.title,
          originalUnitPrice: '10',
          effectiveUnitPrice: '10',
          quantity: 2,
          lineTotal: '20',
        })),
      );
      for (const orderIds of [[ids[0]!, ids[1]!], [ids[2]!]]) {
        const draft = await build(orderIds);
        const scopeKey = `selected:${orderIds.join(',')}`;
        scopes.push(scopeKey);
        const applied = draft.draftItems.map((item) => ({ ...item, inventoryAppliedQuantity: 1 }));
        await db.insert(shoppingListDrafts).values({
          scopeKey,
          sourceMode: 'selected',
          orderIds,
          title: draft.title,
          generatedItems: draft.generatedItems,
          draftItems: applied,
          ordersSnapshot: draft.orders,
        });
      }
      const legacy = (await loadAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: [ids[0]!, ids[1]!],
      }))!;
      const single = (await loadAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: [ids[2]!],
      }))!;
      expect(single.draftItems[0]!.inventoryAppliedQuantity).toBe(1);
      expect(legacy.draftItems[0]).toMatchObject({
        inventoryAllocationReview: true,
        inventoryAppliedQuantity: 1,
      });
      let sibling = await saveAdminShoppingListDraft(db, {
        ...(await build([ids[0]!])),
        revision: null,
      });
      scopes.push(sibling.scopeKey);
      const blockedId = randomUUID();
      requests.push(blockedId);
      const blocked = await applyShoppingListInventory(db, {
        sourceMode: sibling.sourceMode,
        orderIds: sibling.orderIds,
        revision: sibling.revision,
        draftIds: sibling.draftItems.map((item) => item.draftId),
        requestId: blockedId,
      });
      expect(blocked.items).toEqual([]);
      expect(blocked.skipped).toHaveLength(1);
      sibling = blocked.draft;
      const review = await loadShoppingListAllocationReview(db, {
        sourceMode: 'selected',
        orderIds: [ids[0]!],
      });
      expect(review.reviews[0]!.products[0]!.recordedQuantity).toBe(1);
      const reviewInput = {
        scopeKey: legacy.scopeKey,
        revision: legacy.revision,
        productId: product!.id,
        requestId: randomUUID(),
        orders: [{ orderId: ids[0]!, quantity: 1 }],
        manualQuantity: 0,
      };
      requests.push(reviewInput.requestId);
      await expect(
        reconcileShoppingListAllocationReview(db, { ...reviewInput, manualQuantity: 1 }),
      ).rejects.toBeInstanceOf(ShoppingListAllocationReviewError);
      await reconcileShoppingListAllocationReview(db, reviewInput);
      expect(await reconcileShoppingListAllocationReview(db, reviewInput)).toEqual({ ok: true });
      expect(
        (await db.select().from(products).where(eq(products.id, product!.id)))[0]!
          .inventoryQuantity,
      ).toBe(50);
      expect(
        (
          await loadShoppingListAllocationReview(db, {
            sourceMode: 'selected',
            orderIds: [ids[0]!],
          })
        ).reviews,
      ).toEqual([]);
      expect(
        (
          await db
            .select()
            .from(orderInventoryAllocations)
            .where(inArray(orderInventoryAllocations.orderId, ids))
        ).map((row) => row.needsReview),
      ).toEqual([false, false, false]);
      sibling = (await loadAdminShoppingListDraft(db, sibling))!;
      sibling = await saveAdminShoppingListDraft(db, {
        ...sibling,
        draftItems: sibling.draftItems.map((item) => ({ ...item, inventoryDecreaseQuantity: 1 })),
      });
      const requestId = randomUUID();
      requests.push(requestId);
      const remaining = await applyShoppingListInventory(db, {
        sourceMode: sibling.sourceMode,
        orderIds: sibling.orderIds,
        revision: sibling.revision,
        draftIds: sibling.draftItems.map((item) => item.draftId),
        requestId,
      });
      expect(remaining.items[0]).toMatchObject({ previousQuantity: 50, nextQuantity: 49 });
    } finally {
      if (scopes.length)
        await db.delete(shoppingListDrafts).where(inArray(shoppingListDrafts.scopeKey, scopes));
      if (requests.length)
        await db
          .delete(adminMutationIdempotency)
          .where(inArray(adminMutationIdempotency.requestId, requests));
      await db
        .delete(actionLogs)
        .where(and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, product!.id)));
      await db.delete(orders).where(inArray(orders.id, ids));
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });

  it('finds normalized phones, legacy secondary phones, order IDs and exact shipment scans', async () => {
    const db = getDb();
    const [primary, secondary] = await db
      .insert(orders)
      .values([
        { phoneNumber1: '661920629', normalizedPhone: '213661920629', firstName: runId },
        { phoneNumber1: '000000001', phoneNumber2: '0661 92 06 29', firstName: runId },
      ])
      .returning();
    const tracking = `AUDIT${primary!.id}`;
    try {
      await db.insert(ecotrackOrderStates).values({
        orderId: primary!.id,
        reference: tracking,
        trackingNumber: tracking,
        currentStatus: 'prete_a_expedier',
      });
      for (const search of ['0661920629', '661920629', '+213 661 92 06 29']) {
        const result = await loadOrdersPageData({ search }, false);
        expect(result.items.map((row) => row.id)).toEqual(
          expect.arrayContaining([primary!.id, secondary!.id]),
        );
      }
      expect(
        (await loadOrdersPageData({ search: String(primary!.id) }, false)).items.map(
          (row) => row.id,
        ),
      ).toEqual([primary!.id]);
      const scanned = await loadActiveShipmentPageRows(
        db,
        parseEcotrackShipmentListQuery({ search: tracking.toLowerCase() }),
      );
      expect(scanned.rows.map((row) => row.order.id)).toEqual([primary!.id]);
    } finally {
      await db.delete(orders).where(inArray(orders.id, [primary!.id, secondary!.id]));
    }
  });

  it('protects assignments made after taxonomy creation when undoing creation', async () => {
    const { createBrandThroughCanonicalWorkflow } = await import('../lib/taxonomy-mutations');
    const db = getDb();
    const actor = { email: `taxonomy-create-${runId}@example.com` };
    const brand = await createBrandThroughCanonicalWorkflow(
      db,
      { name: `Creation ${runId}` },
      actor,
    );
    const [product] = await db
      .insert(products)
      .values({ title: runId, slug: `taxonomy-create-${runId}`, price: '10', brandId: brand.id! })
      .returning();
    try {
      const [entry] = await db
        .select()
        .from(actionLogs)
        .where(and(eq(actionLogs.entityType, 'brands'), eq(actionLogs.entityId, brand.id!)));
      await expect(
        applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' }),
      ).rejects.toThrow('newer work');
      expect(
        (await db.select().from(products).where(eq(products.id, product!.id)))[0]!.brandId,
      ).toBe(brand.id);
      await db.update(products).set({ brandId: null }).where(eq(products.id, product!.id));
      await applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' });
      expect(await db.select().from(brands).where(eq(brands.id, brand.id!))).toEqual([]);
      await applyHistoryAction(db, { actionLogId: entry!.id, direction: 'redo' });
      expect(await db.select().from(brands).where(eq(brands.id, brand.id!))).toHaveLength(1);
    } finally {
      await db.delete(products).where(eq(products.id, product!.id));
      await db.delete(brands).where(eq(brands.id, brand.id!));
      await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    }
  });

  it('restores taxonomy relationships on Undo and rejects recovery over later assignments', async () => {
    const { deleteBrandThroughCanonicalWorkflow, deleteCategoryThroughCanonicalWorkflow } =
      await import('../lib/taxonomy-mutations');
    const db = getDb();
    const actor = { email: `taxonomy-${runId}@example.com` };
    const [brand] = await db
      .insert(brands)
      .values({ name: runId, slug: `taxonomy-${runId}` })
      .returning();
    const [other] = await db
      .insert(brands)
      .values({ name: runId, slug: `other-${runId}` })
      .returning();
    const [parent] = await db
      .insert(categories)
      .values({ name: runId, slug: `parent-${runId}` })
      .returning();
    const [child] = await db
      .insert(categories)
      .values({ name: runId, slug: `child-${runId}`, parentId: parent!.id })
      .returning();
    const [product] = await db
      .insert(products)
      .values({
        title: runId,
        slug: `taxonomy-${runId}`,
        price: '10',
        brandId: brand!.id,
        categoryId: parent!.id,
      })
      .returning();
    const readProduct = async () =>
      (await db.select().from(products).where(eq(products.id, product!.id)))[0]!;
    try {
      await deleteBrandThroughCanonicalWorkflow(db, brand!.id, actor);
      const [brandAction] = await db
        .select()
        .from(actionLogs)
        .where(and(eq(actionLogs.entityType, 'brands'), eq(actionLogs.createdBy, actor.email)));
      expect((await readProduct()).brandId).toBeNull();
      await applyHistoryAction(db, { actionLogId: brandAction!.id, direction: 'undo' });
      expect((await readProduct()).brandId).toBe(brand!.id);
      await applyHistoryAction(db, { actionLogId: brandAction!.id, direction: 'redo' });
      await db.update(products).set({ brandId: other!.id }).where(eq(products.id, product!.id));
      await expect(
        applyHistoryAction(db, { actionLogId: brandAction!.id, direction: 'undo' }),
      ).rejects.toThrow('reassigned');
      expect((await readProduct()).brandId).toBe(other!.id);
      expect(await db.select().from(brands).where(eq(brands.id, brand!.id))).toEqual([]);
      await db.update(products).set({ brandId: null }).where(eq(products.id, product!.id));
      await applyHistoryAction(db, { actionLogId: brandAction!.id, direction: 'undo' });
      await db.update(products).set({ brandId: other!.id }).where(eq(products.id, product!.id));
      await expect(
        applyHistoryAction(db, { actionLogId: brandAction!.id, direction: 'redo' }),
      ).rejects.toThrow('assignments changed');
      await deleteCategoryThroughCanonicalWorkflow(db, parent!.id, actor);
      const [categoryAction] = await db
        .select()
        .from(actionLogs)
        .where(and(eq(actionLogs.entityType, 'categories'), eq(actionLogs.createdBy, actor.email)));
      expect((await readProduct()).categoryId).toBeNull();
      expect(
        (await db.select().from(categories).where(eq(categories.id, child!.id)))[0]!.parentId,
      ).toBeNull();
      await applyHistoryAction(db, { actionLogId: categoryAction!.id, direction: 'undo' });
      expect((await readProduct()).categoryId).toBe(parent!.id);
      expect(
        (await db.select().from(categories).where(eq(categories.id, child!.id)))[0]!.parentId,
      ).toBe(parent!.id);
      await applyHistoryAction(db, { actionLogId: categoryAction!.id, direction: 'redo' });
      expect((await readProduct()).categoryId).toBeNull();
      expect(
        (await db.select().from(categories).where(eq(categories.id, child!.id)))[0]!.parentId,
      ).toBeNull();
    } finally {
      await db.delete(products).where(eq(products.id, product!.id));
      await db.delete(categories).where(inArray(categories.id, [child!.id, parent!.id]));
      await db.delete(brands).where(inArray(brands.id, [brand!.id, other!.id]));
      await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    }
  });

  it('records and undoes created bulletin child IDs instead of their different parent IDs', async () => {
    const db = getDb();
    const actor = { email: `identity-${runId}@example.com`, name: 'Audit' };
    const parentId = 1_500_000_000 + Math.floor(Math.random() * 100_000);
    const [post] = await db
      .insert(bulletinPosts)
      .values({
        id: parentId,
        title: runId,
        body: 'identity',
        authorName: actor.name,
        authorEmail: actor.email,
      })
      .returning();
    try {
      await createBulletinReply(db, post!.id, { body: 'Created reply' }, actor);
      const [createdReply] = await db
        .select()
        .from(bulletinReplies)
        .where(eq(bulletinReplies.postId, post!.id));
      expect(createdReply!.id).not.toBe(post!.id);
      const [parentReply] = await db
        .insert(bulletinReplies)
        .values({
          id: parentId + 1,
          postId: post!.id,
          body: 'Parent reply',
          authorName: actor.name,
          authorEmail: actor.email,
        })
        .returning();
      await setBulletinPostReaction(db, post!.id, '👍', 'add', actor);
      await setBulletinReplyReaction(db, parentReply!.id, '👍', 'add', actor);
      const [postReaction] = await db
        .select()
        .from(bulletinPostReactions)
        .where(eq(bulletinPostReactions.postId, post!.id));
      const [replyReaction] = await db
        .select()
        .from(bulletinReplyReactions)
        .where(eq(bulletinReplyReactions.replyId, parentReply!.id));
      for (const [entityType, entityId, parent] of [
        ['bulletinReplies', createdReply!.id, post!.id],
        ['bulletinPostReactions', postReaction!.id, post!.id],
        ['bulletinReplyReactions', replyReaction!.id, parentReply!.id],
      ] as const) {
        expect(entityId).not.toBe(parent);
        const [entry] = await db
          .select()
          .from(actionLogs)
          .where(and(eq(actionLogs.entityType, entityType), eq(actionLogs.createdBy, actor.email)));
        expect(entry!.entityId).toBe(entityId);
        await applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo', actor });
        expect(
          (await getActionEntityConfig(entityType)!.fetchState?.(db, entityId)) ?? null,
        ).toBeNull();
      }
      expect(
        await db
          .select()
          .from(bulletinPostReactions)
          .where(eq(bulletinPostReactions.postId, post!.id)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(bulletinReplyReactions)
          .where(eq(bulletinReplyReactions.replyId, parentReply!.id)),
      ).toEqual([]);
      expect(
        (await db.select().from(bulletinReplies).where(eq(bulletinReplies.id, parentReply!.id)))[0]
          ?.id,
      ).toBe(parentReply!.id);
    } finally {
      await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
      await db.delete(bulletinPosts).where(eq(bulletinPosts.id, post!.id));
    }
  });

  it('restores a deleted bulletin post with tags, attachments, replies and reactions, then redoes deletion', async () => {
    const db = getDb();
    const actor = {
      email: `audit-${runId}@example.com`,
      name: 'Audit',
      permissions: ['bulletin_moderate'] as const,
    };
    const [post] = await db
      .insert(bulletinPosts)
      .values({ title: runId, body: 'handoff', authorName: actor.name, authorEmail: actor.email })
      .returning();
    const [tag] = await db.insert(bulletinTags).values({ name: runId, slug: runId }).returning();
    try {
      await db.insert(bulletinPostTags).values({ postId: post!.id, tagId: tag!.id });
      await db.insert(bulletinPostAttachments).values({
        postId: post!.id,
        fileName: 'handoff.txt',
        fileKey: `bulletin/${runId}`,
        fileUrl: '/api/bulletin/attachments/test',
        contentType: 'text/plain',
        size: 7,
      });
      const [reply] = await db
        .insert(bulletinReplies)
        .values({
          postId: post!.id,
          body: 'received',
          authorName: actor.name,
          authorEmail: actor.email,
        })
        .returning();
      await db
        .insert(bulletinPostReactions)
        .values({ postId: post!.id, userName: actor.name, userEmail: actor.email, emoji: '👍' });
      await db
        .insert(bulletinReplyReactions)
        .values({ replyId: reply!.id, userName: actor.name, userEmail: actor.email, emoji: '👍' });
      const config = getActionEntityConfig('bulletinPosts')!;
      const before = await config.fetchState!(db, post!.id);
      await deleteBulletinPost(db, post!.id, actor);
      const [action] = await db
        .select()
        .from(actionLogs)
        .where(and(eq(actionLogs.entityType, 'bulletinPosts'), eq(actionLogs.entityId, post!.id)));
      expect(await config.fetchState!(db, post!.id)).toBeNull();
      await applyHistoryAction(db, { actionLogId: action!.id, direction: 'undo', actor });
      expect(await config.fetchState!(db, post!.id)).toEqual(before);
      await applyHistoryAction(db, { actionLogId: action!.id, direction: 'redo', actor });
      expect(await config.fetchState!(db, post!.id)).toBeNull();
    } finally {
      await db
        .delete(actionLogs)
        .where(and(eq(actionLogs.entityType, 'bulletinPosts'), eq(actionLogs.entityId, post!.id)));
      await db.delete(bulletinPosts).where(eq(bulletinPosts.id, post!.id));
      await db.delete(bulletinTags).where(eq(bulletinTags.id, tag!.id));
    }
  });

  it('searches saved and current product identities without duplicating orders or grouped units', async () => {
    const db = getDb();
    const marker = `search-${runId}`;
    const [product] = await db
      .insert(products)
      .values({
        title: `Équilibreur ${marker}`,
        titleAr: `حامل محرك ${marker}`,
        sku: `TC0725-${runId}`,
        slug: `renamed-${marker}`,
        price: '100.00',
      })
      .returning();
    const fixtures = await db
      .insert(orders)
      .values([
        { phoneNumber1: '0550000001' },
        { phoneNumber1: '0550000002' },
        { phoneNumber1: '0550000003', note: marker },
      ])
      .returning();
    const [first, second, unrelated] = fixtures;
    try {
      await db.insert(orderLineItems).values(
        [
          {
            orderId: first!.id,
            productId: product!.id,
            contentId: 'current',
            titleSnapshot: `Old title ${marker}`,
            quantity: 2,
          },
          {
            orderId: first!.id,
            productId: null,
            contentId: 'deleted',
            titleSnapshot: `Équilibreur ${marker}`,
            quantity: 3,
          },
          {
            orderId: second!.id,
            productId: product!.id,
            contentId: 'current',
            titleSnapshot: `Old title ${marker}`,
            quantity: 1,
          },
        ].map((line) => ({
          ...line,
          rawValue: line.contentId,
          originalUnitPrice: '100.00',
          effectiveUnitPrice: '100.00',
          lineTotal: String(line.quantity * 100),
        })),
      );

      for (const search of [`equilibreUR ${marker}`, `حامل محرك ${marker}`, product!.sku!]) {
        const result = await queryAdminOrders({ search, limit: 1 });
        expect(result.pagination.totalItems).toBe(2);
        expect(result.items).toHaveLength(1);
        const next = await queryAdminOrders({ search, limit: 1, page: 2 });
        expect(
          new Set([...result.items, ...next.items].map((row) => ('id' in row ? row.id : null))),
        ).toEqual(new Set([first!.id, second!.id]));
      }
      const grouped = await queryAdminOrders({
        search: `equilibreur ${marker}`,
        groupBy: { dimension: 'product' },
      });
      expect(grouped).toMatchObject({
        matchedOrders: 2,
        items: expect.arrayContaining([
          expect.objectContaining({ productId: product!.id, orderCount: 2, units: 3 }),
          expect.objectContaining({ productId: null, orderCount: 1, units: 3 }),
        ]),
      });
      const page = await loadOrdersPageData({ search: `equilibreur ${marker}` }, false);
      expect(page.items.map((row) => row.id).sort()).toEqual([first!.id, second!.id].sort());
      const note = await queryAdminOrders({ search: marker });
      expect(note.pagination.totalItems).toBe(3);
      expect(note.items).toContainEqual(expect.objectContaining({ id: unrelated!.id }));
      const absent = await queryAdminOrders({ search: `absent-${marker}` });
      expect(absent.pagination.totalItems).toBe(0);

      await db.delete(products).where(eq(products.id, product!.id));
      const deleted = await queryAdminOrders({ search: `equilibreur ${marker}` });
      expect(deleted.pagination.totalItems).toBe(1);
      expect(deleted.items).toContainEqual(expect.objectContaining({ id: first!.id }));
    } finally {
      await db.delete(orders).where(
        inArray(
          orders.id,
          fixtures.map((row) => row.id),
        ),
      );
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });

  it('applies migrations to a queryable PostgreSQL schema', async () => {
    const result = await getPool().query<{
      products: string | null;
      migrations: string | null;
      analyticsCategoryIndex: string | null;
      metaAnalyticsEventIndex: string | null;
    }>(`
      select
        to_regclass('public.products')::text as products,
        to_regclass('drizzle.__drizzle_migrations')::text as migrations,
        to_regclass('public.idx_analytics_events_category')::text as "analyticsCategoryIndex",
        to_regclass('public.idx_meta_event_outbox_analytics_event')::text as "metaAnalyticsEventIndex"
    `);

    expect(result.rows[0]).toEqual({
      products: 'products',
      migrations: 'drizzle.__drizzle_migrations',
      analyticsCategoryIndex: 'idx_analytics_events_category',
      metaAnalyticsEventIndex: 'idx_meta_event_outbox_analytics_event',
    });
  });

  it('keeps stable catalog values protected by database constraints', async () => {
    const expected = [
      'products_availability_matches_stock_check',
      'products_availability_status_check',
      'products_inventory_quantity_nonnegative_check',
      'products_old_price_nonnegative_check',
      'products_price_nonnegative_check',
      'products_purchase_price_nonnegative_check',
      'products_units_sold_nonnegative_check',
    ];
    const result = await getPool().query<{ conname: string }>(
      `select conname from pg_constraint where conname = any($1::text[]) order by conname`,
      [expected],
    );

    expect(result.rows.map((row) => row.conname)).toEqual(expected);
  });

  it('rejects product availability that contradicts stock state', async () => {
    await expect(
      getPool().query(
        `insert into products (title, slug, price, in_stock, availability_status)
         values ($1, $2, $3, true, 'out_of_stock')`,
        ['Contradictory stock fixture', `contradictory-stock-${runId}`, '100.00'],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'products_availability_matches_stock_check',
    });
  });

  it('enforces rate-limit counters in Redis', async () => {
    const options = {
      scope: `service-test:${runId}`,
      key: 'rate-limit',
      limit: 1,
      windowSeconds: 60,
    };

    await expect(applyRateLimit(options)).resolves.toMatchObject({ ok: true, remaining: 0 });
    await expect(applyRateLimit(options)).resolves.toMatchObject({ ok: false, remaining: 0 });
  });

  it('commits an order atomically and preserves its replay after idempotency maintenance', async () => {
    const db = getDb();
    const keyHash = `service-order:${runId}`;
    const fingerprint = buildIdempotencyFingerprint({ phoneNumber1: '0550000001' });
    const payload = storefrontOrderCreateRequestSchema.parse({ phoneNumber1: '0550000001' });

    const claim = await claimStorefrontOrderIdempotency(db, {
      keyHash,
      fingerprint,
      processingTtlSeconds: 60,
    });
    expect(claim.kind).toBe('started');
    if (claim.kind !== 'started') throw new Error('Expected a new claim');

    const created = await createStorefrontOrder(db, payload, {
      idempotency: { keyHash, fingerprint, createdAt: claim.createdAt },
    });

    try {
      expect(created.item).toMatchObject({
        phoneNumber1: '0550000001',
        variant: 'degraded_capture',
      });
      expect(created.item.statusHistory).toHaveLength(1);
      await expect(
        claimStorefrontOrderIdempotency(db, {
          keyHash,
          fingerprint,
          processingTtlSeconds: 60,
        }),
      ).resolves.toMatchObject({ kind: 'completed', orderId: created.item.id });

      const afterRetention = new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000);
      const abandonedKeyHash = `${keyHash}:abandoned`;
      const activeKeyHash = `${keyHash}:active`;
      await claimStorefrontOrderIdempotency(db, {
        keyHash: abandonedKeyHash,
        fingerprint,
        processingTtlSeconds: 60,
      });
      await claimStorefrontOrderIdempotency(db, {
        keyHash: activeKeyHash,
        fingerprint,
        processingTtlSeconds: 60,
        now: afterRetention,
      });
      try {
        await deleteExpiredOrderIdempotencyBatch(db, { now: afterRetention });
        const retained = await db
          .select({ keyHash: storefrontOrderIdempotency.keyHash })
          .from(storefrontOrderIdempotency)
          .where(
            inArray(storefrontOrderIdempotency.keyHash, [keyHash, abandonedKeyHash, activeKeyHash]),
          );
        expect(retained.map((row) => row.keyHash).sort()).toEqual([keyHash, activeKeyHash].sort());
        await expect(
          claimStorefrontOrderIdempotency(db, {
            keyHash,
            fingerprint,
            processingTtlSeconds: 60,
            now: afterRetention,
          }),
        ).resolves.toMatchObject({ kind: 'completed', orderId: created.item.id });
        await expect(
          claimStorefrontOrderIdempotency(db, {
            keyHash,
            fingerprint: `${fingerprint}:changed`,
            processingTtlSeconds: 60,
            now: afterRetention,
          }),
        ).resolves.toEqual({ kind: 'conflict' });
      } finally {
        await db
          .delete(storefrontOrderIdempotency)
          .where(inArray(storefrontOrderIdempotency.keyHash, [abandonedKeyHash, activeKeyHash]));
      }
    } finally {
      await db.delete(orders).where(eq(orders.id, created.item.id));
    }
  });

  it('rolls back order creation when its durable idempotency claim is missing', async () => {
    const db = getDb();
    const phoneNumber1 = '0550000002';
    const payload = storefrontOrderCreateRequestSchema.parse({ phoneNumber1 });

    await expect(
      createStorefrontOrder(db, payload, {
        idempotency: {
          keyHash: `missing-service-order:${runId}`,
          fingerprint: buildIdempotencyFingerprint({ phoneNumber1 }),
          createdAt: new Date(),
        },
      }),
    ).rejects.toThrow('The order request claim is no longer owned by this attempt.');

    await expect(
      db.select({ id: orders.id }).from(orders).where(eq(orders.phoneNumber1, phoneNumber1)),
    ).resolves.toEqual([]);
  });

  it('connects storefront acquisition and AI evidence to durable order outcomes', async () => {
    const db = getDb();
    const journeyId = `service-journey:${runId}`;
    const sessionId = `service-session:${runId}`;
    const visitId = `service-visit:${runId}`;
    const capturedAt = new Date();
    const capturedAtIso = capturedAt.toISOString();
    const campaignId = '120012345678901';
    const adsetId = '120012345678902';
    const adId = '120012345678903';
    const [product] = await db
      .insert(products)
      .values({
        title: `Service analytics product ${runId}`,
        slug: `service-analytics-${runId}`,
        price: '8000.00',
        purchasePrice: '5000.00',
      })
      .returning({ id: products.id });
    let orderId: number | null = null;
    let legacyOrderId: number | null = null;

    const commonEvent: Omit<StorefrontAnalyticsEvent, 'eventId' | 'eventName'> = {
      eventVersion: 1 as const,
      visitId,
      journeyId,
      sessionId,
      occurredAt: capturedAtIso,
      pagePath: '/fr/products/service-analytics',
      pageType: 'product',
      locale: 'fr',
      referrer: 'https://www.facebook.com/',
      utmSource: 'facebook',
      utmMedium: 'paid_social',
      utmCampaign: campaignId,
      utmTerm: adsetId,
      utmContent: adId,
      gaEventName: null,
      productId: null,
      productSlug: null,
      categoryId: null,
      categorySlug: null,
      brandId: null,
      brandSlug: null,
      orderId: null,
      searchTerm: null,
      quantity: null,
      value: null,
      currency: 'DZD',
      metadata: {
        storefrontProject: 'storefront',
        sessionStartedAt: capturedAtIso,
        viewportClass: 'mobile',
        hasMetaClickId: true,
      },
    };

    try {
      for (const [eventName, metadata] of [
        ['page_view', {}],
        ['ai_assistant_open', {}],
        ['ai_assistant_message', { intent: 'product_discovery' }],
        ['ai_assistant_result_click', { intent: 'product_discovery' }],
      ] as const) {
        await ingestStorefrontAnalyticsEvent(db, {
          ...commonEvent,
          eventId: `service-${eventName}:${runId}`,
          eventName,
          productId: eventName === 'ai_assistant_result_click' ? product.id : null,
          metadata: { ...commonEvent.metadata, ...metadata },
        });
      }
      await ingestStorefrontAnalyticsEvent(db, {
        ...commonEvent,
        eventId: `service-search-named:${runId}`,
        eventName: 'search',
        searchTerm: `drill-${runId}`,
        metadata: { ...commonEvent.metadata, resultsCount: 1 },
      });
      await ingestStorefrontAnalyticsEvent(db, {
        ...commonEvent,
        eventId: `service-search-unnamed:${runId}`,
        eventName: 'search',
        metadata: { ...commonEvent.metadata, resultsCount: 0 },
      });
      await ingestStorefrontAnalyticsEvent(db, {
        ...commonEvent,
        eventId: `service-assistant-feedback:${runId}`,
        eventName: 'ai_assistant_feedback',
        metadata: { ...commonEvent.metadata, rating: 'helpful' },
      });
      for (const status of ['completed', 'cancelled'] as const) {
        await ingestStorefrontAnalyticsEvent(db, {
          ...commonEvent,
          eventId: `service-assistant-run-${status}:${runId}`,
          eventName: 'ai_assistant_run',
          metadata: {
            ...commonEvent.metadata,
            intent: 'product_discovery',
            status,
            model: 'storefront-test-model',
            totalTokens: status === 'completed' ? 20 : 5,
          },
        });
      }

      const payload = storefrontOrderCreateRequestSchema.parse({
        phoneNumber1: '0550000004',
        cartProducts: [String(product.id)],
        visitId,
        journeyId,
        sessionId,
        marketing: {
          semanticsVersion: 'multi_destination_v1',
          eventId: `service-order-marketing:${runId}`,
          eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
          sessionEntry: {
            sessionId,
            journeyId,
            landingPath: '/fr/products/service-analytics',
            referrer: 'https://www.facebook.com/',
            utmSource: 'facebook',
            utmMedium: 'paid_social',
            utmCampaign: campaignId,
            utmTerm: adsetId,
            utmContent: adId,
            hasMetaClickId: true,
            hasGoogleClickId: false,
            hasTikTokClickId: false,
            capturedAt: capturedAtIso,
          },
          assistant: {
            sourceSessionId: sessionId,
            journeyId,
            openedAt: capturedAtIso,
            engagedAt: capturedAtIso,
            recommendationClickedAt: capturedAtIso,
            clickedProductIds: [product.id],
            capturedAt: capturedAtIso,
          },
        },
      });
      const created = await createStorefrontOrder(db, payload);
      orderId = created.item.id;
      const [legacyOrder] = await db
        .insert(orders)
        .values({
          phoneNumber1: '0550000005',
          cartProducts: [`service-analytics-${runId}`],
          createdAt: capturedAt,
        })
        .returning({ id: orders.id });
      legacyOrderId = legacyOrder.id;

      expect(created.item.purchaseEventId).toBe(`service-order-marketing:${runId}`);
      await expect(readStorefrontOrderByToken(db, created.item.publicToken)).resolves.toMatchObject(
        {
          kind: 'ok',
          item: { purchaseEventId: `service-order-marketing:${runId}` },
        },
      );

      await expect(
        db.select().from(analyticsSessions).where(eq(analyticsSessions.id, sessionId)),
      ).resolves.toEqual([
        expect.objectContaining({
          channel: 'meta_paid',
          evidence: 'paid_utm',
          utmCampaign: campaignId,
        }),
      ]);
      await expect(
        db
          .select()
          .from(orderAcquisitionAttribution)
          .where(eq(orderAcquisitionAttribution.orderId, orderId)),
      ).resolves.toEqual([
        expect.objectContaining({
          semanticsVersion: 'order_acquisition_v2',
          channel: 'meta_paid',
          sourceSessionId: sessionId,
          metaCampaignId: campaignId,
          metaAdsetId: adsetId,
          metaAdId: adId,
        }),
      ]);
      await expect(
        db.select().from(orderAiInfluence).where(eq(orderAiInfluence.orderId, orderId)),
      ).resolves.toEqual([
        expect.objectContaining({
          level: 'recommended_product_ordered',
          sameSession: true,
          recommendedProductOrdered: true,
        }),
      ]);

      const utcDay = capturedAtIso.slice(0, 10);
      const reportingDay = dayInTimezone(capturedAt, ADMIN_REPORTING_TIMEZONE);
      const [startDate, endDate] = [utcDay, reportingDay].sort();
      // Retained Storefront rollups preserve their recorded UTC day while live commerce uses the
      // reporting day. Cover both when this test runs during Algiers' one-hour midnight boundary.
      const filters = { startDate, endDate };
      await expect(getLiveStorefrontAiStats(db, filters)).resolves.toMatchObject({
        opens: 1,
        messages: 1,
        resultClicks: 1,
        influencedOrders: 1,
        confirmedOrders: 0,
        paidOrders: 0,
      });
      const experience = await getStorefrontExperienceStats(db, filters);
      expect(experience.website.acquisitionSources).toContainEqual(
        expect.objectContaining({ name: 'meta_paid', sessions: 1, orders: 1 }),
      );
      const websiteProductMetrics = await db.execute(
        buildWebsiteProductMetricsQuery({
          range: 'custom',
          ...filters,
        }),
      );
      expect(websiteProductMetrics.rows).toContainEqual(
        expect.objectContaining({
          id: String(product.id),
          website_purchase_count: 2,
        }),
      );
      const acquisition = await loadMetaPerformance(
        db,
        resolveAnalyticsFilters(
          analyticsQuerySchema.parse({ view: 'acquisition', range: 'custom', ...filters }),
        ),
        await getProfitTrackerReport({ range: 'custom', ...filters }, { db }),
      );
      expect(acquisition.entities.ads).toContainEqual(
        expect.objectContaining({ id: adId, bricOrders: 1 }),
      );
      expect(acquisition.summary.bricOrders).toBeGreaterThanOrEqual(1);

      const afterRetention = new Date(capturedAt.getTime() + 8 * 24 * 60 * 60 * 1_000);
      await expect(rollUpNextExpiredAnalyticsDay(db, { now: afterRetention })).resolves.toBe(
        capturedAtIso.slice(0, 10),
      );
      const searchRollups = await db
        .select({ term: analyticsDailyRollups.dimensionKey })
        .from(analyticsDailyRollups)
        .where(eq(analyticsDailyRollups.dimension, 'search'));
      expect(searchRollups).toEqual(expect.arrayContaining([{ term: `drill-${runId}` }]));
      expect(searchRollups).not.toContainEqual({ term: 'Unknown' });
      expect(searchRollups).not.toContainEqual({ term: '' });
      await expect(deleteExpiredAnalyticsEventsBatch(db, { now: afterRetention })).resolves.toBe(3);
      await expect(deleteExpiredAnalyticsSessionsBatch(db, { now: afterRetention })).resolves.toBe(
        0,
      );
      await expect(
        db.select().from(analyticsSessions).where(eq(analyticsSessions.id, sessionId)),
      ).resolves.toEqual([expect.objectContaining({ id: sessionId })]);

      await expect(getLiveStorefrontAiStats(db, filters)).resolves.toMatchObject({
        opens: 1,
        messages: 1,
        resultClicks: 1,
        influencedOrders: 1,
        confirmedOrders: 0,
        paidOrders: 0,
      });
      const retainedExperience = await getStorefrontExperienceStats(db, filters);
      expect(retainedExperience.website.acquisitionSources).toContainEqual(
        expect.objectContaining({ name: 'meta_paid', sessions: 1, orders: 1 }),
      );
    } finally {
      if (orderId) await db.delete(orders).where(eq(orders.id, orderId));
      if (legacyOrderId) await db.delete(orders).where(eq(orders.id, legacyOrderId));
      await db.delete(analyticsJourneys).where(eq(analyticsJourneys.id, journeyId));
      await db.delete(products).where(eq(products.id, product.id));
    }
  });

  it('keeps literal historical product search semantics', async () => {
    const { orderProductSearchCondition } = await import('../lib/order-product-search');
    const rollback = new Error('reporting fixture rollback');
    await expect(
      getDb().transaction(async (tx) => {
        const [product] = await tx
          .insert(products)
          .values({
            title: 'Renamed product',
            slug: `reporting-${runId}`,
            price: '9999',
          })
          .returning();
        const createdAt = new Date('2097-06-17T12:00:00Z');
        const phone = '0550000789';
        const fixture = await tx
          .insert(orders)
          .values([
            {
              phoneNumber1: phone,
              cartProducts: [String(product.id), String(product.id)],
              inHouseStatus: 2,
              productSubtotal: '1200',
              totalAmount: '1400',
              deliveryFee: '200',
              createdAt,
            },
            {
              phoneNumber1: phone,
              cartProducts: [product.slug!],
              inHouseStatus: 3,
              price: '500',
              totalAmount: '9999',
              deliveryFee: '100',
              createdAt,
            },
            {
              phoneNumber1: phone,
              cartProducts: [String(product.id)],
              inHouseStatus: 6,
              totalAmount: '9000',
              createdAt,
            },
          ])
          .returning();
        await tx.insert(orderLineItems).values({
          orderId: fixture[0]!.id,
          productId: product.id,
          contentId: `reporting-${runId}`,
          rawValue: String(product.id),
          titleSnapshot: 'Établi 100%_solide',
          originalUnitPrice: '600',
          effectiveUnitPrice: '600',
          quantity: 2,
          lineTotal: '1200',
        });
        await tx.insert(orderLineItems).values({
          orderId: fixture[2]!.id,
          productId: product.id,
          contentId: `reporting-other-${runId}`,
          rawValue: String(product.id),
          titleSnapshot: 'Établi 100XYsolide',
          originalUnitPrice: '600',
          effectiveUnitPrice: '600',
          quantity: 1,
          lineTotal: '600',
        });
        const matched = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              inArray(
                orders.id,
                fixture.map((row) => row.id),
              ),
              orderProductSearchCondition('etabli 100%_'),
            ),
          );
        expect(matched).toEqual([{ id: fixture[0]!.id }]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('bounds abandoned order searches in PostgreSQL without leaking the budget to pooled work', async () => {
    const { withOrderSearchTimeout, OrderSearchTimeoutError } = await import('../lib/order-search');
    const db = getDb();
    const before = await db.execute(sql`select current_setting('statement_timeout') as value`);
    await expect(
      withOrderSearchTimeout(db, 'slow query', async (connection) => {
        const budget = await connection.execute(
          sql`select current_setting('statement_timeout') as value`,
        );
        expect(budget.rows[0]).toEqual({ value: '10s' });
        await connection.execute(sql`set local statement_timeout = '20ms'`);
        await connection.execute(sql`select pg_sleep(0.2)`);
      }),
    ).rejects.toBeInstanceOf(OrderSearchTimeoutError);
    const after = await db.execute(sql`select current_setting('statement_timeout') as value`);
    expect(after.rows).toEqual(before.rows);
  });

  it('imports settlement rows without rebuilding dashboard snapshots synchronously', async () => {
    const db = getDb();
    const tracking = `SERVICE-${runId}`;
    const fileName = `service-stats-${runId}.xlsx`;
    const [product] = await db
      .insert(products)
      .values({
        title: 'Legacy settlement product',
        slug: `settlement-${runId}`,
        mongoId: `legacy:${runId}`,
        price: '500',
        purchasePrice: '200',
      })
      .returning();
    const [order] = await db
      .insert(orders)
      .values({
        phoneNumber1: '0550000003',
        firstName: 'Service',
        cartProducts: [product.slug!, product.mongoId!],
      })
      .returning({ id: orders.id });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Référence', 'Tracking', 'Montant', 'Frais de livraison', 'Net recouvrement'],
        [String(order.id), tracking, 1500, 200, 1300],
      ]),
      'Settlement',
    );
    let batchId: string | null = null;

    try {
      const result = await importStatsSpreadsheet(
        XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
        fileName,
      );
      batchId = result.batchId;

      expect(result).toEqual({
        batchId: result.batchId,
        newOrders: 1,
        duplicateOrders: 0,
        unmatchedReferences: [],
      });
      await expect(
        db
          .select({ orderId: processedOrders.orderId, tracking: processedOrders.tracking })
          .from(processedOrders)
          .where(eq(processedOrders.tracking, tracking)),
      ).resolves.toEqual([{ orderId: String(order.id), tracking }]);
      const [settlement] = await db
        .select()
        .from(processedOrders)
        .where(eq(processedOrders.tracking, tracking));
      expect(settlement).toMatchObject({ productCost: '400.00', profit: '900.00' });
    } finally {
      if (batchId) {
        await deleteImportBatch(batchId);
      } else {
        const batches = await db
          .select({ batchId: importBatches.batchId })
          .from(importBatches)
          .where(eq(importBatches.fileName, fileName));
        for (const batch of batches) {
          await deleteImportBatch(batch.batchId);
        }
      }
      await db.delete(orders).where(eq(orders.id, order.id));
      await db.delete(products).where(eq(products.id, product.id));
    }
  });

  it('replays a lost expense response once, rejects changed retries, and invalidates deleted economics', async () => {
    const {
      createProfitTrackerCost,
      deleteProfitTrackerCost,
      deleteProfitTrackerDay,
      exportProfitTrackerCsv,
      updateProfitTrackerSettings,
      upsertProfitTrackerDay,
    } = await import('../lib/profit-tracker');
    const { profitTrackerOperatingCosts, profitTrackerSettings, metaAdsDailyInsights } =
      await import('@bric/db/schema');
    const { AdminMutationIdempotencyConflictError } =
      await import('../lib/admin-mutation-idempotency');
    const rollback = new Error('financial fixture rollback');
    const date = '2098-06-17';
    await expect(
      getDb().transaction(async (tx) => {
        const db = tx as unknown as ReturnType<typeof getDb>;
        await updateProfitTrackerSettings(
          { fxRate: 321, defaultReturnRate: 7, restFrom: null },
          db,
        );
        const input = {
          name: `expense-${runId}`,
          amountDzd: 3100,
          period: 'once' as const,
          startDate: date,
        };
        const requestId = randomUUID();
        const first = await createProfitTrackerCost(input, db, requestId);
        const replay = await createProfitTrackerCost(input, db, requestId);
        expect(replay).toEqual(first);
        const rows = await tx
          .select()
          .from(profitTrackerOperatingCosts)
          .where(eq(profitTrackerOperatingCosts.name, input.name));
        expect(rows).toHaveLength(1);
        await expect(
          createProfitTrackerCost({ ...input, amountDzd: 999 }, db, requestId),
        ).rejects.toBeInstanceOf(AdminMutationIdempotencyConflictError);
        await tx
          .update(profitTrackerSettings)
          .set({ updatedAt: new Date('2000-01-01') })
          .where(eq(profitTrackerSettings.id, 1));
        expect(await deleteProfitTrackerCost(first.id!, db)).toEqual(first);
        const [settings] = await tx
          .select()
          .from(profitTrackerSettings)
          .where(eq(profitTrackerSettings.id, 1));
        expect(settings!.updatedAt.getTime()).toBeGreaterThan(new Date('2000-01-01').getTime());
        expect(Number(settings!.fxRate)).toBe(321);
        expect(Number(settings!.defaultReturnRate)).toBe(7);
        await upsertProfitTrackerDay({ date, confirmedOrders: 3, note: runId }, db);
        await tx.insert(metaAdsDailyInsights).values({
          day: date,
          accountId: runId,
          accountCurrency: 'EUR',
          accountTimezone: 'Africa/Algiers',
          campaignId: runId,
          adsetId: runId,
          adId: runId,
          attributionSetting: 'test',
          actionReportTime: 'conversion',
          purchases: '2',
          syncedAt: new Date(),
        });
        const csv = await exportProfitTrackerCsv(
          { range: 'custom', startDate: date, endDate: date },
          { db },
        );
        const [header, row] = csv
          .trim()
          .split('\n')
          .map((line) => line.split(','));
        expect(row![header!.indexOf('posted_or_manual_orders')]).toBe('3');
        expect(row![header!.indexOf('posted_or_manual_orders_source')]).toBe('manual');
        expect(row![header!.indexOf('posted_or_manual_orders_to_meta_purchases_pct')]).toBe('150');
        expect(header).not.toContain('confirmation_rate_pct');
        await tx
          .update(profitTrackerSettings)
          .set({ updatedAt: new Date('2000-01-01') })
          .where(eq(profitTrackerSettings.id, 1));
        expect(await deleteProfitTrackerDay(date, db)).toBe(date);
        const [afterDay] = await tx
          .select()
          .from(profitTrackerSettings)
          .where(eq(profitTrackerSettings.id, 1));
        expect(afterDay!.updatedAt.getTime()).toBeGreaterThan(new Date('2000-01-01').getTime());
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('recovers shopping stock and order allocations atomically with history conflicts', async () => {
    const { orderInventoryAllocations } = await import('@bric/db/schema');
    const { applyInventoryQuantityChange } = await import('../lib/inventory-actions');
    const { ActionHistoryConflictError } = await import('../lib/action-history');
    const rollback = new Error('stock recovery fixture rollback');
    await expect(
      getDb().transaction(async (tx) => {
        const db = tx as unknown as ReturnType<typeof getDb>;
        const [product] = await tx
          .insert(products)
          .values({
            title: `Recovery ${runId}`,
            slug: `recovery-${runId}`,
            price: '10',
            inventoryQuantity: 20,
          })
          .returning();
        const [order] = await tx
          .insert(orders)
          .values({ firstName: runId, phoneNumber1: '0661920629' })
          .returning();
        await tx.insert(orderLineItems).values({
          orderId: order!.id,
          productId: product!.id,
          contentId: String(product!.id),
          rawValue: String(product!.id),
          titleSnapshot: product!.title!,
          originalUnitPrice: '10',
          effectiveUnitPrice: '10',
          quantity: 2,
          lineTotal: '20',
        });
        const generated = await buildGeneratedShoppingListDraft({
          sourceMode: 'selected',
          title: 'Recovery fixture',
          orders: [
            {
              id: order!.id,
              fullName: runId,
              note: null,
              orderProducts: [
                {
                  productId: product!.id,
                  rawValue: String(product!.id),
                  title: product!.title!,
                  unitPrice: 10,
                  quantity: 2,
                  lineTotal: 20,
                  thumbnailUrl: null,
                  missing: false,
                },
              ],
            },
          ],
          resolveProductDetails: async () => ({ inventoryQuantity: 20, purchasePrice: null }),
          resolveBrandName: async () => 'Unbranded',
        });
        const draft = await saveAdminShoppingListDraft(db, {
          ...generated,
          revision: null,
          draftItems: generated.draftItems.map((item) => ({
            ...item,
            quantity: 3,
            inventoryDecreaseQuantity: 3,
          })),
        });
        const applied = await applyShoppingListInventory(db, {
          sourceMode: draft.sourceMode,
          orderIds: draft.orderIds,
          revision: draft.revision,
          draftIds: draft.draftItems.map((item) => item.draftId),
          requestId: `recovery-${runId}`,
        });
        expect(applied.items).toEqual([
          { productId: product!.id, previousQuantity: 20, nextQuantity: 17 },
        ]);
        const [entry] = await tx
          .select()
          .from(actionLogs)
          .where(and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, product!.id)));
        expect(entry!.afterState).toMatchObject({
          stockAllocations: {
            orders: [{ orderId: order!.id, productId: product!.id, quantity: 2 }],
            manual: { scopeKey: draft.scopeKey, productId: product!.id, quantity: 1 },
          },
        });
        const readState = async () => {
          const [currentProduct] = await tx
            .select()
            .from(products)
            .where(eq(products.id, product!.id));
          const [allocation] = await tx
            .select()
            .from(orderInventoryAllocations)
            .where(eq(orderInventoryAllocations.orderId, order!.id));
          const [currentDraft] = await tx
            .select()
            .from(shoppingListDrafts)
            .where(eq(shoppingListDrafts.scopeKey, draft.scopeKey));
          const generatedItems = currentDraft!.generatedItems as Array<{
            productId: number;
            inventoryManualAppliedQuantity: number;
            inventoryAppliedQuantity: number;
          }>;
          const item = generatedItems.find((item) => item.productId === product!.id)!;
          return {
            stock: currentProduct!.inventoryQuantity,
            allocation,
            item,
            revision: currentDraft!.revision,
          };
        };
        await applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' });
        expect(await readState()).toMatchObject({
          stock: 20,
          allocation: { quantity: 0 },
          item: {
            inventoryManualAppliedQuantity: 0,
            inventoryAppliedQuantity: 0,
            inventoryQuantity: 20,
          },
          revision: applied.draft.revision + 1,
        });
        await expect(
          applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' }),
        ).rejects.toBeInstanceOf(ActionHistoryConflictError);
        await applyHistoryAction(db, { actionLogId: entry!.id, direction: 'redo' });
        expect(await readState()).toMatchObject({
          stock: 17,
          allocation: { quantity: 2 },
          item: { inventoryManualAppliedQuantity: 1, inventoryAppliedQuantity: 3 },
        });
        const { archiveProductThroughCanonicalWorkflow, restoreProductThroughCanonicalWorkflow } =
          await import('../lib/product-update-workflow');
        const archiveRollback = new Error('archive fixture savepoint rollback');
        await expect(
          tx.transaction(async (archiveTx) => {
            const archiveDb = archiveTx as unknown as ReturnType<typeof getDb>;
            await archiveProductThroughCanonicalWorkflow(archiveDb, product!.id, {});
            expect(await readState()).toMatchObject({
              stock: 17,
              allocation: { quantity: 2 },
              item: { inventoryManualAppliedQuantity: 1 },
            });
            const [archivedProduct] = await archiveTx
              .select()
              .from(products)
              .where(eq(products.id, product!.id));
            expect(archivedProduct!.archivedAt).not.toBeNull();
            await restoreProductThroughCanonicalWorkflow(archiveDb, product!.id, {});
            expect(await readState()).toMatchObject({ stock: 17, allocation: { quantity: 2 } });
            const archiveHistory = await archiveTx
              .select()
              .from(actionLogs)
              .where(
                and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, product!.id)),
              );
            const lifecycle = archiveHistory
              .filter((row) => row.id !== entry!.id)
              .sort((a, b) => b.id - a.id);
            for (const action of lifecycle)
              await applyHistoryAction(archiveDb, { actionLogId: action.id, direction: 'undo' });
            expect(await readState()).toMatchObject({
              stock: 17,
              allocation: { quantity: 2 },
              item: { inventoryManualAppliedQuantity: 1 },
            });
            expect(
              (await archiveTx.select().from(products).where(eq(products.id, product!.id)))[0]!
                .archivedAt,
            ).toBeNull();
            throw archiveRollback;
          }),
        ).rejects.toBe(archiveRollback);
        // Pre-metadata stock changes cannot reveal whether they consumed these orders.
        const legacyBefore = { ...(entry!.beforeState as Record<string, unknown>) };
        const legacyAfter = { ...(entry!.afterState as Record<string, unknown>) };
        delete legacyBefore.stockAllocations;
        delete legacyAfter.stockAllocations;
        delete legacyBefore.stockHistoryVersion;
        delete legacyAfter.stockHistoryVersion;
        await tx
          .update(actionLogs)
          .set({ beforeState: legacyBefore, afterState: legacyAfter })
          .where(eq(actionLogs.id, entry!.id));
        await expect(
          applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' }),
        ).rejects.toThrow('older stock action');
        expect(await readState()).toMatchObject({
          stock: 17,
          allocation: { quantity: 2 },
          item: { inventoryManualAppliedQuantity: 1 },
        });
        await tx
          .update(actionLogs)
          .set({ beforeState: entry!.beforeState, afterState: entry!.afterState })
          .where(eq(actionLogs.id, entry!.id));
        // A changed manual balance must roll both stock and order counters back.
        const [savedDraft] = await tx
          .select()
          .from(shoppingListDrafts)
          .where(eq(shoppingListDrafts.scopeKey, draft.scopeKey));
        const savedGenerated = savedDraft!.generatedItems as Array<Record<string, unknown>>;
        await tx
          .update(shoppingListDrafts)
          .set({
            generatedItems: savedGenerated.map((item) => ({
              ...item,
              inventoryManualAppliedQuantity: 2,
            })),
          })
          .where(eq(shoppingListDrafts.id, savedDraft!.id));
        await expect(
          applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' }),
        ).rejects.toBeInstanceOf(ActionHistoryConflictError);
        expect(await readState()).toMatchObject({
          stock: 17,
          allocation: { quantity: 2 },
          item: { inventoryManualAppliedQuantity: 2 },
        });
        await tx
          .update(shoppingListDrafts)
          .set({ generatedItems: savedGenerated })
          .where(eq(shoppingListDrafts.id, savedDraft!.id));
        // An allocation changed outside this action must roll the stock write back too.
        await tx
          .update(orderInventoryAllocations)
          .set({ quantity: 1 })
          .where(eq(orderInventoryAllocations.orderId, order!.id));
        await expect(
          applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' }),
        ).rejects.toBeInstanceOf(ActionHistoryConflictError);
        expect(await readState()).toMatchObject({
          stock: 17,
          allocation: { quantity: 1 },
          item: { inventoryManualAppliedQuantity: 1 },
        });
        expect(
          (await tx.select().from(actionLogs).where(eq(actionLogs.id, entry!.id)))[0]!.isUndone,
        ).toBe(false);
        await tx
          .update(orderInventoryAllocations)
          .set({ quantity: 2, needsReview: true, legacyScopeKeys: ['retained-provenance'] })
          .where(eq(orderInventoryAllocations.orderId, order!.id));
        // Regular product history still gates older shopping deductions.
        await applyInventoryQuantityChange(db, {
          productId: product!.id,
          mode: 'increase',
          quantity: 1,
        });
        await expect(
          applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' }),
        ).rejects.toThrow('Only the latest applied action can be undone');
        const history = await tx
          .select()
          .from(actionLogs)
          .where(and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, product!.id)));
        const correction = history.find((row) => row.id !== entry!.id)!;
        await applyHistoryAction(db, { actionLogId: correction.id, direction: 'undo' });
        await applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' });
        expect(await readState()).toMatchObject({
          stock: 20,
          allocation: { quantity: 0, needsReview: true, legacyScopeKeys: ['retained-provenance'] },
          item: {
            inventoryManualAppliedQuantity: 0,
            inventoryAppliedQuantity: 0,
            inventoryQuantity: 20,
          },
        });
        const { mutateEntityWithHistory } = await import('../lib/action-history');
        const [legacyProduct] = await mutateEntityWithHistory(db, {
          entityType: 'products',
          operation: 'create',
          execute: (inner) =>
            inner
              .insert(products)
              .values({
                title: 'Imported stock history',
                slug: `recovery-legacy-${runId}`,
                price: '10',
                inventoryQuantity: 5,
              })
              .returning(),
          resolveEntityId: (rows) => rows[0]!.id,
        });
        const [creation] = await tx
          .select()
          .from(actionLogs)
          .where(
            and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, legacyProduct!.id)),
          );
        await tx
          .insert(orderInventoryAllocations)
          .values({ orderId: order!.id, productId: legacyProduct!.id, quantity: 1 });
        await expect(
          applyHistoryAction(db, { actionLogId: creation!.id, direction: 'undo' }),
        ).rejects.toThrow('allocations must be recovered');
        expect(
          await tx.select().from(products).where(eq(products.id, legacyProduct!.id)),
        ).toHaveLength(1);
        await tx
          .update(orderInventoryAllocations)
          .set({ quantity: 0, needsReview: true })
          .where(eq(orderInventoryAllocations.productId, legacyProduct!.id));
        await expect(
          applyHistoryAction(db, { actionLogId: creation!.id, direction: 'undo' }),
        ).rejects.toThrow('allocations must be recovered');
        expect(
          (
            await tx
              .select()
              .from(orderInventoryAllocations)
              .where(eq(orderInventoryAllocations.productId, legacyProduct!.id))
          )[0]!.needsReview,
        ).toBe(true);
        await tx
          .update(orderInventoryAllocations)
          .set({ needsReview: false })
          .where(eq(orderInventoryAllocations.productId, legacyProduct!.id));
        await applyHistoryAction(db, { actionLogId: creation!.id, direction: 'undo' });
        expect(
          await tx.select().from(products).where(eq(products.id, legacyProduct!.id)),
        ).toHaveLength(0);
        await applyHistoryAction(db, { actionLogId: creation!.id, direction: 'redo' });
        expect(
          await tx.select().from(products).where(eq(products.id, legacyProduct!.id)),
        ).toHaveLength(1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
