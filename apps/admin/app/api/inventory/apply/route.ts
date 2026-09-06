import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { applyAdminInventoryBatch } from '../../../../lib/admin-inventory-workflow';
import { inventoryApplyRequestSchema } from '../../../../lib/inventory';
import { requireMutationAccess } from '../../../../lib/rbac';
import { AdminMutationIdempotencyConflictError } from '../../../../lib/admin-mutation-idempotency';

export async function POST(req: NextRequest) {
  const { response: denied, session } = await requireMutationAccess('products');
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

  const actor = { email: session?.user?.email, name: session?.user?.name };
  let result;
  try {
    result = await applyAdminInventoryBatch(db, parsed.data, actor);
  } catch (error) {
    if (error instanceof AdminMutationIdempotencyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({
    ...result,
    skipped: result.skipped.map((item) => ({
      productId: item.productId,
      reason:
        item.reason === 'insufficient' ? 'Insufficient inventory quantity.' : 'Product not found.',
    })),
  });
}
