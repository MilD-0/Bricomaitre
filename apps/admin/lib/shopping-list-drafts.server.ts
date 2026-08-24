import { eq } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { shoppingListDrafts } from '@bric/db/schema';

import type { ActionActor } from './action-history';
import {
  buildShoppingListScopeKey,
  normalizeShoppingListOrderIds,
  shoppingListDraftPayloadSchema,
  type ShoppingListDraftPayload,
} from './shopping-list-drafts';

type Database = ReturnType<typeof getDb>;

function serializeShoppingListDraft(row: typeof shoppingListDrafts.$inferSelect) {
  const payload = shoppingListDraftPayloadSchema.parse({
    sourceMode: row.sourceMode,
    orderIds: row.orderIds,
    title: row.title,
    draftItems: row.draftItems,
    generatedItems: row.generatedItems,
    orders: row.ordersSnapshot,
  });
  return {
    scopeKey: row.scopeKey,
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
  const [row] = await db
    .select()
    .from(shoppingListDrafts)
    .where(eq(shoppingListDrafts.scopeKey, scopeKey))
    .limit(1);
  return row ? serializeShoppingListDraft(row) : null;
}

export async function saveAdminShoppingListDraft(
  db: Database,
  input: ShoppingListDraftPayload,
  actor?: ActionActor,
  now = new Date(),
) {
  const payload = shoppingListDraftPayloadSchema.parse(input);
  const orderIds = normalizeShoppingListOrderIds(payload.orderIds);
  const scopeKey = buildShoppingListScopeKey(payload.sourceMode, orderIds);
  const userEmail = actor?.email ?? 'unknown@example.com';
  const userName = actor?.name?.trim() || userEmail;
  const values: InferInsertModel<typeof shoppingListDrafts> = {
    scopeKey,
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
  const [row] = await db
    .insert(shoppingListDrafts)
    .values(values)
    .onConflictDoUpdate({
      target: shoppingListDrafts.scopeKey,
      set: {
        sourceMode: payload.sourceMode,
        orderIds,
        title: payload.title,
        draftItems: payload.draftItems,
        generatedItems: payload.generatedItems,
        ordersSnapshot: payload.orders,
        updatedBy: userEmail,
        updatedByName: userName,
        updatedAt: now,
      },
    })
    .returning();
  return serializeShoppingListDraft(row!);
}

export async function deleteAdminShoppingListDraft(
  db: Database,
  input: Pick<ShoppingListDraftPayload, 'sourceMode' | 'orderIds'>,
) {
  const scopeKey = buildShoppingListScopeKey(input.sourceMode, input.orderIds);
  await db.delete(shoppingListDrafts).where(eq(shoppingListDrafts.scopeKey, scopeKey));
  return { ok: true as const, scopeKey };
}
