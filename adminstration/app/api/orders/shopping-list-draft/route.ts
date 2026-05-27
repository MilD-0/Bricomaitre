import { eq } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '../../../../db/client';
import { shoppingListDrafts } from '../../../../db/schema';
import { auth } from '../../../../lib/auth';
import { requireMutationAccess } from '../../../../lib/rbac';
import {
  buildShoppingListScopeKey,
  normalizeShoppingListOrderIds,
  shoppingListDraftPayloadSchema,
  shoppingListDraftQuerySchema,
  type ShoppingListDraftPayload,
} from '../../../../lib/shopping-list-drafts';

function parseDraftQuery(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  return shoppingListDraftQuerySchema.safeParse({
    sourceMode: searchParams.get('sourceMode') ?? undefined,
    orderIds: searchParams.getAll('orderIds'),
  });
}

function serializeDraft(row: typeof shoppingListDrafts.$inferSelect) {
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

async function findDraft(payload: Pick<ShoppingListDraftPayload, 'sourceMode' | 'orderIds'>) {
  const scopeKey = buildShoppingListScopeKey(payload.sourceMode, payload.orderIds);
  const db = getDb();
  const rows = await db
    .select()
    .from(shoppingListDrafts)
    .where(eq(shoppingListDrafts.scopeKey, scopeKey))
    .limit(1);

  return rows[0] ? serializeDraft(rows[0]) : null;
}

export async function GET(req: NextRequest) {
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  const parsed = parseDraftQuery(req);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!hasDb()) {
    return NextResponse.json({ draft: null });
  }

  return NextResponse.json({ draft: await findDraft(parsed.data) });
}

export async function PUT(req: NextRequest) {
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = shoppingListDraftPayloadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = await auth();
  const userEmail = session?.user?.email ?? 'unknown@example.com';
  const userName = session?.user?.name?.trim() || userEmail;
  const now = new Date();
  const orderIds = normalizeShoppingListOrderIds(parsed.data.orderIds);
  const scopeKey = buildShoppingListScopeKey(parsed.data.sourceMode, orderIds);
  const db = getDb();
  const values: InferInsertModel<typeof shoppingListDrafts> = {
    scopeKey,
    sourceMode: parsed.data.sourceMode,
    orderIds,
    title: parsed.data.title,
    draftItems: parsed.data.draftItems,
    generatedItems: parsed.data.generatedItems,
    ordersSnapshot: parsed.data.orders,
    createdBy: userEmail,
    createdByName: userName,
    updatedBy: userEmail,
    updatedByName: userName,
    createdAt: now,
    updatedAt: now,
  };

  const rows = await db
    .insert(shoppingListDrafts)
    .values(values)
    .onConflictDoUpdate({
      target: shoppingListDrafts.scopeKey,
      set: {
        sourceMode: parsed.data.sourceMode,
        orderIds,
        title: parsed.data.title,
        draftItems: parsed.data.draftItems,
        generatedItems: parsed.data.generatedItems,
        ordersSnapshot: parsed.data.orders,
        updatedBy: userEmail,
        updatedByName: userName,
        updatedAt: now,
      },
    })
    .returning();

  return NextResponse.json({ ok: true, draft: serializeDraft(rows[0]) });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  const parsed = parseDraftQuery(req);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const scopeKey = buildShoppingListScopeKey(parsed.data.sourceMode, parsed.data.orderIds);
  await getDb().delete(shoppingListDrafts).where(eq(shoppingListDrafts.scopeKey, scopeKey));

  return NextResponse.json({ ok: true });
}
