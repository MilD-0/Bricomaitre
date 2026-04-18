import { NextRequest, NextResponse } from "next/server";

import { fetchCatalogContext, listAllStorefrontProducts, normalizeProduct } from "@/lib/storefront-api";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const context = await fetchCatalogContext();
  const products = (await listAllStorefrontProducts()).map((product) =>
    normalizeProduct(product, context),
  );
  const matched = products.find(
    (product) => product._id === id || product.slug === id || product.mongo_id === id,
  );

  return NextResponse.json({ price: matched?.price ?? 0 });
}
