import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionActor } from './action-history';
import { runIdempotentAdminMutation } from './admin-mutation-idempotency';
import { ShoppingListDraftConflictError } from './shopping-list-drafts.server';
import type { getDb } from '@bric/db/client';
import {
  actionLogs,
  orderInventoryAllocations,
  orderLineItems,
  orders,
  products,
  shoppingListDrafts,
} from '@bric/db/schema';
import {
  buildShoppingListScopeKey,
  reconcileShoppingListAllocations,
  shoppingListDraftPayloadSchema,
  type ShoppingListDraftPayload,
  type ShoppingListDraftItem,
} from './shopping-list-drafts';

type Database = ReturnType<typeof getDb>;
export type StockTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Reader = Database | StockTransaction;

function shoppingListAllocationOrderIds(draft: ShoppingListDraftPayload) {
  return [...new Set([...draft.orderIds, ...draft.orders.map((order) => order.orderId)])].sort(
    (a, b) => a - b,
  );
}

function stockDraftPayload(row: typeof shoppingListDrafts.$inferSelect) {
  return shoppingListDraftPayloadSchema.parse({
    sourceMode: row.sourceMode,
    orderIds: row.orderIds,
    title: row.title,
    generatedItems: row.generatedItems,
    draftItems: row.draftItems,
    orders: row.ordersSnapshot,
  });
}

export async function shoppingListOrderRequirements(db: Reader, orderIds: number[]) {
  if (!orderIds.length) return [];
  return db
    .select({
      orderId: orderLineItems.orderId,
      productId: orderLineItems.productId,
      quantity: sql<number>`sum(${orderLineItems.quantity})::integer`,
    })
    .from(orderLineItems)
    .where(inArray(orderLineItems.orderId, orderIds))
    .groupBy(orderLineItems.orderId, orderLineItems.productId);
}

export async function hydrateShoppingListStockCredits<T extends ShoppingListDraftPayload>(
  db: Reader,
  draft: T,
): Promise<T> {
  const orderIds = shoppingListAllocationOrderIds(draft);
  const allocations = orderIds.length
    ? await db
        .select()
        .from(orderInventoryAllocations)
        .where(inArray(orderInventoryAllocations.orderId, orderIds))
    : [];
  const credits = new Map<number, number>();
  const review = new Set<number>();
  for (const allocation of allocations) {
    credits.set(
      allocation.productId,
      (credits.get(allocation.productId) ?? 0) + allocation.quantity,
    );
    if (allocation.needsReview) review.add(allocation.productId);
  }
  // Include removed manual items as invisible ledger entries, never recreated visible lines.
  const templates = new Map<number, ShoppingListDraftItem>();
  for (const item of [...draft.draftItems, ...draft.generatedItems])
    if (item.productId != null) templates.set(item.productId, item);
  const stockRows = templates.size
    ? await db
        .select({ id: products.id, inventoryQuantity: products.inventoryQuantity })
        .from(products)
        .where(inArray(products.id, [...templates.keys()]))
    : [];
  const stock = new Map(stockRows.map((row) => [row.id, row.inventoryQuantity]));
  const generatedItems = [
    ...draft.generatedItems.filter((item) => item.productId == null),
    ...[...templates.values()].map((item) => {
      const orderCredit = credits.get(item.productId!) ?? 0;
      const manualCredit = item.inventoryManualAppliedQuantity ?? 0;
      const legacyCredit = item.inventoryLegacyAppliedQuantity ?? 0;
      if (legacyCredit > 0) review.add(item.productId!);
      return {
        ...item,
        inventoryLedgerOnly: !draft.generatedItems.some(
          (g) => g.productId === item.productId && !g.inventoryLedgerOnly,
        ),
        inventoryQuantity: stock.get(item.productId!) ?? null,
        inventoryOrderAppliedQuantity: orderCredit,
        inventoryManualAppliedQuantity: manualCredit,
        inventoryAppliedQuantity: orderCredit + manualCredit + legacyCredit,
        inventoryAllocationReview: review.has(item.productId!),
      };
    }),
  ];
  const reconciled = reconcileShoppingListAllocations(
    {
      ...draft,
      generatedItems,
      draftItems: draft.draftItems.map((item) => ({
        ...item,
        inventoryQuantity: item.productId == null ? null : (stock.get(item.productId) ?? null),
      })),
    },
    { generatedItems, draftItems: [] },
  );
  return {
    ...reconciled,
    draftItems: reconciled.draftItems.map((item) => ({
      ...item,
      inventoryAllocationReview: item.productId != null && review.has(item.productId),
    })),
  };
}

