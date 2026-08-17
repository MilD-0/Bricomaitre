import { isMongoObjectId, parseOrderProductId } from './orders';

type CartProductReferenceBuckets = {
  productIds: number[];
  mongoIds: string[];
};

type CartProductLookupRow = {
  id: number;
  mongoId: string | null;
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
  return productId === null ? null : `id:${productId}`;
}

export function collectCartProductReferenceBuckets(
  rows: Array<{ cartProducts: string[] | null }>,
): CartProductReferenceBuckets {
  const productIds = new Set<number>();
  const mongoIds = new Set<string>();

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
      }
    }
  }

  return {
    productIds: [...productIds],
    mongoIds: [...mongoIds],
  };
}

export function buildCartProductLookup<T extends CartProductLookupRow>(rows: T[]) {
  const lookup = new Map<string, T>();

  for (const row of rows) {
    lookup.set(`id:${row.id}`, row);

    if (row.mongoId) {
      lookup.set(`mongo:${row.mongoId}`, row);
    }
  }

  return lookup;
}
