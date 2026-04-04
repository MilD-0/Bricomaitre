import { NextRequest, NextResponse } from "next/server";

import { fetchStorefrontCategories, normalizeCategory } from "@/lib/storefront-api";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const featuredOnly = url.searchParams.has("featured");
  const id = url.searchParams.get("id") ?? url.searchParams.get("categoryid");
  const categories = (await fetchStorefrontCategories()).map(normalizeCategory);

  if (id) {
    const category =
      categories.find((item) => item._id === id || item.slug === id) ?? null;
    return NextResponse.json(category, { status: category ? 200 : 404 });
  }

  return NextResponse.json(
    featuredOnly ? categories.filter((category) => category.featured) : categories,
  );
}
