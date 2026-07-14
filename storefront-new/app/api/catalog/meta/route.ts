import { NextResponse } from 'next/server';

import { getStorefrontCatalogMeta } from '@/lib/storefront-api';

export async function GET() {
  try {
    const meta = await getStorefrontCatalogMeta();
    return NextResponse.json({
      items: meta.categories
        .filter((category) => category.featured)
        .slice(0, 4)
        .map(({ id, name, nameAr }) => ({ id, name, nameAr })),
    });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
