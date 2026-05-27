import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '../../../../db/client';
import { productPromoCodes, products } from '../../../../db/schema';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import { auth } from '../../../../lib/auth';
import { startProductCatalogFeedRefreshJob } from '../../../../lib/background-jobs';
import { normalizePromoCode, productPatchSchema, productPayloadSchema, type ProductPromoCodePayload } from '../../../../lib/products';
import { requireAppAccess, requireMutationAccess } from '../../../../lib/rbac';
import { captureAdminException, getRequestId } from '../../../../lib/sentry';
import { CACHE_TAGS, revalidateServerTags } from '../../../../lib/server-cache';
import { resolveUniqueSlug } from '../../../../lib/slug';

async function resolveProductSlug(
  data: ReturnType<typeof productPayloadSchema.parse>,
  currentId?: number,
) {
  const db = getDb() as {
    query?: {
      products?: {
        findFirst?: (input: unknown) => Promise<{ id: number } | undefined>;
      };
    };
  };

  if (!db.query?.products?.findFirst) {
    return resolveUniqueSlug(data.slug ?? data.title, async () => false);
  }

  return resolveUniqueSlug(data.slug ?? data.title, async (slug) => {
    const existing = await db.query?.products?.findFirst?.({
      columns: { id: true },
      where: (
        productsTable: typeof products,
        helpers: { and: typeof import('drizzle-orm').and; eq: typeof import('drizzle-orm').eq; ne: typeof import('drizzle-orm').ne },
      ) => (
        currentId == null
          ? helpers.eq(productsTable.slug, slug)
          : helpers.and(
            helpers.eq(productsTable.slug, slug),
            helpers.ne(productsTable.id, currentId),
          )
      ),
    });

    return Boolean(existing);
  });
}

async function toProductMutationValues(
  data: ReturnType<typeof productPayloadSchema.parse>,
  currentId?: number,
) {
  const { promoCodes: _promoCodes, ...productValues } = data;
  return {
    ...productValues,
    slug: await resolveProductSlug(data, currentId),
    price: data.price.toFixed(2),
    oldPrice: data.oldPrice == null ? null : data.oldPrice.toFixed(2),
    purchasePrice: data.purchasePrice == null ? null : data.purchasePrice.toFixed(2),
  };
}

function toPromoDate(value: string | null) {
  return value === null ? null : new Date(value);
}

function toProductPromoRows(productId: number, promoCodes: ProductPromoCodePayload[]) {
  const now = new Date();

  return promoCodes.map((promo) => ({
    productId,
    code: promo.code,
    normalizedCode: normalizePromoCode(promo.code),
    promoPrice: promo.promoPrice.toFixed(2),
    active: promo.active,
    startsAt: toPromoDate(promo.startsAt),
    endsAt: toPromoDate(promo.endsAt),
    createdAt: now,
    updatedAt: now,
  }));
}

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
  const numericId = Number(id);
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
  const numericId = Number(id);
  const parsed = productPayloadSchema.safeParse(await req.json());

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
      await tx
        .update(products)
        .set({
          ...values,
          updatedAt: new Date(),
        })
        .where(eq(products.id, numericId));
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
  const numericId = Number(id);
  const parsed = productPatchSchema.safeParse(await req.json());

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
    execute: (tx) => tx
      .update(products)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(products.id, numericId)),
  });

  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);

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
  const numericId = Number(id);
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
