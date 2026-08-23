import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { reorderAdminAssets } from '../../../../lib/asset-mutations';
import { assetReorderSchema } from '../../../../lib/assets';
import { requireMutationAccess } from '../../../../lib/rbac';

export async function POST(req: NextRequest) {
  const denied = await requireMutationAccess('assets');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const parsed = assetReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await reorderAdminAssets(getDb(), parsed.data);
  return NextResponse.json({ ok: true });
}
