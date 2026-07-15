import { inArray, or, sql } from 'drizzle-orm';

import type { getDb } from '../../db/src/client';
import { orders, products } from '../../db/src/schema';
import {
  DEGRADED_CAPTURE_VARIANT,
  buildOrderProductSummaries,
  coerceDeliveryType,
  coerceNoAnswerCount,
  coerceOrderStatus,
  getOrderFullName,
  isMongoObjectId,
  parseNumericAmount,
  type OrderRecord,
  type OrderStatusHistoryRecord,
} from './orders-support';
import { applyPromoToOrderProducts } from './storefront/promos';

type Database = ReturnType<typeof getDb>;

export type ProductLookupEntry = {
  id: number;
  mongoId: string | null;
  brandId: number | null;
  slug: string | null;
  title: string;
  price: number;
  thumbnailUrl: string | null;
};

export async function getOrderProductLookup(
  db: Database,
  rows: Array<Pick<typeof orders.$inferSelect, 'cartProducts'>>,
) {
  const productIds = [...new Set(
    rows
      .flatMap((row) => row.cartProducts ?? [])
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value))
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0),
  )];
  const mongoIds = [...new Set(
    rows
      .flatMap((row) => row.cartProducts ?? [])
      .map((value) => value.trim())
      .filter((value) => isMongoObjectId(value)),
  )];
  const slugs = [...new Set(
    rows
      .flatMap((row) => row.cartProducts ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && !/^\d+$/.test(value) && !isMongoObjectId(value)),
  )];

  if (productIds.length === 0 && mongoIds.length === 0 && slugs.length === 0) {
    return new Map<string, ProductLookupEntry>();
  }

  const productRows = await db
    .select({
      id: products.id,
      mongoId: products.mongoId,
      brandId: products.brandId,
      slug: products.slug,
      title: products.title,
      price: sql<number>`coalesce(${products.price}, 0)::double precision`,
      images: products.images,
    })
    .from(products)
    .where(or(
      ...(productIds.length > 0 ? [inArray(products.id, productIds)] : []),
      ...(mongoIds.length > 0 ? [inArray(products.mongoId, mongoIds)] : []),
      ...(slugs.length > 0 ? [inArray(products.slug, slugs)] : []),
    ));

  const lookup = new Map<string, ProductLookupEntry>();

  for (const product of productRows) {
    const entry = {
      id: product.id,
      mongoId: product.mongoId,
      brandId: product.brandId,
      slug: product.slug,
      title: product.title,
      price: parseNumericAmount(product.price),
      thumbnailUrl: product.images[0] ?? null,
    };

    lookup.set(`id:${product.id}`, entry);

    if (product.mongoId) {
      lookup.set(`mongo:${product.mongoId}`, entry);
    }
    if (product.slug) {
      lookup.set(`slug:${product.slug}`, entry);
    }
  }

  return lookup;
}