export async function refreshShoppingListStockCreditsInTransaction(
  tx: StockTransaction,
  scopeKey: string,
) {
  const [row] = await tx
    .select()
    .from(shoppingListDrafts)
    .where(eq(shoppingListDrafts.scopeKey, scopeKey))
    .for('update');
  if (!row) return;
  const draft = await hydrateShoppingListStockCredits(tx, stockDraftPayload(row));
  await tx
    .update(shoppingListDrafts)
    .set({
      generatedItems: draft.generatedItems,
      draftItems: draft.draftItems,
      revision: row.revision + 1,
      updatedAt: new Date(),
    })
    .where(eq(shoppingListDrafts.id, row.id));
}

/** Run before taking any individual draft/order/product locks. Old snapshots have no
 * product IDs on order groups, so only uniquely supported attribution is imported. */
export async function initializeLegacyShoppingListAllocations(tx: StockTransaction) {
  const [pending] = await tx
    .select({ id: shoppingListDrafts.id })
    .from(shoppingListDrafts)
    .where(eq(shoppingListDrafts.allocationVersion, 0))
    .limit(1);
  if (!pending) return;
  await tx.execute(sql`select pg_advisory_xact_lock(81943027)`);
  const drafts = await tx
    .select()
    .from(shoppingListDrafts)
    .where(eq(shoppingListDrafts.allocationVersion, 0))
    .orderBy(asc(shoppingListDrafts.id))
    .for('update');
  const allIds = [
    ...new Set(drafts.flatMap((row) => shoppingListAllocationOrderIds(stockDraftPayload(row)))),
  ].sort((a, b) => a - b);
  const existingOrders = allIds.length
    ? await tx
        .select({ id: orders.id })
        .from(orders)
        .where(inArray(orders.id, allIds))
        .orderBy(asc(orders.id))
        .for('update')
    : [];
  const existingIds = new Set(existingOrders.map((row) => row.id));
  const productIds = [
    ...new Set(
      drafts.flatMap((row) =>
        [...stockDraftPayload(row).generatedItems, ...stockDraftPayload(row).draftItems].flatMap(
          (item) => (item.productId == null ? [] : [item.productId]),
        ),
      ),
    ),
  ].sort((a, b) => a - b);
  const existingProducts = productIds.length
    ? await tx
        .select({ id: products.id })
        .from(products)
        .where(inArray(products.id, productIds))
        .orderBy(asc(products.id))
        .for('update')
    : [];
  const existingProductIds = new Set(existingProducts.map((row) => row.id));
  for (const row of drafts) {
    const draft = reconcileShoppingListAllocations(stockDraftPayload(row));
    const ids = shoppingListAllocationOrderIds(draft).filter((id) => existingIds.has(id));
    const requirements = await shoppingListOrderRequirements(tx, ids);
    const generatedItems = draft.generatedItems.map((item) => ({
      ...item,
      inventoryManualAppliedQuantity: 0,
      inventoryOrderAppliedQuantity: 0,
      inventoryLegacyAppliedQuantity: 0,
    }));
    for (const item of generatedItems) {
      const applied = item.inventoryAppliedQuantity;
      if (item.productId == null || applied <= 0 || !existingProductIds.has(item.productId))
        continue;
      const matches = requirements.filter((line) => line.productId === item.productId);
      const total = matches.reduce((sum, line) => sum + line.quantity, 0);
      const sameIdentity = draft.generatedItems
        .filter((other) => other.title === item.title && other.brandId === item.brandId)
        .every((other) => other.productId === item.productId);
      const snapshotMatches =
        sameIdentity &&
        matches.every((line) => {
          const snapshot = draft.orders.find((order) => order.orderId === line.orderId);
          return (
            snapshot?.products
              .filter((product) => product.title === item.title && product.brandId === item.brandId)
              .reduce((sum, product) => sum + product.quantity, 0) === line.quantity
          );
        });
      const mentionedBySnapshot = draft.orders.some((order) =>
        order.products.some(
          (product) => product.title === item.title && product.brandId === item.brandId,
        ),
      );
      const safe =
        matches.length > 0 && snapshotMatches && (matches.length === 1 || applied >= total);
      const manualOnly = item.isCustom && matches.length === 0 && !mentionedBySnapshot;
      if (manualOnly) {
        item.inventoryManualAppliedQuantity = applied;
        continue;
      }
      if (safe) {
        for (const line of matches) {
          const quantity = Math.min(applied, line.quantity);
          await tx
            .insert(orderInventoryAllocations)
            .values({
              orderId: line.orderId,
              productId: item.productId,
              quantity,
              legacyScopeKeys: [row.scopeKey],
            })
            .onConflictDoUpdate({
              target: [orderInventoryAllocations.orderId, orderInventoryAllocations.productId],
              set: {
                quantity: sql`greatest(${orderInventoryAllocations.quantity},${quantity})`,
                legacyScopeKeys: sql`array(select distinct unnest(${orderInventoryAllocations.legacyScopeKeys} || ARRAY[${row.scopeKey}]::text[]))`,
              },
            });
        }
        item.inventoryManualAppliedQuantity = Math.max(applied - total, 0);
      } else {
        // Preserve evidence without assigning a partial batch to arbitrary orders.
        item.inventoryLegacyAppliedQuantity = applied;
        for (const orderId of ids)
          await tx
            .insert(orderInventoryAllocations)
            .values({
              orderId,
              productId: item.productId,
              needsReview: true,
              legacyScopeKeys: [row.scopeKey],
            })
            .onConflictDoUpdate({
              target: [orderInventoryAllocations.orderId, orderInventoryAllocations.productId],
              set: {
                needsReview: true,
                legacyScopeKeys: sql`array(select distinct unnest(${orderInventoryAllocations.legacyScopeKeys} || ARRAY[${row.scopeKey}]::text[]))`,
              },
            });
      }
    }
    await tx
      .update(shoppingListDrafts)
      .set({ allocationVersion: 1, generatedItems })
      .where(eq(shoppingListDrafts.id, row.id));
  }
}

