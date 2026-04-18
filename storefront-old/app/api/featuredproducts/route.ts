import { NextRequest, NextResponse } from "next/server";

import {
  buildFeaturedProductIds,
  fetchCatalogContext,
  filterProductsByIds,
  listAllStorefrontProducts,
  normalizeProduct,
} from "@/lib/storefront-api";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const featuredOnly = url.searchParams.has("featured");
  const context = await fetchCatalogContext();
  const products = (await listAllStorefrontProducts()).map((product) =>
    normalizeProduct(product, context),
  );

  if (!featuredOnly) {
    return NextResponse.json([]);
  }

  const featuredIds = buildFeaturedProductIds(context.assets).map(String);
  return NextResponse.json(filterProductsByIds(products, featuredIds).slice(0, 12));
}