export function toOrderRecord(
  row: typeof orders.$inferSelect,
  history: OrderStatusHistoryRecord[] = [],
  productLookup: Map<string, ProductLookupEntry> = new Map(),
): OrderRecord {
  const confirmed = coerceOrderStatus(row.confirmed);
  const noAnswerCount = coerceNoAnswerCount(confirmed, row.noAnswerCount, row.confirmed);
  const deliveryFee = parseNumericAmount(row.delPr);
  const subtotalOverride = row.price === null ? null : parseNumericAmount(row.price);
  const rawOrderProducts = buildOrderProductSummaries(row.cartProducts ?? [], (_rawValue, productId) => {
    const rawValue = _rawValue.trim();
    const lookupKey = isMongoObjectId(rawValue)
      ? `mongo:${rawValue}`
      : productId !== null
        ? `id:${productId}`
        : `slug:${rawValue}`;

    const product = productLookup.get(lookupKey);

    if (!product) {
      return {
        missing: true,
      };
    }

    return {
      productId: product.id,
      brandId: product.brandId,
      ...(product.slug !== null ? { slug: product.slug } : {}),
      title: product.title,
      unitPrice: product.price,
      thumbnailUrl: product.thumbnailUrl,
      missing: false,
    };
  });
  const promoDiscountAmount = parseNumericAmount(row.promoDiscountAmount);
  const orderProducts = applyPromoToOrderProducts(rawOrderProducts, {
    productId: row.promoProductId,
    discountAmount: promoDiscountAmount,
  });
  const derivedSubtotal = rawOrderProducts.reduce((sum, product) => sum + product.lineTotal, 0);
  const productSubtotal = subtotalOverride ?? derivedSubtotal;
  const totalAmount = productSubtotal + deliveryFee;

  return {
    id: row.id,
    publicToken: row.publicToken ?? null,
    ecotrackTrackingNumber: row.ecotrackTrackingNumber ?? null,
    variant: row.variant ?? null,
    isDegradedCapture: row.variant === DEGRADED_CAPTURE_VARIANT,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: getOrderFullName(row.firstName, row.lastName, row.phoneNumber1),
    email: row.email,
    phoneNumber1: row.phoneNumber1,
    phoneNumber2: row.phoneNumber2,
    cartProducts: row.cartProducts ?? [],
    orderProducts,
    delivery: coerceDeliveryType(row.delivery),
    state: row.state,
    city: row.city,
    homeAddress: row.homeAddress,
    subtotalOverride,
    productSubtotal,
    deliveryFee,
    totalAmount,
    promoCode: row.promoCode ?? null,
    promoProductId: row.promoProductId ?? null,
    promoOriginalSubtotal: row.promoOriginalSubtotal === null ? null : parseNumericAmount(row.promoOriginalSubtotal),
    promoDiscountAmount,
    promoFinalSubtotal: row.promoFinalSubtotal === null ? null : parseNumericAmount(row.promoFinalSubtotal),
    note: row.note,
    confirmed,
    noAnswerCount,
    confirmedBy: row.confirmedBy,
    confirmedByName: row.confirmedByName,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    hasStatusHistory: history.length > 0,
    statusHistory: history,
  };
}

export function toStorefrontOrderRecord(
  row: typeof orders.$inferSelect,
  history: OrderStatusHistoryRecord[] = [],
  productLookup: Map<string, ProductLookupEntry> = new Map(),
) {
  const record = toOrderRecord(row, history, productLookup);

  return {
    id: record.id,
    publicToken: record.publicToken ?? null,
    variant: record.variant ?? null,
    isDegradedCapture: Boolean(record.isDegradedCapture),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    firstName: record.firstName,
    lastName: record.lastName,
    fullName: record.fullName,
    email: record.email ?? null,
    phoneNumber1: record.phoneNumber1,
    phoneNumber2: record.phoneNumber2,
    cartProducts: record.cartProducts,
    orderProducts: record.orderProducts,
    delivery: record.delivery,
    state: record.state,
    city: record.city,
    homeAddress: record.homeAddress,
    subtotalOverride: record.subtotalOverride,
    productSubtotal: record.productSubtotal,
    deliveryFee: record.deliveryFee,
    totalAmount: record.totalAmount,
    promoCode: record.promoCode,
    promoProductId: record.promoProductId,
    promoOriginalSubtotal: record.promoOriginalSubtotal,
    promoDiscountAmount: record.promoDiscountAmount,
    promoFinalSubtotal: record.promoFinalSubtotal,
    note: record.note,
    confirmed: record.confirmed,
    noAnswerCount: record.noAnswerCount,
    confirmedAt: record.confirmedAt,
    hasStatusHistory: record.hasStatusHistory,
    statusHistory: record.statusHistory.map((entry) => ({
      id: entry.id,
      status: entry.status,
      noAnswerCount: entry.noAnswerCount,
      changedAt: entry.changedAt,
    })),
  };
}
