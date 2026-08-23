import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { loadAssetsData } from '../../../lib/admin-assets-data';
import {
  assetMutationRequestSchema,
  assetBannerSchema,
  featuredProductGroupSchema,
  productCardSchema,
} from '../../../lib/assets';
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

  if (body.data.kind === 'banner') {
    const parsed = assetBannerSchema.safeParse(body.data.data);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await createAdminAsset(db, 'banner', parsed.data, actor);
    return NextResponse.json({ ok: true });
  }

  if (body.data.kind === 'featuredGroup') {
    const parsed = featuredProductGroupSchema.safeParse(body.data.data);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await createAdminAsset(db, 'featured-group', parsed.data, actor);
    return NextResponse.json({ ok: true });
  }

  if (body.data.kind === 'productCard') {
    const parsed = productCardSchema.safeParse(body.data.data);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await createAdminAsset(db, 'product-card', parsed.data, actor);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unsupported asset kind' }, { status: 400 });
}
