import { NextRequest, NextResponse } from "next/server";

import { fetchStorefrontBrands, normalizeBrand } from "@/lib/storefront-api";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const featuredOnly = url.searchParams.has("featured");
  const brands = (await fetchStorefrontBrands()).map(normalizeBrand);

  return NextResponse.json(
    featuredOnly ? brands.filter((brand) => brand.featured) : brands,
  );
}
