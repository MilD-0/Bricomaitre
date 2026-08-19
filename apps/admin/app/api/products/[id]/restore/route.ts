import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { products } from '@bric/db/schema';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

import { auth } from '../../../../../lib/auth';
import { mutateEntityWithHistory } from '../../../../../lib/action-history';
import { requireMutationAccess } from '../../../../../lib/rbac';
import { CACHE_TAGS, revalidateServerTags } from '../../../../../lib/server-cache';
import { revalidateStorefrontProducts } from '../../../../../lib/storefront-revalidate';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('products');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const productId = parsePositiveIntegerId((await params).id);
  if (productId === null) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }

  const db = getDb();
  const session = await auth();
  const result = await mutateEntityWithHistory(db, {
    entityType: 'products',
    entityId: productId,
    operation: 'update',
    actor: { email: session?.user?.email, name: session?.user?.name },
    execute: (tx) =>
      tx
        .update(products)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(eq(products.id, productId))
        .returning({ id: products.id }),
  });
  if (result.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  await revalidateStorefrontProducts();
  return NextResponse.json({ ok: true });
}
