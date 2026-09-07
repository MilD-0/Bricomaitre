import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { inspectAdminInventoryScan } from '@/lib/admin-inventory-workflow';
import { inventoryScanQuerySchema } from '@/lib/inventory';
import { requireMutationAccess } from '@/lib/rbac';

export async function POST(req: NextRequest) {
  const { response: denied } = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = inventoryScanQuerySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json(await inspectAdminInventoryScan(getDb(), parsed.data));
}
