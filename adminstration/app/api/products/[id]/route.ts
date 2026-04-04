import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '../../../../db/client';
import { products } from '../../../../db/schema';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import { auth } from '../../../../lib/auth';
import { productPatchSchema, productPayloadSchema } from '../../../../lib/products';
import { requireMutationAccess } from '../../../../lib/rbac';
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
  return {
    ...data,
    slug: await resolveProductSlug(data, currentId),
    price: data.price.toFixed(2),
    oldPrice: data.oldPrice == null ? null : data.oldPrice.toFixed(2),
    purchasePrice: data.purchasePrice == null ? null : data.purchasePrice.toFixed(2),
  };
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = Number(id);
  const row = await getDb().query.products.findFirst({ where: eq(products.id, numericId) });

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ item: row });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    execute: (tx) => tx
      .update(products)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(eq(products.id, numericId)),
  });

  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  return NextResponse.json({ ok: true });
}
