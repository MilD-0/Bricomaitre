import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { auth } from '../../../../lib/auth';
import { applyInventoryQuantityChange } from '../../../../lib/inventory-actions';
import { inventoryApplyRequestSchema } from '../../../../lib/inventory';
import { requireMutationAccess } from '../../../../lib/rbac';
import { CACHE_TAGS, revalidateServerTags } from '../../../../lib/server-cache';
import { revalidateStorefrontProducts } from '../../../../lib/storefront-revalidate';

export async function POST(req: NextRequest) {
  const denied = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = inventoryApplyRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const items: Array<{ productId: number; previousQuantity: number; nextQuantity: number }> = [];
  const skipped: Array<{ productId: number; reason: string }> = [];

  for (const item of parsed.data.items) {
    const result = await applyInventoryQuantityChange(db, {
      productId: item.productId,
      mode: parsed.data.mode,
      quantity: item.quantity,
      actor,
    });

    if (result.kind !== 'updated') {
      skipped.push({ productId: item.productId, reason: 'Product not found.' });
      continue;
    }

    items.push({
      productId: item.productId,
      previousQuantity: result.previousQuantity,
      nextQuantity: result.nextQuantity,
    });
  }

  if (items.length > 0) {
    revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
    await revalidateStorefrontProducts();
  }

  return NextResponse.json({
    ok: true,
    items,
    skipped,
  });
}
