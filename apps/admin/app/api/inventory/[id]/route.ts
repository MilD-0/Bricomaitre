import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ActionHistoryEntityNotFoundError } from '../../../../lib/action-history-state';
import { ProductIntegrityConflictError } from '../../../../lib/product-integrity';

import { getDb, hasDb } from '@bric/db/client';
import { updateAdminInventoryProduct } from '../../../../lib/admin-inventory-workflow';
import { auth } from '../../../../lib/auth';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { applyInventoryQuantityChange } from '../../../../lib/inventory-actions';
import { inventoryBarcodeSchema } from '../../../../lib/inventory';
import { requireMutationAccess } from '../../../../lib/rbac';
import { CACHE_TAGS, revalidateServerTags } from '../../../../lib/server-cache';
import { revalidateStorefrontProducts } from '../../../../lib/storefront-revalidate';

const inventoryMutationSchema = z.union([
  z.object({
    delta: z.coerce
      .number()
      .int()
      .refine((value) => value !== 0, 'Delta must not be zero'),
  }),
  z.object({
    inStock: z.boolean(),
  }),
  inventoryBarcodeSchema,
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = inventoryMutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  let updated;
  try {
    updated =
      'delta' in parsed.data
        ? await applyInventoryQuantityChange(db, {
            productId: numericId,
            mode: parsed.data.delta > 0 ? 'increase' : 'decrease',
            quantity: Math.abs(parsed.data.delta),
            actor,
          })
        : {
            kind: 'updated' as const,
            item: await updateAdminInventoryProduct(db, numericId, parsed.data, actor),
          };
  } catch (error) {
    if (error instanceof ActionHistoryEntityNotFoundError)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (error instanceof ProductIntegrityConflictError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }

  if (updated.kind !== 'updated') {
    if (updated.kind === 'insufficient') {
      return NextResponse.json(
        {
          error: 'Insufficient inventory quantity',
          available: updated.available,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if ('delta' in parsed.data) {
    revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
    await revalidateStorefrontProducts();
  }

  return NextResponse.json({ ok: true, item: updated.item });
}
