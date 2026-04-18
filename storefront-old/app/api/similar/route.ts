import { NextRequest, NextResponse } from "next/server";

import {
  findBrandByToken,
  fetchCatalogContext,
  listAllStorefrontProducts,
  matchesSearch,
  normalizeBrand,
  normalizeCategory,
  normalizeProduct,
  resolveCategoryIds,
  sortLegacyProducts,
} from "@/lib/storefront-api";

export const dynamic = "force-dynamic";

function normalizeText(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value?: string | null) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length > 2),
  );
}

function getProductTokens(product: ReturnType<typeof normalizeProduct>) {
  const values = [
    ...Array.from(tokenize(product.title)),
    ...Array.from(tokenize(product.title_ar)),
    ...Array.from(tokenize(product.summary)),
    ...Array.from(tokenize(product.summary_ar)),
    ...Array.from(tokenize(product.description)),
    ...Array.from(tokenize(product.description_ar)),
    ...product.features.flatMap((feature) => Array.from(tokenize(feature))),
    ...product.features_ar.flatMap((feature) => Array.from(tokenize(feature))),
  ];

  return new Set(values);
}

function countOverlap(left: Set<string>, right: Set<string>) {
  let overlap = 0;
  left.forEach((token) => {
    if (right.has(token)) {
      overlap += 1;
    }
  });
  return overlap;
}

function buildCategoryParentMap(categories: ReturnType<typeof normalizeCategory>[]) {
  return new Map(categories.map((category) => [category._id, category.parent]));
}

function getCategoryFamily(
  product: ReturnType<typeof normalizeProduct>,
  parentMap: Map<string, string | null>,
) {
  const categoryId = product.category ?? null;
  const parentCategoryId = categoryId ? parentMap.get(categoryId) ?? null : null;

  return { categoryId, parentCategoryId };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = url.searchParams.get("search") ?? undefined;
  const productId = url.searchParams.get("productId");
  const category = url.searchParams.get("category");
  const childCategory = url.searchParams.get("childCategory");
  const brand = url.searchParams.get("brand");
  const instock = url.searchParams.get("instock");
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "6");
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 6;

  const context = await fetchCatalogContext();
  const categories = context.categories.map(normalizeCategory);
  const brands = context.brands.map(normalizeBrand);
  const parentMap = buildCategoryParentMap(categories);
  const categoryIds = resolveCategoryIds(categories, category, childCategory);
  const selectedBrand = findBrandByToken(brands, brand);
  const allProducts = (await listAllStorefrontProducts({ search: query })).map((product) =>
    normalizeProduct(product, context),
  );

  if (productId) {
    const currentProduct =
      allProducts.find(
        (product) =>
          product._id === productId
          || product.slug === productId
          || product.mongo_id === productId,
      ) ?? null;

    if (!currentProduct) {
      return NextResponse.json({ products: [], count: 0 }, { status: 404 });
    }

    const currentTokens = getProductTokens(currentProduct);
    const { categoryId, parentCategoryId } = getCategoryFamily(
      currentProduct,
      parentMap,
    );

    const rankedProducts = allProducts
      .filter((product) => product._id !== currentProduct._id)
      .filter((product) => (instock === "true" ? product.stock > 0 : true))
      .map((product) => {
        const candidateTokens = getProductTokens(product);
        const overlap = countOverlap(currentTokens, candidateTokens);
        const { categoryId: candidateCategoryId, parentCategoryId: candidateParentId } =
          getCategoryFamily(product, parentMap);
        const priceBaseline = Math.max(currentProduct.price, 1);
        const priceGap = Math.abs(product.price - currentProduct.price) / priceBaseline;

        let score = 0;

        if (categoryId && candidateCategoryId === categoryId) {
          score += 8;
        } else if (
          parentCategoryId
          && candidateParentId
          && candidateParentId === parentCategoryId
        ) {
          score += 4;
        }

        if (currentProduct.brand && product.brand === currentProduct.brand) {
          score += 3;
        }

        score += Math.min(overlap, 8) * 1.5;

        if (priceGap <= 0.15) {
          score += 2;
        } else if (priceGap <= 0.3) {
          score += 1;
        } else if (priceGap <= 0.5) {
          score += 0.5;
        }

        if (product.stock > 0) {
          score += 0.5;
        }

        return { product, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return Date.parse(right.product.updatedAt) - Date.parse(left.product.updatedAt);
      })
      .map(({ product }) => product);

    const offset = (safePage - 1) * safeLimit;
    const items = rankedProducts.slice(offset, offset + safeLimit);
    const totalPages = Math.ceil(rankedProducts.length / safeLimit);

    return NextResponse.json({
      products: items,
      count: rankedProducts.length,
      pagination: {
        currentPage: safePage,
        totalPages,
        totalCount: rankedProducts.length,
        hasMore: safePage < totalPages,
        hasPrevious: safePage > 1,
        limit: safeLimit,
      },
    });
  }

  const products = sortLegacyProducts(
    allProducts.filter((product) => {
      if (instock === "true" && product.stock <= 0) {
        return false;
      }
      if (selectedBrand && product.brand !== selectedBrand._id) {
        return false;
      }
      if (categoryIds.length > 0 && !categoryIds.includes(product.category ?? "")) {
        return false;
      }

      return matchesSearch(product, query);
    }),
  );

  if (products.length <= 6) {
    return NextResponse.json(null);
  }

  return NextResponse.json({
    products: products.slice(0, safeLimit),
    count: products.length,
    pagination: {
      currentPage: safePage,
      totalPages: 1,
      totalCount: products.length,
      hasMore: false,
      hasPrevious: false,
      limit: safeLimit,
    },
  });
}
