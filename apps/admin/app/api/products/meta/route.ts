import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { brands, categories } from '@bric/db/schema';
import { requireAppAccess } from '../../../../lib/rbac';
import { CACHE_TAGS } from '../../../../lib/server-cache';

const getCachedProductsMeta = unstable_cache(
  async () =>
    Promise.all([
      getDb().select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name)),
      getDb()
        .select({
          id: categories.id,
          name: categories.name,
          parentId: categories.parentId,
          properties: categories.properties,
        })
        .from(categories),
    ]),
  ['admin-products-meta'],
  { revalidate: 3600, tags: [CACHE_TAGS.productsMeta] },
);

export async function GET() {
  const denied = await requireAppAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ brands: [], categories: [] });
  }

  const [brandRows, categoryRows] = await getCachedProductsMeta();

  return NextResponse.json({ brands: brandRows, categories: categoryRows });
}
