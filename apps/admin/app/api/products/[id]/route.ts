import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { landingPages, productPromoCodes, products } from '@bric/db/schema';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import { auth } from '../../../../lib/auth';
import { startProductCatalogFeedRefreshJob } from '../../../../lib/background-jobs';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { productPatchSchema, productPayloadSchema } from '../../../../lib/products';
import { toProductMutationValues, toProductPromoRows } from '../../../../lib/product-mutations';
import { requireAppAccess, requireMutationAccess } from '../../../../lib/rbac';
import { captureAdminException, getRequestId } from '../../../../lib/sentry';
import { CACHE_TAGS, revalidateServerTags } from '../../../../lib/server-cache';
import {
  revalidateStorefrontLandingPages,
  revalidateStorefrontProducts,
} from '../../../../lib/storefront-revalidate';

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
  const denied = await requireAppAccess();
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

  return NextResponse.json({ item: { ...row, promoCodes: promoRows.map(toProductPromoResponse) } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const denied = await requireMutationAccess('products');
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

  const data = parsed.data;
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const values = await toProductMutationValues(data, numericId);

  await mutateEntityWithHistory(db, {
    entityType: 'products',
    entityId: numericId,
    operation: 'update',
    actor,
    execute: async (tx) => {
      const updatedAt = new Date();
      await tx
        .update(products)
        .set({
          ...values,
          updatedAt,
        })
        .where(eq(products.id, numericId));
      await tx
        .update(landingPages)
        .set({ slug: values.slug, updatedAt, updatedBy: actor.email })
        .where(eq(landingPages.productId, numericId));
      if (Array.isArray(data.promoCodes)) {
        await tx.delete(productPromoCodes).where(eq(productPromoCodes.productId, numericId));
        const promoRows = toProductPromoRows(numericId, data.promoCodes);
        if (promoRows.length > 0) {
          await tx.insert(productPromoCodes).values(promoRows);
        }
      }
    },
  });

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
  const denied = await requireMutationAccess('products');
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
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  await mutateEntityWithHistory(db, {
    entityType: 'products',
    entityId: numericId,
    operation: 'update',
    actor,
    execute: (tx) =>
      tx
        .update(products)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
        })
        .where(eq(products.id, numericId)),
  });

  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  await revalidateStorefrontProducts();

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
  const denied = await requireMutationAccess('products');
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
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  await mutateEntityWithHistory(db, {
    entityType: 'products',
    entityId: numericId,
    operation: 'delete',
    actor,
    execute: (tx) => tx.delete(products).where(eq(products.id, numericId)),
  });

  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  await revalidateStorefrontProducts();

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

  return NextResponse.json({ ok: true });
}
