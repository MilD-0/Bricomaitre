import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '../../../../db/client';
import { assetBanners, featuredProductGroups, productCards } from '../../../../db/schema';
import { assetReorderSchema } from '../../../../lib/assets';
import { auth } from '../../../../lib/auth';
import { requireMutationAccess } from '../../../../lib/rbac';
import { revalidateStorefrontAssets } from '../../../../lib/storefront-revalidate';

export async function POST(req: NextRequest) {
  const denied = await requireMutationAccess('assets');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const body = await req.json();
  const parsed = assetReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  await auth();

  await db.transaction(async (tx) => {
    const now = new Date();

    if (parsed.data.kind === 'banner') {
      await Promise.all(
        parsed.data.items.map(({ id, sortOrder }) =>
          tx.update(assetBanners).set({ sortOrder, updatedAt: now }).where(eq(assetBanners.id, id)),
        ),
      );
      return;
    }

    if (parsed.data.kind === 'featured-group') {
      await Promise.all(
        parsed.data.items.map(({ id, sortOrder }) =>
          tx.update(featuredProductGroups).set({ sortOrder, updatedAt: now }).where(eq(featuredProductGroups.id, id)),
        ),
      );
      return;
    }

    await Promise.all(
      parsed.data.items.map(({ id, sortOrder }) =>
        tx.update(productCards).set({ sortOrder, updatedAt: now }).where(eq(productCards.id, id)),
      ),
    );
  });

  await revalidateStorefrontAssets();
  return NextResponse.json({ ok: true });
}
