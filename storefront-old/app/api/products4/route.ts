import { NextRequest, NextResponse } from "next/server";

import {
  type AutocompleteProductEntry,
  type LegacyProduct,
  fetchCatalogContext,
  listAllStorefrontProducts,
  normalizeProduct,
} from "@/lib/storefront-api";

const AUTOCOMPLETE_CACHE_TTL_MS = 5 * 60 * 1000;
const autocompleteQueryCache = new Map<
  string,
  { expiresAt: number; entries: AutocompleteProductEntry[] }
>();

function normalizeSearchText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function rankAutocompleteResult(entry: AutocompleteProductEntry, query: string) {
  if (entry.product.stock <= 0) {
    return -1;
  }

  if (entry.titleNormalized === query || entry.titleArNormalized === query) {
    return 500;
  }

  if (entry.titleNormalized.startsWith(query)) {
    return 400;
  }

  if (entry.titleArNormalized.startsWith(query)) {
    return 350;
  }

  if (entry.tokenPrefixes.some((token) => token.startsWith(query))) {
    return 250;
  }

  if (entry.searchableText.includes(query)) {
    return 100;
  }

  return -1;
}

function buildAutocompleteEntry(product: LegacyProduct): AutocompleteProductEntry {
  const titleNormalized = normalizeSearchText(product.title);
  const titleArNormalized = normalizeSearchText(product.title_ar);
  const tokenPrefixes = Array.from(
    new Set(
      [
        product.title,
        product.title_ar,
        product.brandInfo?.name,
        product.categoryInfo?.name,
        product.categoryInfo?.name_ar,
        product.sku,
        product.barcode,
      ]
        .flatMap((value) =>
          normalizeSearchText(value)
            .replace(/[^a-z0-9\u0600-\u06ff]+/gi, " ")
            .split(/\s+/)
            .filter(Boolean),
        ),
    ),
  );

  return {
    product,
    titleNormalized,
    titleArNormalized,
    tokenPrefixes,
    searchableText: normalizeSearchText(
      [
        product.title,
        product.title_ar,
        product.brandInfo?.name,
        product.categoryInfo?.name,
        product.categoryInfo?.name_ar,
        product.sku,
        product.barcode,
      ].join(" "),
    ),
  };
}

async function getAutocompleteEntries(query: string) {
  const cached = autocompleteQueryCache.get(query);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.entries;
  }

  const context = await fetchCatalogContext();
  const products = (await listAllStorefrontProducts({ search: query })).map((product) =>
    normalizeProduct(product, context),
  );
  const entries = products.map(buildAutocompleteEntry);

  autocompleteQueryCache.set(query, {
    expiresAt: now + AUTOCOMPLETE_CACHE_TTL_MS,
    entries,
  });

  return entries;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = url.searchParams.get("search");
  const limit = Number(url.searchParams.get("limit") ?? "4");
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return NextResponse.json([]);
  }

  const products = await getAutocompleteEntries(normalizedQuery);

  const filtered = products
    .map((entry) => ({
      entry,
      score: rankAutocompleteResult(entry, normalizedQuery),
    }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      return left.entry.product.title.localeCompare(right.entry.product.title);
    })
    .map((item) => item.entry.product)
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 4);

  return NextResponse.json(filtered);
}
