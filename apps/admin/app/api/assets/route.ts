import { eq, sql } from 'drizzle-orm';
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
import { loadAssetsData } from '../../../lib/admin-assets-data';
import {
  assetBannerSchema,
  featuredProductGroupSchema,
  productCardSchema,
} from '../../../lib/assets';
import { mutateEntityWithHistory } from '../../../lib/action-history';
import { auth } from '../../../lib/auth';
import { requireMutationAccess } from '../../../lib/rbac';
import { revalidateStorefrontAssets } from '../../../lib/storefront-revalidate';

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

async function getNextSortOrder(
  db: Database,
  column:
    | typeof assetBanners.sortOrder
    | typeof featuredProductGroups.sortOrder
    | typeof productCards.sortOrder,
  table: typeof assetBanners | typeof featuredProductGroups | typeof productCards,
) {
  const [row] = await db
    .select({ value: sql<number>`coalesce(max(${column}), -1) + 1` })
    .from(table);
  return row?.value ?? 0;
}

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

  const body = (await req.json().catch(() => null)) as { kind?: string; data?: unknown } | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
  const db = getDb();
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  if (body.kind === 'banner') {
    const parsed = assetBannerSchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const sortOrder = await getNextSortOrder(db, assetBanners.sortOrder, assetBanners);
    await mutateEntityWithHistory(db, {
      entityType: 'assetBanners',
      operation: 'create',
      actor,
      execute: (tx) =>
        tx
          .insert(assetBanners)
          .values({ ...parsed.data, sortOrder })
          .returning({ id: assetBanners.id }),
      resolveEntityId: (rows) => rows[0]?.id,
    });
    await revalidateStorefrontAssets();
    return NextResponse.json({ ok: true });
  }

  if (body.kind === 'featuredGroup') {
    const parsed = featuredProductGroupSchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const sortOrder = await getNextSortOrder(
      db,
      featuredProductGroups.sortOrder,
      featuredProductGroups,
    );
    await mutateEntityWithHistory(db, {
      entityType: 'featuredProductGroups',
      operation: 'create',
      actor,
      execute: async (tx) => {
        const rows = await tx
          .insert(featuredProductGroups)
          .values({
            name: parsed.data.name,
            nameAr: parsed.data.nameAr,
            cta: parsed.data.cta,
            ctaAr: parsed.data.ctaAr,
            link: parsed.data.link,
            active: parsed.data.active,
            sortOrder,
            showAtTopOfProductsPage: parsed.data.showAtTopOfProductsPage,
          })
          .returning({ id: featuredProductGroups.id });

        const groupId = rows[0]?.id;
        if (!groupId) {
          throw new Error('Unable to create featured group');
        }

        await syncFeaturedGroupSelections(tx, groupId, parsed.data);
        return rows;
      },
      resolveEntityId: (result) => result[0]?.id,
    });

    await revalidateStorefrontAssets();
    return NextResponse.json({ ok: true });
  }

  if (body.kind === 'productCard') {
    const parsed = productCardSchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const sortOrder = await getNextSortOrder(db, productCards.sortOrder, productCards);
    await mutateEntityWithHistory(db, {
      entityType: 'productCards',
      operation: 'create',
      actor,
      execute: (tx) =>
        tx
          .insert(productCards)
          .values({ ...parsed.data, sortOrder })
          .returning({ id: productCards.id }),
      resolveEntityId: (rows) => rows[0]?.id,
    });
    await revalidateStorefrontAssets();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unsupported asset kind' }, { status: 400 });
}
