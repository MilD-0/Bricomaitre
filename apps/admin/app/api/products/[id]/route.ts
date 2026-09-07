import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { productPromoCodes, products } from '@bric/db/schema';
import { ActionHistoryEntityNotFoundError, mutateEntityWithHistory } from '@/lib/action-history';
import { startProductCatalogFeedRefreshJob } from '@/lib/background-jobs';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { productPatchSchema, productPayloadSchema } from '@/lib/products';
import {
  archiveProductThroughCanonicalWorkflow,
  ProductIntegrityConflictError,
  ProductMutationNotFoundError,
  replaceProductThroughCanonicalWorkflow,
} from '@/lib/product-update-workflow';
import { assertUniqueProductIdentifiers } from '@/lib/product-integrity';
import { hasPermission, normalizePermissions } from '@/lib/permissions';
import { requireAppAccess, requireMutationAccess } from '@/lib/rbac';
import { captureAdminException, getRequestId } from '@/lib/sentry';
import { CACHE_TAGS, revalidateServerTags } from '@/lib/server-cache';
import {
  revalidateStorefrontLandingPages,
  revalidateStorefrontProducts,
} from '@/lib/storefront-revalidate';

function toProductPromoResponse(row: typeof productPromoCodes.$inferSelect) {
  return {
    id: row.id,
    productId: row.productId,
    code: row.code,
    normalizedCode: row.normalizedCode,
    promoPrice: row.promoPrice,
    active: row.active,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied, session } = await requireAppAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }
  const db = getDb();
  const row = await db.query.products.findFirst({ where: eq(products.id, numericId) });

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const promoRows = await db
    .select()
    .from(productPromoCodes)
    .where(eq(productPromoCodes.productId, numericId));

  const permissions = normalizePermissions(session?.user?.permissions);
  const canReadCost =
    hasPermission(permissions, 'products_write') || hasPermission(permissions, 'orders_write');
  const { purchasePrice, ...publicFields } = row;
  return NextResponse.json({
    item: {
      ...publicFields,
      ...(canReadCost ? { purchasePrice } : {}),
      promoCodes: promoRows.map(toProductPromoResponse),
    },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const { response: denied, session } = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }
  const parsed = productPayloadSchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };

  try {
    await replaceProductThroughCanonicalWorkflow(db, numericId, parsed.data, actor);
  } catch (error) {
    if (
      error instanceof ProductMutationNotFoundError ||
      error instanceof ActionHistoryEntityNotFoundError
    )
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (error instanceof ProductIntegrityConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  await Promise.all([revalidateStorefrontProducts(), revalidateStorefrontLandingPages()]);

  try {
    await startProductCatalogFeedRefreshJob('product:update', requestId);
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'product-catalog-feed-enqueue',
      route: '/api/products/[id]',
      session,
      context: { trigger: 'product:update', productId: numericId },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const { response: denied, session } = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }
  const parsed = productPatchSchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };

  try {
    await mutateEntityWithHistory(db, {
      entityType: 'products',
      entityId: numericId,
      operation: 'update',
      actor,
      execute: async (tx) => {
        await assertUniqueProductIdentifiers(tx, parsed.data, numericId);
        return tx
          .update(products)
          .set({
            ...parsed.data,
            updatedAt: new Date(),
          })
          .where(eq(products.id, numericId));
      },
    });
  } catch (error) {
    if (
      error instanceof ProductMutationNotFoundError ||
      error instanceof ActionHistoryEntityNotFoundError
    )
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (error instanceof ProductIntegrityConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  await Promise.all([revalidateStorefrontProducts(), revalidateStorefrontLandingPages()]);

  try {
    await startProductCatalogFeedRefreshJob('product:patch', requestId);
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'product-catalog-feed-enqueue',
      route: '/api/products/[id]',
      session,
      context: { trigger: 'product:patch', productId: numericId },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId();
  const { response: denied, session } = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }
  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };

  try {
    await archiveProductThroughCanonicalWorkflow(db, numericId, actor);
  } catch (error) {
    if (
      error instanceof ProductMutationNotFoundError ||
      error instanceof ActionHistoryEntityNotFoundError
    ) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw error;
  }

  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  await Promise.all([revalidateStorefrontProducts(), revalidateStorefrontLandingPages()]);

  try {
    await startProductCatalogFeedRefreshJob('product:delete', requestId);
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'product-catalog-feed-enqueue',
      route: '/api/products/[id]',
      session,
      context: { trigger: 'product:delete', productId: numericId },
    });
  }

  return NextResponse.json({ ok: true, archived: true });
}
