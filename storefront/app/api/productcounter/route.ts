import { NextRequest, NextResponse } from "next/server";

import {
  fetchLegacyProductsPage,
} from "@/lib/storefront-api";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const result = await fetchLegacyProductsPage({
    page: Number(url.searchParams.get("page") ?? "1"),
    limit: Number(url.searchParams.get("limit") ?? "20"),
    search: url.searchParams.get("search") ?? undefined,
    category: url.searchParams.get("category"),
    childCategory: url.searchParams.get("childCategory"),
    brand: url.searchParams.get("brand"),
    instock: url.searchParams.get("instock") === "true",
    sortby: url.searchParams.get("sortby"),
  });

  return NextResponse.json({
    products: result.products,
    pagination: result.pagination,
  });
}
