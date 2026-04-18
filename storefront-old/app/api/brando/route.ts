import { NextRequest, NextResponse } from "next/server";

import { fetchStorefrontBrands, normalizeBrand } from "@/lib/storefront-api";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const brands = (await fetchStorefrontBrands()).map(normalizeBrand);

  if (id) {
    const brand = brands.find((item) => item._id === id || item.slug === id) ?? null;
    return NextResponse.json(brand, { status: brand ? 200 : 404 });
  }

  return NextResponse.json(brands);
}
