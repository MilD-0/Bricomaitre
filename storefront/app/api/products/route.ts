import { NextRequest, NextResponse } from "next/server";

import {
  fetchLegacyProductByToken,
  fetchLegacyProductsPage,
} from "@/lib/storefront-api";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const matched = await fetchLegacyProductByToken(id);
    return NextResponse.json(matched, { status: matched ? 200 : 404 });
  }

  const result = await fetchLegacyProductsPage({
    page: Number(url.searchParams.get("page") ?? "1"),
    limit: Number(url.searchParams.get("limit") ?? "6"),
    search: url.searchParams.get("search") ?? undefined,
    instock: true,
    category: url.searchParams.get("category"),
    childCategory: url.searchParams.get("childCategory"),
    brand: url.searchParams.get("brand"),
    sortby: url.searchParams.get("sortby"),
  });

  return NextResponse.json(result.products);
}
