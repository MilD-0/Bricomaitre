import { NextResponse } from "next/server";

import {
  buildFeaturedProductIds,
  fetchCatalogContext,
  listAllStorefrontProducts,
  normalizeBanner,
} from "@/lib/storefront-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await fetchCatalogContext();
  const featuredIds = buildFeaturedProductIds(context.assets);
  const products = await listAllStorefrontProducts();
  const relevantProducts =
    featuredIds.length > 0
      ? products.filter((product) => featuredIds.includes(product.id))
      : products;

  return NextResponse.json(
    context.assets.banners.map((banner) => normalizeBanner(banner, relevantProducts)),
  );
}
