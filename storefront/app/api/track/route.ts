import { NextRequest, NextResponse } from "next/server";

import {
  findBrandByToken,
  fetchCatalogContext,
  listAllStorefrontProducts,
  normalizeProduct,
  normalizeBrand,
  normalizeCategory,
  resolveCategoryIds,
  sortLegacyProducts,
} from "@/lib/storefront-api";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const childCategory = url.searchParams.get("childCategory");
  const brand = url.searchParams.get("brand");
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "10");

  const context = await fetchCatalogContext();
  const categories = context.categories.map(normalizeCategory);
  const brands = context.brands.map(normalizeBrand);
  const categoryIds = resolveCategoryIds(categories, category, childCategory);
  const selectedBrand = findBrandByToken(brands, brand);
  const products = (await listAllStorefrontProducts()).map((product) =>
    normalizeProduct(product, context),
  );
  const filtered = sortLegacyProducts(
    products.filter((product) => {
      if (selectedBrand && product.brand !== selectedBrand._id) {
        return false;
      }
      if (categoryIds.length > 0 && !categoryIds.includes(product.category ?? "")) {
        return false;
      }
      return true;
    }),
  );

  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 10;
  const offset = (safePage - 1) * safeLimit;
  const items = filtered.slice(offset, offset + safeLimit);
  const totalPages = Math.ceil(filtered.length / safeLimit);

  return NextResponse.json({
    products: items,
    pagination: {
      currentPage: safePage,
      totalPages,
      totalCount: filtered.length,
      hasMore: safePage < totalPages,
      hasPrevious: safePage > 1,
      limit: safeLimit,
    },
  });
}
