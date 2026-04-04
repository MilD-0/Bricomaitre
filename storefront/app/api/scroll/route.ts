import { NextRequest, NextResponse } from "next/server";

import {
  fetchCatalogContext,
  listAllStorefrontProducts,
  normalizeProduct,
  sortLegacyProducts,
} from "@/lib/storefront-api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 20;
  const offset = (safePage - 1) * safeLimit;

  const context = await fetchCatalogContext();
  const products = sortLegacyProducts(
    (await listAllStorefrontProducts())
      .map((product) => normalizeProduct(product, context))
      .filter((product) => product.stock > 0),
  );

  const totalPages = Math.ceil(products.length / safeLimit);

  return NextResponse.json({
    products: products.slice(offset, offset + safeLimit),
    currentPage: safePage,
    totalPages,
    totalCount: products.length,
    limit: safeLimit,
    hasMore: safePage < totalPages,
    pagination: {
      currentPage: safePage,
      totalPages,
      totalCount: products.length,
      limit: safeLimit,
      hasMore: safePage < totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
      nextPage: safePage < totalPages ? safePage + 1 : null,
      prevPage: safePage > 1 ? safePage - 1 : null,
    },
  });
}
