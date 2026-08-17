import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import {
  assetBanners,
  featuredProductGroupBrands,
  featuredProductGroupCategories,
  featuredProductGroupProducts,
  featuredProductGroups,
  productCards,
} from '@bric/db/schema';
import {
  assetActiveToggleSchema,
  assetBannerSchema,
  assetReplacementRequestSchema,
  featuredProductGroupToggleSchema,
  featuredProductGroupSchema,
  productCardSchema,
} from '../../../../../lib/assets';
import { mutateEntityWithHistory } from '../../../../../lib/action-history';
import { auth } from '../../../../../lib/auth';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { requireMutationAccess } from '../../../../../lib/rbac';
import { revalidateStorefrontAssets } from '../../../../../lib/storefront-revalidate';

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

async function syncFeaturedGroupSelections(
  tx: Transaction,
  groupId: number,
  value: ReturnType<typeof featuredProductGroupSchema.parse>,
) {
  await Promise.all([
    tx
      .delete(featuredProductGroupProducts)
      .where(eq(featuredProductGroupProducts.groupId, groupId)),
    tx.delete(featuredProductGroupBrands).where(eq(featuredProductGroupBrands.groupId, groupId)),
    tx
      .delete(featuredProductGroupCategories)
      .where(eq(featuredProductGroupCategories.groupId, groupId)),
  ]);

  if (value.productIds.length > 0) {
    await tx
      .insert(featuredProductGroupProducts)
      .values(value.productIds.map((productId) => ({ groupId, productId })));
  }

  if (value.brandIds.length > 0) {
    await tx
      .insert(featuredProductGroupBrands)
      .values(value.brandIds.map((brandId) => ({ groupId, brandId })));
  }

  if (value.categoryIds.length > 0) {
    await tx
      .insert(featuredProductGroupCategories)
      .values(value.categoryIds.map((categoryId) => ({ groupId, categoryId })));
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const denied = await requireMutationAccess('assets');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { kind, id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
  }
  const payload = await req.json().catch(() => null);
  if (payload === null) {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  if (kind === 'banner') {
    const parsed = assetActiveToggleSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid toggle payload' }, { status: 400 });
    }

    await mutateEntityWithHistory(db, {
      entityType: 'assetBanners',
      entityId: numericId,
      operation: 'update',
      actor,
      execute: (tx) =>
        tx
          .update(assetBanners)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(assetBanners.id, numericId)),
    });
    await revalidateStorefrontAssets();
    return NextResponse.json({ ok: true });
  }

  if (kind === 'featured-group') {
    const parsed = featuredProductGroupToggleSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid toggle payload' }, { status: 400 });
    }

    await mutateEntityWithHistory(db, {
      entityType: 'featuredProductGroups',
      entityId: numericId,
      operation: 'update',
      actor,
      execute: (tx) =>
        tx
          .update(featuredProductGroups)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(featuredProductGroups.id, numericId)),
    });
    await revalidateStorefrontAssets();
    return NextResponse.json({ ok: true });
  }

  if (kind === 'product-card') {
    const parsed = assetActiveToggleSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid toggle payload' }, { status: 400 });
    }

    await mutateEntityWithHistory(db, {
      entityType: 'productCards',
      entityId: numericId,
      operation: 'update',
      actor,
      execute: (tx) =>
        tx
          .update(productCards)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(productCards.id, numericId)),
    });
    await revalidateStorefrontAssets();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unsupported asset kind' }, { status: 400 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const denied = await requireMutationAccess('assets');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { kind, id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
  }
  const body = assetReplacementRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  if (kind === 'banner') {
    const parsed = assetBannerSchema.safeParse(body.data.data);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await mutateEntityWithHistory(db, {
      entityType: 'assetBanners',
      entityId: numericId,
      operation: 'update',
      actor,
      execute: (tx) =>
        tx
          .update(assetBanners)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(assetBanners.id, numericId)),
    });
    await revalidateStorefrontAssets();
    return NextResponse.json({ ok: true });
  }

  if (kind === 'featured-group') {
    const parsed = featuredProductGroupSchema.safeParse(body.data.data);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await mutateEntityWithHistory(db, {
      entityType: 'featuredProductGroups',
      entityId: numericId,
      operation: 'update',
      actor,
      execute: async (tx) => {
        await tx
          .update(featuredProductGroups)
          .set({
            name: parsed.data.name,
            nameAr: parsed.data.nameAr,
            cta: parsed.data.cta,
            ctaAr: parsed.data.ctaAr,
            link: parsed.data.link,
            active: parsed.data.active,
            showAtTopOfProductsPage: parsed.data.showAtTopOfProductsPage,
            updatedAt: new Date(),
          })
          .where(eq(featuredProductGroups.id, numericId));

        await syncFeaturedGroupSelections(tx, numericId, parsed.data);
      },
    });

    await revalidateStorefrontAssets();
    return NextResponse.json({ ok: true });
  }

  if (kind === 'product-card') {
    const parsed = productCardSchema.safeParse(body.data.data);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await mutateEntityWithHistory(db, {
      entityType: 'productCards',
      entityId: numericId,
      operation: 'update',
      actor,
      execute: (tx) =>
        tx
          .update(productCards)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(productCards.id, numericId)),
    });
    await revalidateStorefrontAssets();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unsupported asset kind' }, { status: 400 });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const denied = await requireMutationAccess('assets');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { kind, id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
  }
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  if (kind === 'banner') {
    await mutateEntityWithHistory(db, {
      entityType: 'assetBanners',
      entityId: numericId,
      operation: 'delete',
      actor,
      execute: (tx) => tx.delete(assetBanners).where(eq(assetBanners.id, numericId)),
    });
    await revalidateStorefrontAssets();
    return NextResponse.json({ ok: true });
  }

  if (kind === 'featured-group') {
    await mutateEntityWithHistory(db, {
      entityType: 'featuredProductGroups',
      entityId: numericId,
      operation: 'delete',
      actor,
      execute: async (tx) => {
        await Promise.all([
          tx
            .delete(featuredProductGroupProducts)
            .where(eq(featuredProductGroupProducts.groupId, numericId)),
          tx
            .delete(featuredProductGroupBrands)
            .where(eq(featuredProductGroupBrands.groupId, numericId)),
          tx
            .delete(featuredProductGroupCategories)
            .where(eq(featuredProductGroupCategories.groupId, numericId)),
        ]);

        await tx.delete(featuredProductGroups).where(eq(featuredProductGroups.id, numericId));
      },
    });
    await revalidateStorefrontAssets();
    return NextResponse.json({ ok: true });
  }

  if (kind === 'product-card') {
    await mutateEntityWithHistory(db, {
      entityType: 'productCards',
      entityId: numericId,
      operation: 'delete',
      actor,
      execute: (tx) => tx.delete(productCards).where(eq(productCards.id, numericId)),
    });
    await revalidateStorefrontAssets();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unsupported asset kind' }, { status: 400 });
}