export async function lockShoppingListAllocationOrders(
  tx: StockTransaction,
  draft: ShoppingListDraftPayload,
) {
  const ids = shoppingListAllocationOrderIds(draft);
  if (ids.length)
    await tx
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.id, ids))
      .orderBy(asc(orders.id))
      .for('update');
  return ids;
}

export async function setOrderAllocationQuantity(
  tx: StockTransaction,
  orderId: number,
  productId: number,
  quantity: number,
) {
  await tx
    .insert(orderInventoryAllocations)
    .values({ orderId, productId, quantity })
    .onConflictDoUpdate({
      target: [orderInventoryAllocations.orderId, orderInventoryAllocations.productId],
      set: { quantity, updatedAt: new Date() },
    });
}

export class ShoppingListAllocationReviewError extends Error {}

export const shoppingListAllocationReviewSchema = z
  .object({
    scopeKey: z.string().min(1).max(5000),
    revision: z.number().int().nonnegative(),
    productId: z.number().int().positive(),
    requestId: z.string().min(1).max(200),
    orders: z
      .array(
        z
          .object({
            orderId: z.number().int().positive(),
            quantity: z.number().int().nonnegative().max(999999),
          })
          .strict(),
      )
      .max(500),
    manualQuantity: z.number().int().nonnegative().max(999999),
  })
  .strict();

