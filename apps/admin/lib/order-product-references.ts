import { isMongoObjectId, parseOrderProductId } from './orders';

type CartProductReferenceBuckets = {
  productIds: number[];
  mongoIds: string[];
  slugs: string[];
};

type CartProductLookupRow = {
  id: number;
  mongoId: string | null;
  slug?: string | null;
};

export function getCartProductLookupKey(rawValue: string) {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return null;
  }

  if (isMongoObjectId(trimmed)) {
    return `mongo:${trimmed}`;
  }

  const productId = parseOrderProductId(trimmed);
  return productId === null ? `reference:${trimmed}` : `id:${productId}`;
}

export function collectCartProductReferenceBuckets(
  rows: Array<{ cartProducts: string[] | null }>,
): CartProductReferenceBuckets {
  const productIds = new Set<number>();
  const mongoIds = new Set<string>();
  const slugs = new Set<string>();

  for (const row of rows) {
    for (const rawValue of row.cartProducts ?? []) {
      const trimmed = rawValue.trim();

      if (isMongoObjectId(trimmed)) {
        mongoIds.add(trimmed);
        continue;
      }

      const productId = parseOrderProductId(trimmed);
      if (productId !== null) {
        productIds.add(productId);
      } else if (trimmed) {
        mongoIds.add(trimmed);
        slugs.add(trimmed);
      }
    }
  }

  return {
    productIds: [...productIds],
    mongoIds: [...mongoIds],
    slugs: [...slugs],
  };
}

export function buildCartProductLookup<T extends CartProductLookupRow>(rows: T[]) {
  const lookup = new Map<string, T>();

  // Populate slug fallbacks first so a matching legacy identifier always wins,
  // independent of the order in which PostgreSQL returns catalog rows.
  for (const row of rows) {
    if (row.slug) lookup.set(`reference:${row.slug}`, row);
  }
  for (const row of rows) {
    lookup.set(`id:${row.id}`, row);

    if (row.mongoId) {
      lookup.set(`mongo:${row.mongoId}`, row);
      lookup.set(`reference:${row.mongoId}`, row);
    }
  }

  return lookup;
}
