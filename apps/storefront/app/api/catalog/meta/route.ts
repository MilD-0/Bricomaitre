import { NextResponse } from 'next/server';

import { getStorefrontCatalogMeta } from '@/lib/storefront-api';

export async function GET() {
  try {
    const meta = await getStorefrontCatalogMeta();
    return NextResponse.json({
      categories: meta.categories.map(({ id, name, nameAr, slug, parentId }) => ({
        id,
        name,
        nameAr,
        slug,
        parentId,
      })),
      brands: meta.brands.map(({ id, name, slug }) => ({ id, name, slug })),
    });
  } catch {
    return NextResponse.json({ error: 'Catalog metadata unavailable' }, { status: 503 });
  }
}