export type ShoppingListAllocationReview = {
  reviews: Array<{
    scopeKey: string;
    revision: number;
    title: string;
    products: Array<{
      productId: number;
      title: string;
      recordedQuantity: number;
      manualAppliedQuantity: number;
      orders: Array<{ orderId: number; requiredQuantity: number; currentAppliedQuantity: number }>;
    }>;
  }>;
};

export async function loadShoppingListAllocationReview(
  db: Database,
  input: Pick<ShoppingListDraftPayload, 'sourceMode' | 'orderIds'>,
): Promise<ShoppingListAllocationReview> {
  return db.transaction(async (tx) => {
    await initializeLegacyShoppingListAllocations(tx);
    const [requested] = await tx
      .select()
      .from(shoppingListDrafts)
      .where(
        eq(
          shoppingListDrafts.scopeKey,
          buildShoppingListScopeKey(input.sourceMode, input.orderIds),
        ),
      );
    const ids = requested
      ? shoppingListAllocationOrderIds(stockDraftPayload(requested))
      : input.orderIds;
    const held = ids.length
      ? await tx
          .select()
          .from(orderInventoryAllocations)
          .where(
            and(
              inArray(orderInventoryAllocations.orderId, ids),
              eq(orderInventoryAllocations.needsReview, true),
            ),
          )
      : [];
    const keys = [...new Set(held.flatMap((row) => row.legacyScopeKeys))];
    if (requested) keys.push(requested.scopeKey);
    const rows = keys.length
      ? await tx.select().from(shoppingListDrafts).where(inArray(shoppingListDrafts.scopeKey, keys))
      : [];
    const reviews: ShoppingListAllocationReview['reviews'] = [];
    for (const row of rows) {
      const draft = stockDraftPayload(row);
      const unresolved = draft.generatedItems.filter(
        (item) => item.productId != null && (item.inventoryLegacyAppliedQuantity ?? 0) > 0,
      );
      if (!unresolved.length) continue;
      const orderIds = shoppingListAllocationOrderIds(draft);
      const requirements = await shoppingListOrderRequirements(tx, orderIds);
      const existing = orderIds.length
        ? await tx
            .select()
            .from(orderInventoryAllocations)
            .where(inArray(orderInventoryAllocations.orderId, orderIds))
        : [];
      reviews.push({
        scopeKey: row.scopeKey,
        revision: row.revision,
        title: row.title,
        products: unresolved.map((item) => ({
          productId: item.productId!,
          title: item.title,
          recordedQuantity: item.inventoryLegacyAppliedQuantity!,
          manualAppliedQuantity: item.inventoryManualAppliedQuantity ?? 0,
          orders: orderIds
            .filter((orderId) =>
              existing.some((a) => a.orderId === orderId && a.productId === item.productId),
            )
            .map((orderId) => ({
              orderId,
              requiredQuantity:
                requirements.find(
                  (line) => line.orderId === orderId && line.productId === item.productId,
                )?.quantity ?? 0,
              currentAppliedQuantity:
                existing.find((a) => a.orderId === orderId && a.productId === item.productId)
                  ?.quantity ?? 0,
            })),
        })),
      });
    }
    return { reviews };
  });
}

