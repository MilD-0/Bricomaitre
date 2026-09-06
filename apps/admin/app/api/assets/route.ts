import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { getDb, hasDb } from '@bric/db/client';
import { loadAssetsData } from '../../../lib/admin-assets-data';
import { assetMutationRequestSchema } from '../../../lib/assets';
import { createAdminAsset } from '../../../lib/asset-mutations';
import { auth } from '../../../lib/auth';
import { requireMutationAccess } from '../../../lib/rbac';

export async function GET() {
  const denied = await requireMutationAccess('assets');
  if (denied) {
    return denied;
  }

  return NextResponse.json(await loadAssetsData());
}

export async function POST(req: NextRequest) {
  const denied = await requireMutationAccess('assets');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const body = assetMutationRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  const kind =
    body.data.kind === 'banner'
      ? 'banner'
      : body.data.kind === 'featuredGroup'
        ? 'featured-group'
        : body.data.kind === 'productCard'
          ? 'product-card'
          : null;
  if (!kind) return NextResponse.json({ error: 'Unsupported asset kind' }, { status: 400 });
  try {
    await createAdminAsset(db, kind, body.data.data, actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    throw error;
  }
}
