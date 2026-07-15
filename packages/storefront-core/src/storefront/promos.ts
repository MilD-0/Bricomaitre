import { and, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import type { getDb } from '../../../db/src/client';
import { productPromoCodes, products } from '../../../db/src/schema';
import { isMongoObjectId, parseNumericAmount, type OrderProductSummary } from '../orders-support';

type Database = ReturnType<typeof getDb>;

export type ActiveProductPromo = {
  code: string;
  productId: number;
  originalPrice: number;
  promoPrice: number;
  discountAmount: number;
};

export type ResolvedOrderPromo = ActiveProductPromo & {
  originalSubtotal: number;
  finalSubtotal: number;
};

export function normalizePromoCode(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function activePromoWindow(now: Date) {
  return and(
    eq(productPromoCodes.active, true),
    or(isNull(productPromoCodes.startsAt), lte(productPromoCodes.startsAt, now)),
    or(isNull(productPromoCodes.endsAt), gt(productPromoCodes.endsAt, now)),
  );
}

export async function readActiveProductPromo(
  db: Database,
  input: {
    productId: number;
    code: string | null | undefined;
    now?: Date;
  },
): Promise<ActiveProductPromo | null> {
  const normalizedCode = normalizePromoCode(input.code);
  if (!normalizedCode) {
    return null;
  }

  const [row] = await db
    .select({
      code: productPromoCodes.code,
      productId: productPromoCodes.productId,
      promoPrice: sql<number>`${productPromoCodes.promoPrice}::double precision`,
      originalPrice: sql<number>`${products.price}::double precision`,
    })
    .from(productPromoCodes)
    .innerJoin(products, eq(products.id, productPromoCodes.productId))
    .where(and(
      eq(productPromoCodes.productId, input.productId),
      eq(productPromoCodes.normalizedCode, normalizedCode),
      eq(products.active, true),
      activePromoWindow(input.now ?? new Date()),
    ))
    .limit(1);

  if (!row) {
    return null;
  }

  const originalPrice = parseNumericAmount(row.originalPrice);
  const promoPrice = parseNumericAmount(row.promoPrice);
  const discountAmount = Math.max(0, originalPrice - promoPrice);

  if (discountAmount <= 0) {
    return null;
  }

  return {
    code: row.code,
    productId: row.productId,
    originalPrice,
    promoPrice,
    discountAmount,
  };
}

export async function resolveOrderPromo(
  db: Database,
  input: {
    cartProducts: string[];
    promoCode: string | null | undefined;
    now?: Date;
  },
): Promise<ResolvedOrderPromo | null> {
  const normalizedCode = normalizePromoCode(input.promoCode);
  if (!normalizedCode || input.cartProducts.length === 0) {
    return null;
  }

  const productIds = [...new Set(
    input.cartProducts
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value))
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0),
  )];
  const mongoIds = [...new Set(
    input.cartProducts
      .map((value) => value.trim())
      .filter((value) => isMongoObjectId(value)),
  )];
  const slugs = [...new Set(
    input.cartProducts
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && !/^\d+$/.test(value) && !isMongoObjectId(value)),
  )];

  if (productIds.length === 0 && mongoIds.length === 0 && slugs.length === 0) {
    return null;
  }

  const productRows = await db
    .select({
      productId: products.id,
      mongoId: products.mongoId,
      slug: products.slug,
      originalPrice: sql<number>`${products.price}::double precision`,
    })
    .from(products)
    .where(and(
      eq(products.active, true),
      or(
        ...(productIds.length > 0 ? [inArray(products.id, productIds)] : []),
        ...(mongoIds.length > 0 ? [inArray(products.mongoId, mongoIds)] : []),
        ...(slugs.length > 0 ? [inArray(products.slug, slugs)] : []),
      ),
    ));

  if (productRows.length === 0) {
    return null;
  }

  const rows = await db
    .select({
      code: productPromoCodes.code,
      productId: products.id,
      mongoId: products.mongoId,
      slug: products.slug,
      promoPrice: sql<number>`${productPromoCodes.promoPrice}::double precision`,
      originalPrice: sql<number>`${products.price}::double precision`,
    })
    .from(productPromoCodes)
    .innerJoin(products, eq(products.id, productPromoCodes.productId))
    .where(and(
      eq(productPromoCodes.normalizedCode, normalizedCode),
      eq(products.active, true),
      or(
        ...(productIds.length > 0 ? [inArray(products.id, productIds)] : []),
        ...(mongoIds.length > 0 ? [inArray(products.mongoId, mongoIds)] : []),
        ...(slugs.length > 0 ? [inArray(products.slug, slugs)] : []),
      ),
      activePromoWindow(input.now ?? new Date()),
    ));

  const discountableRows = rows
    .map((row) => ({
      ...row,
      originalPrice: parseNumericAmount(row.originalPrice),
      promoPrice: parseNumericAmount(row.promoPrice),
    }))
    .filter((row) => row.originalPrice > row.promoPrice);

  if (discountableRows.length !== 1) {
    return null;
  }

  const promo = discountableRows[0];
  const matchingQuantity = input.cartProducts.filter((value) => {
    const trimmed = value.trim();
    return trimmed === String(promo.productId)
      || (promo.mongoId !== null && trimmed === promo.mongoId)
      || (promo.slug !== null && trimmed === promo.slug);
  }).length;

  if (matchingQuantity <= 0) {
    return null;
  }

  const originalSubtotal = input.cartProducts.reduce((sum, value) => {
    const trimmed = value.trim();
    if (trimmed === String(promo.productId)
      || (promo.mongoId !== null && trimmed === promo.mongoId)
      || (promo.slug !== null && trimmed === promo.slug)) {
      return sum + promo.originalPrice;
    }

    const otherRow = productRows.find((row) => trimmed === String(row.productId)
      || (row.mongoId !== null && trimmed === row.mongoId)
      || (row.slug !== null && trimmed === row.slug));
    return sum + parseNumericAmount(otherRow?.originalPrice);
  }, 0);
  const discountAmount = Math.max(0, (promo.originalPrice - promo.promoPrice) * matchingQuantity);
  const finalSubtotal = Math.max(0, originalSubtotal - discountAmount);

  return {
    code: promo.code,
    productId: promo.productId,
    originalPrice: promo.originalPrice,
    promoPrice: promo.promoPrice,
    discountAmount,
    originalSubtotal,
    finalSubtotal,
  };
}

export function applyPromoToOrderProducts(
  orderProducts: OrderProductSummary[],
  promo: {
    productId: number | null;
    discountAmount: number;
  } | null,
) {
  if (!promo || promo.productId === null || promo.discountAmount <= 0) {
    return orderProducts;
  }

  return orderProducts.map((product) => {
    if (product.productId !== promo.productId || product.quantity <= 0) {
      return product;
    }

    const lineTotal = Math.max(0, product.lineTotal - promo.discountAmount);
    const unitPrice = lineTotal / product.quantity;

    return {
      ...product,
      unitPrice,
      lineTotal,
    };
  });
}
