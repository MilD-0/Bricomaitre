import { NextRequest, NextResponse } from 'next/server';

import {
  ActionHistoryConflictError,
  ActionHistoryEntityNotFoundError,
} from '@/lib/action-history-state';
import { getDb, hasDb } from '@bric/db/client';
import { reorderAdminAssets } from '@/lib/asset-mutations';
import { assetReorderSchema } from '@/lib/assets';
import { requireMutationAccess } from '@/lib/rbac';

export async function POST(req: NextRequest) {
  const { response: denied, session } = await requireMutationAccess('assets');
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

  try {
    await reorderAdminAssets(getDb(), parsed.data, {
      email: session?.user?.email,
      name: session?.user?.name,
    });
  } catch (error) {
    if (error instanceof ActionHistoryEntityNotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof ActionHistoryConflictError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ ok: true });
}
