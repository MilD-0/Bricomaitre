import { and, eq, sql } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { shoppingListDrafts } from '@bric/db/schema';

import type { ActionActor } from './action-history';
import {
  buildShoppingListScopeKey,
  normalizeShoppingListOrderIds,
  reconcileShoppingListAllocations,
  shoppingListDraftPayloadSchema,
  shoppingListDraftSaveRequestSchema,
  type ShoppingListDraftPayload,
} from './shopping-list-drafts';

import { hydrateShoppingListStockCredits } from './stock-allocations/credits';
import { initializeLegacyShoppingListAllocations } from './stock-allocations/legacy';

type Database = ReturnType<typeof getDb>;

export function serializeShoppingListDraft(row: typeof shoppingListDrafts.$inferSelect) {
  const payload = reconcileShoppingListAllocations(
    shoppingListDraftPayloadSchema.parse({
      sourceMode: row.sourceMode,
      orderIds: row.orderIds,
      title: row.title,
      draftItems: row.draftItems,
      generatedItems: row.generatedItems,
      orders: row.ordersSnapshot,
    }),
  );
  return {
    scopeKey: row.scopeKey,
    revision: row.revision,
    ...payload,
    orderIds: normalizeShoppingListOrderIds(payload.orderIds),
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedByName,
  };
}

export async function loadAdminShoppingListDraft(
  db: Database,
  input: Pick<ShoppingListDraftPayload, 'sourceMode' | 'orderIds'>,
) {
  const scopeKey = buildShoppingListScopeKey(input.sourceMode, input.orderIds);
  return db.transaction(async (tx) => {
    await initializeLegacyShoppingListAllocations(tx);
    const [row] = await tx
      .select()
      .from(shoppingListDrafts)
      .where(eq(shoppingListDrafts.scopeKey, scopeKey))
      .limit(1);
    if (!row) return null;
    return hydrateShoppingListStockCredits(tx, serializeShoppingListDraft(row));
  });
}

export async function saveAdminShoppingListDraft(
  db: Database,
  input: ShoppingListDraftPayload & { revision: number | null },
  actor?: ActionActor,
  now = new Date(),
) {
  const requested = shoppingListDraftSaveRequestSchema.parse(input);
  const previous = await loadAdminShoppingListDraft(db, requested);
  if (requested.revision !== null && previous?.revision !== requested.revision)
    throw new ShoppingListDraftConflictError();
  const cohort = (draft: ShoppingListDraftPayload) =>
    normalizeShoppingListOrderIds([
      ...draft.orderIds,
      ...draft.orders.map((order) => order.orderId),
    ]);
  if (
    previous?.generatedItems.some((item) => (item.inventoryLegacyAppliedQuantity ?? 0) > 0) &&
    JSON.stringify(cohort(previous)) !== JSON.stringify(cohort(requested))
  ) {
    throw new ShoppingListDraftConflictError(
      'Review previous stock deductions before changing this shopping list’s orders.',
    );
  }
  // A status refresh may replace orders while keeping the same product totals.
  // Rebase order credits before clamping the new proposal to remaining units.
  const currentCredits = previous
    ? await hydrateShoppingListStockCredits(db, {
        ...previous,
        orderIds: requested.orderIds,
        orders: requested.orders,
      })
    : { generatedItems: [], draftItems: [] };
  const payload = reconcileShoppingListAllocations(requested, currentCredits);
  const orderIds = normalizeShoppingListOrderIds(payload.orderIds);
  const scopeKey = buildShoppingListScopeKey(payload.sourceMode, orderIds);
  const userEmail = actor?.email ?? 'unknown@example.com';
  const userName = actor?.name?.trim() || userEmail;
  const values: InferInsertModel<typeof shoppingListDrafts> = {
    scopeKey,
    allocationVersion: 1,
    sourceMode: payload.sourceMode,
    orderIds,
    title: payload.title,
    draftItems: payload.draftItems,
    generatedItems: payload.generatedItems,
    ordersSnapshot: payload.orders,
    createdBy: userEmail,
    createdByName: userName,
    updatedBy: userEmail,
    updatedByName: userName,
    createdAt: now,
    updatedAt: now,
  };
  const update = {
    sourceMode: payload.sourceMode,
    orderIds,
    title: payload.title,
    draftItems: payload.draftItems,
    generatedItems: payload.generatedItems,
    ordersSnapshot: payload.orders,
    updatedBy: userEmail,
    updatedByName: userName,
    updatedAt: now,
    revision: sql`${shoppingListDrafts.revision} + 1`,
  };
  const [row] =
    payload.revision === null
      ? await db
          .insert(shoppingListDrafts)
          .values(values)
          .onConflictDoNothing({ target: shoppingListDrafts.scopeKey })
          .returning()
      : await db
          .update(shoppingListDrafts)
          .set(update)
          .where(
            and(
              eq(shoppingListDrafts.scopeKey, scopeKey),
              eq(shoppingListDrafts.revision, payload.revision),
            ),
          )
          .returning();
  if (!row) throw new ShoppingListDraftConflictError();
  return hydrateShoppingListStockCredits(db, serializeShoppingListDraft(row!));
}

export class ShoppingListDraftConflictError extends Error {
  constructor(
    message = 'This shopping list was changed by another operator. Reload it before saving again.',
  ) {
    super(message);
    this.name = 'ShoppingListDraftConflictError';
  }
}

export async function resetAdminShoppingListDraft(
  db: Database,
  input: Pick<ShoppingListDraftPayload, 'sourceMode' | 'orderIds'> & { revision: number },
  actor?: ActionActor,
) {
  return db.transaction(async (tx) => {
    await initializeLegacyShoppingListAllocations(tx);
    const scopeKey = buildShoppingListScopeKey(input.sourceMode, input.orderIds);
    const [row] = await tx
      .select()
      .from(shoppingListDrafts)
      .where(eq(shoppingListDrafts.scopeKey, scopeKey))
      .for('update');
    if (!row || row.revision !== input.revision) throw new ShoppingListDraftConflictError();
    const draft = await hydrateShoppingListStockCredits(tx, serializeShoppingListDraft(row));
    const reset = reconcileShoppingListAllocations(
      {
        ...draft,
        draftItems: draft.generatedItems
          .filter((item) => !item.inventoryLedgerOnly)
          .map((item) => ({
            ...item,
            checked: false,
            inventoryDecreaseQuantity: Math.min(item.quantity, item.inventoryQuantity ?? 0),
          })),
      },
      draft,
    );
    const [saved] = await tx
      .update(shoppingListDrafts)
      .set({
        draftItems: reset.draftItems,
        generatedItems: reset.generatedItems,
        revision: row.revision + 1,
        updatedAt: new Date(),
        updatedBy: actor?.email ?? 'unknown@example.com',
        updatedByName: actor?.name || actor?.email || 'unknown@example.com',
      })
      .where(eq(shoppingListDrafts.scopeKey, scopeKey))
      .returning();
    return serializeShoppingListDraft(saved!);
  });
}
