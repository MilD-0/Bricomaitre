import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';

import { getDb, hasDb } from '../../../../db/client';
import { brands, categories } from '../../../../db/schema';
import { applyServerCache, CACHE_TAGS } from '../../../../lib/server-cache';

async function getCachedProductsMeta() {
  applyServerCache({ stale: 300, revalidate: 3600, expire: 86400 }, CACHE_TAGS.productsMeta);

  return Promise.all([
    getDb().select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name)),
    getDb().select({ id: categories.id, name: categories.name, parentId: categories.parentId, properties: categories.properties }).from(categories),
  ]);
}

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ brands: [], categories: [] });
  }

  const [brandRows, categoryRows] = await getCachedProductsMeta();

  return NextResponse.json({ brands: brandRows, categories: categoryRows });
}
