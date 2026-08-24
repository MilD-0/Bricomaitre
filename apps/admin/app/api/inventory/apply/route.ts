import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { applyAdminInventoryBatch } from '../../../../lib/admin-inventory-workflow';
import { auth } from '../../../../lib/auth';
import { inventoryApplyRequestSchema } from '../../../../lib/inventory';
import { requireMutationAccess } from '../../../../lib/rbac';

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
  const result = await applyAdminInventoryBatch(db, parsed.data, actor);
  return NextResponse.json({
    ok: true,
    items: result.items,
    skipped: result.skipped.map((item) => ({
      productId: item.productId,
      reason:
        item.reason === 'insufficient' ? 'Insufficient inventory quantity.' : 'Product not found.',
    })),
  });
}