export async function reconcileShoppingListAllocationReview(
  db: Database,
  input: z.input<typeof shoppingListAllocationReviewSchema>,
  actor?: ActionActor,
) {
  const values = shoppingListAllocationReviewSchema.parse(input);
  const result = await runIdempotentAdminMutation(db, {
    scope: 'shopping-stock-attribution',
    requestId: values.requestId,
    payload: values,
    execute: async (tx) => {
      await initializeLegacyShoppingListAllocations(tx);
      // All review drafts lock before orders/products, including the other sources of a hold.
      const held = await tx
        .select()
        .from(orderInventoryAllocations)
        .where(
          and(
            eq(orderInventoryAllocations.productId, values.productId),
            eq(orderInventoryAllocations.needsReview, true),
          ),
        );
      const scopeKeys = [
        ...new Set([values.scopeKey, ...held.flatMap((row) => row.legacyScopeKeys)]),
      ].sort();
      const draftRows = await tx
        .select()
        .from(shoppingListDrafts)
        .where(inArray(shoppingListDrafts.scopeKey, scopeKeys))
        .orderBy(asc(shoppingListDrafts.scopeKey))
        .for('update');
      const row = draftRows.find((row) => row.scopeKey === values.scopeKey);
      if (!row || row.revision !== values.revision) throw new ShoppingListDraftConflictError();
      const draft = stockDraftPayload(row);
      const ledger = draft.generatedItems.find((item) => item.productId === values.productId);
      const recorded = ledger?.inventoryLegacyAppliedQuantity ?? 0;
      if (recorded <= 0)
        throw new ShoppingListAllocationReviewError(
          'This stock deduction no longer needs attribution.',
        );
      const ids = await lockShoppingListAllocationOrders(tx, draft);
      const unique = new Set(values.orders.map((order) => order.orderId));
      if (
        unique.size !== values.orders.length ||
        values.orders.some((order) => !ids.includes(order.orderId))
      )
        throw new ShoppingListAllocationReviewError(
          'Choose each order from this shopping list at most once.',
        );
      if (
        values.orders.reduce((sum, order) => sum + order.quantity, values.manualQuantity) !==
        recorded
      )
        throw new ShoppingListAllocationReviewError(
          'Order allocations and the manual remainder must equal the recorded deduction.',
        );
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, values.productId))
        .for('update');
      if (!product) throw new ShoppingListAllocationReviewError('This product no longer exists.');
      const current = ids.length
        ? await tx
            .select()
            .from(orderInventoryAllocations)
            .where(
              and(
                eq(orderInventoryAllocations.productId, values.productId),
                inArray(orderInventoryAllocations.orderId, ids),
              ),
            )
        : [];
      if (values.orders.some((order) => !current.some((row) => row.orderId === order.orderId)))
        throw new ShoppingListAllocationReviewError(
          'An order needed for attribution no longer exists.',
        );
      ledger!.inventoryLegacyAppliedQuantity = 0;
      ledger!.inventoryManualAppliedQuantity =
        (ledger!.inventoryManualAppliedQuantity ?? 0) + values.manualQuantity;
      for (const allocation of current) {
        const quantity = Math.max(
          allocation.quantity,
          values.orders.find((order) => order.orderId === allocation.orderId)?.quantity ?? 0,
        );
        const needsReview = allocation.legacyScopeKeys.some(
          (key) =>
            key !== values.scopeKey &&
            draftRows.some(
              (other) =>
                other.scopeKey === key &&
                stockDraftPayload(other).generatedItems.some(
                  (item) =>
                    item.productId === values.productId &&
                    (item.inventoryLegacyAppliedQuantity ?? 0) > 0,
                ),
            ),
        );
        await tx
          .update(orderInventoryAllocations)
          .set({ quantity, needsReview, updatedAt: new Date() })
          .where(
            and(
              eq(orderInventoryAllocations.orderId, allocation.orderId),
              eq(orderInventoryAllocations.productId, values.productId),
            ),
          );
      }
      await tx
        .update(shoppingListDrafts)
        .set({
          generatedItems: draft.generatedItems,
          updatedBy: actor?.email,
          updatedByName: actor?.name || actor?.email,
        })
        .where(eq(shoppingListDrafts.id, row.id));
      await refreshShoppingListStockCreditsInTransaction(tx, row.scopeKey);
      await tx.insert(actionLogs).values({
        resource: 'products',
        entityType: 'products',
        entityId: values.productId,
        entityLabel: product.title,
        operation: 'update',
        beforeState: {
          legacyStockAttribution: { scopeKey: row.scopeKey, recordedQuantity: recorded },
        },
        afterState: {
          legacyStockAttribution: {
            scopeKey: row.scopeKey,
            orders: values.orders,
            manualQuantity: values.manualQuantity,
          },
        },
        createdBy: actor?.email,
        createdByName: actor?.name || actor?.email,
        isReversible: false,
      });
      return { ok: true as const };
    },
  });
  return result.value;
}
